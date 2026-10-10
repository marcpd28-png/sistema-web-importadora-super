"""Private Messenger handoff service. No messages are sent by this service."""
import hmac
import json
import os
import re
import sqlite3
import subprocess
import threading
import time
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PAGE = '672402872630913'
APP = '1375511127112154'
# Observed via thread_owner on a conversation marked "Tu agente de IA está
# respondiendo" in this Page's Meta Business Suite; round-trip verified on test contact.
META_AI_APP = '928891643393937'
WORKSPACE = '11727941065966601'
INTEGRATION = '11730778652001686'


class ControlError(Exception):
    pass


def identifier(value):
    if not isinstance(value, str) or not re.fullmatch(r'[0-9]{1,25}', value):
        raise ControlError('Conversación no válida.')
    return value


class Provider:
    def __init__(self, token):
        self.token = token

    def resolve(self, cid):
        identifier(cid)
        # Identifiers above are fixed installation bindings; cid is digits only.
        query = f'''SELECT row_to_json(t) FROM (SELECT ci."sourceId" AS recipient,
            c."botEnabled" AS bot, i.auth FROM "Conversation" c
            JOIN "ContactInbox" ci ON ci."contactId"=c."contactId"
            JOIN "IntegrationMessenger" i ON i."inboxId"=ci."inboxId"
            WHERE c.id={cid} AND c."workspaceId"={WORKSPACE}
            AND i.id={INTEGRATION} AND i."workspaceId"={WORKSPACE}
            AND i."pageId"='{PAGE}' AND ci.channel='messenger') t;'''
        result = subprocess.run(['docker', 'exec', '-i', 'chatbotx-postgres', 'sh', '-c',
            'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -At'],
            input=query, text=True, capture_output=True, timeout=20)
        lines = result.stdout.strip().splitlines()
        if result.returncode or len(lines) != 1:
            raise ControlError('No se pudo verificar esta conversación de Importaciones super.')
        result = json.loads(lines[0])
        identifier(result['recipient'])
        return result

    def request(self, url, token, data=None, allow_owner_lookup_fallback=False):
        req = urllib.request.Request(url, headers={'Authorization': 'Bearer '+token,
            'Content-Type': 'application/json'}, data=None if data is None else json.dumps(data).encode())
        try:
            with urllib.request.urlopen(req, timeout=15) as response:
                return json.load(response)
        except urllib.error.HTTPError as error:
            try:
                code = json.load(error).get('error', {}).get('code')
            except Exception:
                code = None
            # Some Page/coexistence combinations do not expose thread_owner in
            # newer Graph versions. A successful take/pass response is still
            # authoritative, so do not let an optional status lookup block
            # the manual inbox.
            if code == 100 and allow_owner_lookup_fallback:
                return None
            raise ControlError('El proveedor rechazó el cambio de control'+(f' (código {code}).' if isinstance(code, int) else '.')) from None
        except Exception:
            raise ControlError('No se pudo confirmar el cambio. Actualiza el estado antes de repetirlo.') from None

    def graph(self, context, operation):
        auth = context['auth']
        version = auth.get('version', 'v25.0')
        if not re.fullmatch(r'v[0-9]+\.[0-9]+', version):
            raise ControlError('Versión de Facebook no válida.')
        url = f'https://graph.facebook.com/{version}/me/'
        if operation == 'owner':
            result = self.request(url+'thread_owner?recipient='+context['recipient'], auth['tokens']['accessToken'],
                                  allow_owner_lookup_fallback=True)
            if result is None:
                return {'owner': 'unknown', 'expiresAt': None, 'ownerVerified': False}
            entries = result.get('data', [])
            owner = entries[0].get('thread_owner', {}) if entries else {}
            return {'owner': 'store' if str(owner.get('app_id')) == APP else 'meta' if str(owner.get('app_id')) == META_AI_APP else 'other' if owner.get('app_id') else 'unknown',
                    'expiresAt': owner.get('expiration'), 'ownerVerified': True}
        owner = self.graph(context, 'owner')
        # Meta rejects another take_thread_control while this Page application
        # already owns the thread (observed as provider code 27). Treat the
        # handoff action as idempotent instead of making a redundant mutation.
        if (operation == 'take' and owner['owner'] == 'store') or (operation == 'meta' and owner['owner'] == 'meta'):
            return
        result = self.request(url+'take_thread_control', auth['tokens']['accessToken'],
                              {'recipient': {'id': context['recipient']}})
        if result.get('success') is not True:
            raise ControlError('Facebook no confirmó que la tienda tomara el control.')
        if operation == 'meta':
            result = self.request(url+'pass_thread_control', auth['tokens']['accessToken'],
                {'recipient': {'id': context['recipient']}, 'target_app_id': META_AI_APP})
            if result.get('success') is not True:
                raise ControlError('Facebook no confirmó la transferencia a su IA.')
        expected = 'meta' if operation == 'meta' else 'store'
        observed = self.graph(context, 'owner')
        if observed['ownerVerified'] and observed['owner'] != expected:
            raise ControlError('Facebook todavía no confirma quién controla la conversación. Actualiza el estado.')

    def bot(self, cid, enabled):
        self.request(f'https://chatbot.tiendavirtualsuper.com/api/v1/conversations/{cid}/'+
                     ('enable-bot' if enabled else 'disable-bot'), self.token, {})


class Controller:
    def __init__(self, path, provider, clock=time.time):
        self.db = sqlite3.connect(path, check_same_thread=False)
        self.db.row_factory = sqlite3.Row
        self.db.execute('PRAGMA journal_mode=WAL')
        self.db.execute('''CREATE TABLE IF NOT EXISTS control (
          id TEXT PRIMARY KEY, mode TEXT NOT NULL, resume_at REAL, next_check REAL NOT NULL,
          error TEXT, actor TEXT NOT NULL, updated_at REAL NOT NULL)''')
        self.db.execute('''CREATE TABLE IF NOT EXISTS audit (
          id INTEGER PRIMARY KEY, conversation_id TEXT, action TEXT, actor TEXT, created_at REAL)''')
        if 'resume_target' not in [row[1] for row in self.db.execute('PRAGMA table_info(control)')]:
            # Preserve existing schedules: they were explicitly for the store bot.
            self.db.execute("ALTER TABLE control ADD COLUMN resume_target TEXT NOT NULL DEFAULT 'bot'")
        self.db.commit()
        self.provider, self.clock, self.lock = provider, clock, threading.RLock()

    def write(self, cid, mode, resume, error, actor, delay=3600, resume_target='bot'):
        self.db.execute('INSERT OR REPLACE INTO control VALUES (?,?,?,?,?,?,?,?)',
                        (cid, mode, resume, self.clock()+delay, error, actor, self.clock(), resume_target))
        self.db.commit()

    def audit(self, cid, action, actor):
        self.db.execute('INSERT INTO audit(conversation_id,action,actor,created_at) VALUES (?,?,?,?)',
                        (cid, action, actor, self.clock()))
        self.db.commit()

    def status(self, cid):
        with self.lock:
            context = self.provider.resolve(identifier(cid))
            row = self.db.execute('SELECT * FROM control WHERE id=?', (cid,)).fetchone()
            owner = self.provider.graph(context, 'owner')
            # If Facebook refuses the optional owner lookup, preserve the
            # state written after the last confirmed take/pass operation.
            # The UI labels this as a local confirmation rather than claiming
            # Facebook verified it in real time.
            if owner['owner'] == 'unknown' and row:
                inferred = {'manual': 'store', 'bot': 'store', 'meta': 'meta'}.get(row['mode'])
                if inferred:
                    owner = {**owner, 'owner': inferred}
            return {**owner, 'botEnabled': context['bot'], 'mode': row['mode'] if row else 'unmanaged',
                    'resumeAt': row['resume_at'] if row else None, 'error': row['error'] if row else None,
                    'resumeTarget': row['resume_target'] if row else None, 'metaAiAvailable': True}

    def apply(self, cid, action, minutes, actor, resume_target='bot'):
        if action not in ('manual', 'bot', 'meta') or resume_target not in ('bot', 'meta'):
            raise ControlError('Acción no válida.')
        if type(minutes) is not int or not 0 <= minutes <= 10080:
            raise ControlError('Indica entre 0 y 10080 minutos.')
        with self.lock:
            context = self.provider.resolve(identifier(cid))
            resume = self.clock()+minutes*60 if action == 'manual' and minutes else None
            # Persist intent before network calls; cancel old jobs even on a partial failure.
            self.write(cid, 'manual', None, 'Cambio pendiente de confirmar.', actor, 60)
            self.audit(cid, action, actor)
            try:
                self.provider.bot(cid, False)
                self.provider.graph(context, 'meta' if action == 'meta' else 'take')
                if action == 'bot':
                    self.provider.bot(cid, True)
                self.write(cid, action, resume, None, actor, resume_target=resume_target)
            except ControlError as error:
                self.write(cid, 'manual', None, str(error), actor, 60)
                raise
            return self.status(cid)

    def tick(self):
        with self.lock:
            rows = self.db.execute("SELECT * FROM control WHERE mode='manual' AND (next_check<=? OR resume_at<=?)",
                                   (self.clock(), self.clock())).fetchall()
            for row in rows:
                cid = row['id']
                try:
                    context = self.provider.resolve(cid)
                    due = row['resume_at'] is not None and row['resume_at'] <= self.clock()
                    self.provider.bot(cid, False)
                    self.provider.graph(context, 'meta' if due and row['resume_target'] == 'meta' else 'take')
                    if due:
                        target = row['resume_target']
                        if target == 'bot':
                            self.provider.bot(cid, True)
                        self.write(cid, target, None, None, row['actor'], resume_target=target)
                        self.audit(cid, 'scheduled-'+target, 'scheduler')
                    else:
                        self.write(cid, 'manual', row['resume_at'], None, row['actor'], resume_target=row['resume_target'])
                except Exception:
                    # Fail closed. A failed activation is never shown as successful.
                    self.write(cid, 'manual', None, 'No se confirmó el cambio automático. Revisa la conexión y vuelve a programarlo.', row['actor'], 60)


def serve():
    config = json.load(open(os.environ.get('MESSENGER_CONTROL_CONFIG', '/etc/importadora-messenger-control.json')))
    controller = Controller(config['database'], Provider(config['socialToken']))
    def worker():
        while True:
            try:
                controller.tick()
            except Exception:
                print('Messenger control scheduler: operation failed', flush=True)
            time.sleep(15)
    threading.Thread(target=worker, daemon=True).start()

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_):
            pass  # No identifiers, bodies, or credentials in HTTP logs.

        def handle_request(self):
            if not hmac.compare_digest(self.headers.get('Authorization', ''), 'Bearer '+config['serviceToken']):
                return self.reply(401, {'error': 'No autorizado.'})
            match = re.fullmatch(r'/conversations/([0-9]{1,25})', self.path)
            if not match:
                return self.reply(404, {'error': 'Ruta no válida.'})
            try:
                if self.command == 'GET':
                    result = controller.status(match[1])
                else:
                    length = int(self.headers.get('Content-Length', 0))
                    if not 0 < length <= 2048:
                        raise ControlError('Solicitud no válida.')
                    data = json.loads(self.rfile.read(length))
                    result = controller.apply(match[1], data.get('action'), data.get('minutes', 0), str(data.get('actor', 'admin'))[:100], data.get('resumeTarget', 'bot'))
                self.reply(200, result)
            except ControlError as error:
                self.reply(409, {'error': str(error)})
            except Exception:
                self.reply(503, {'error': 'El control de Messenger no está disponible. Actualiza el estado.'})

        def reply(self, status, data):
            body = json.dumps(data).encode()
            self.send_response(status)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        do_GET = handle_request
        do_POST = handle_request

    ThreadingHTTPServer(('127.0.0.1', 19120), Handler).serve_forever()


if __name__ == '__main__':
    serve()
