"""Private, durable store inbox integration for the existing Telegram bridge."""
import hashlib
import hmac
import json
import mimetypes
import sqlite3
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from pathlib import Path


class InboxError(Exception):
    def __init__(self, message, status=400, uncertain=False):
        super().__init__(message)
        self.status, self.uncertain = status, uncertain


class Inbox:
    def __init__(self, path, config, raw_api, now=time.time):
        self.config, self.raw_api, self.now = config, raw_api, now
        self.secret = config.get('inbox_secret', '')
        self.url = config.get('inbox_url', '')
        self.lock = threading.RLock()
        self.explicit = threading.local()
        self.db = sqlite3.connect(path, check_same_thread=False)
        self.db.execute('PRAGMA journal_mode=WAL')
        self.db.executescript('''
          CREATE TABLE IF NOT EXISTS inbox_events(id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT UNIQUE, payload TEXT, sent INTEGER DEFAULT 0);
          CREATE TABLE IF NOT EXISTS inbox_chats(connection TEXT, chat TEXT, last_inbound REAL DEFAULT 0, paused INTEGER DEFAULT 0, revision INTEGER DEFAULT 0, PRIMARY KEY(connection,chat));
          CREATE TABLE IF NOT EXISTS inbox_sends(id TEXT PRIMARY KEY, fingerprint TEXT, state TEXT, response TEXT);
        ''')
        self.db.execute("UPDATE inbox_sends SET state='uncertain' WHERE state='sending'")
        self.db.commit()

    @property
    def enabled(self):
        return len(self.secret) >= 32 and bool(self.url)

    def authorized(self, value):
        return self.enabled and hmac.compare_digest(value or '', 'Bearer '+self.secret)

    def enqueue(self, event, key=None):
        if not self.enabled: return
        event = dict(event, eventId=key or str(uuid.uuid4()))
        with self.lock:
            self.db.execute('INSERT OR IGNORE INTO inbox_events(key,payload) VALUES (?,?)',
                            (event['eventId'], json.dumps(event, ensure_ascii=False)))
            self.db.commit()

    def message(self, m, sender, kind='message', local_id=None, event_key=None):
        cid, chat = m.get('business_connection_id'), m.get('chat', {}).get('id')
        if not cid or not chat or not m.get('message_id'): return
        person = m.get('from', {}) if sender == 'CUSTOMER' else m.get('chat', {})
        name = ' '.join(filter(None, (person.get('first_name'), person.get('last_name')))) or person.get('username') or 'Cliente de Telegram'
        event = dict(kind=kind, connectionId=cid, chatId=str(chat), messageId=m['message_id'],
                     sender=sender, name=name[:180], timestamp=int(m.get('date', self.now())),
                     content=m.get('text') or m.get('caption') or '', type='TEXT')
        for field, kind_name in [('photo','IMAGE'),('video','VIDEO'),('animation','VIDEO'),('audio','AUDIO'),('voice','AUDIO'),('document','DOCUMENT'),('sticker','DOCUMENT')]:
            media = m.get(field)
            if not media: continue
            if isinstance(media, list): media = media[-1]
            event.update(type=kind_name, fileId=media['file_id'])
            if media.get('file_name'): event['filename'] = media['file_name'][:255]
            if not event['content']: event['content'] = {'IMAGE':'Imagen','VIDEO':'Video','AUDIO':'Audio','DOCUMENT':'Documento'}[kind_name]
            break
        if not event['content']: event['content'] = '[Mensaje de Telegram]'
        if local_id: event['localMessageId'] = local_id
        if m.get('reply_to_message'): event['replyToMessageId'] = m['reply_to_message']['message_id']
        self.enqueue(event, event_key)

    def observe(self, update, adapter):
        """Runs under the adapter lock before automation; never sends a Telegram message."""
        deletion = update.get('deleted_business_messages')
        m = update.get('business_message') or update.get('edited_business_message')
        obj = deletion or m
        if not obj or obj.get('chat', {}).get('type') != 'private': return
        cid, chat = obj.get('business_connection_id'), obj['chat']['id']
        connection = adapter.get_connection(cid) if cid else None
        if not connection: return
        if deletion:
            self.enqueue(dict(kind='delete', connectionId=cid, chatId=str(chat), timestamp=int(self.now()), messageIds=deletion['message_ids']), 'update:'+str(update['update_id']))
            return
        sender = m.get('from', {})
        role = 'BOT' if m.get('sender_business_bot') or sender.get('is_bot') else 'AGENT' if sender.get('id') == connection[0] else 'CUSTOMER'
        kind = 'edit' if 'edited_business_message' in update else 'message'
        self.message(m, role, kind, event_key='update:'+str(update['update_id']))
        if kind == 'message' and role == 'CUSTOMER':
            with self.lock:
                self.db.execute('INSERT OR IGNORE INTO inbox_chats(connection,chat) VALUES (?,?)', (cid,str(chat)))
                self.db.execute('UPDATE inbox_chats SET last_inbound=max(last_inbound,?) WHERE connection=? AND chat=?', (m.get('date', self.now()),cid,str(chat)))
                self.db.commit()
        elif kind == 'message' and role == 'AGENT':
            self.set_paused(cid, chat, True)

    def paused(self, cid, chat):
        with self.lock:
            row = self.db.execute('SELECT paused FROM inbox_chats WHERE connection=? AND chat=?', (cid,str(chat))).fetchone()
            return bool(row and row[0])

    def set_paused(self, cid, chat, value):
        with self.lock:
            self.db.execute('INSERT OR IGNORE INTO inbox_chats(connection,chat) VALUES (?,?)', (cid,str(chat)))
            self.db.execute('UPDATE inbox_chats SET paused=? WHERE connection=? AND chat=?', (bool(value),cid,str(chat)))
            self.db.commit()

    def snapshot(self, adapter, cid, chat):
        if not cid or not chat: return 0
        if not adapter.get_connection(cid): return 0
        support = adapter.shopping.support_session(cid, int(chat))
        enabled = not self.paused(cid, chat) and not support
        needs = bool(support and support[0] == 'human' and not self.paused(cid, chat))
        with self.lock:
            self.db.execute('INSERT OR IGNORE INTO inbox_chats(connection,chat) VALUES (?,?)', (cid,str(chat)))
            self.db.execute('UPDATE inbox_chats SET revision=revision+1 WHERE connection=? AND chat=?', (cid,str(chat)))
            revision = self.db.execute('SELECT revision FROM inbox_chats WHERE connection=? AND chat=?', (cid,str(chat))).fetchone()[0]
            self.db.commit()
            self.enqueue(dict(kind='control',connectionId=cid,chatId=str(chat),timestamp=int(self.now()),botEnabled=enabled,needsAdvisor=needs,revision=revision))
            return revision

    def command(self, action, data, adapter):
        cid, chat = data.get('connectionId'), data.get('chatId')
        if not isinstance(cid,str) or not isinstance(chat,str) or not chat.isdigit(): raise InboxError('Conversación inválida.')
        with adapter.lock:
            connection = adapter.get_connection(cid)
            if not connection or not connection[1] or not connection[2]: raise InboxError('La conexión de Telegram está desactivada o sin permiso para responder.',409)
            if action == 'control':
                enabled = data.get('botEnabled')
                if not isinstance(enabled,bool): raise InboxError('Estado inválido.')
                self.set_paused(cid,chat,not enabled)
                if enabled: adapter.shopping.leave_support(cid,int(chat))
                else: adapter.shopping.pause(cid,int(chat))
                adapter.db.commit()
                return {'revision':self.snapshot(adapter,cid,chat)}
            if action != 'send': raise InboxError('Acción inválida.')
            rid, kind, content = data.get('requestId'), data.get('type'), data.get('content')
            if not isinstance(rid,str) or not rid.startswith('tgout:') or len(rid)>120: raise InboxError('Identificador inválido.')
            fingerprint = hashlib.sha256(json.dumps(data,sort_keys=True).encode()).hexdigest()
            with self.lock:
                prev = self.db.execute('SELECT fingerprint,state,response FROM inbox_sends WHERE id=?', (rid,)).fetchone()
                if prev:
                    if prev[0] != fingerprint: raise InboxError('La solicitud ya existe con otro contenido.',409)
                    if prev[1] == 'sent': return json.loads(prev[2])
                    raise InboxError('Este envío ya fue procesado. Comprueba la conversación antes de reenviar.',409,prev[1] != 'failed')
                state = self.db.execute('SELECT last_inbound FROM inbox_chats WHERE connection=? AND chat=?',(cid,chat)).fetchone()
            if not state or self.now()-state[0]>=86400: raise InboxError('La ventana de 24 horas de Telegram terminó. Espera un nuevo mensaje del cliente.',409)
            methods = {'TEXT':('sendMessage','text'), 'IMAGE':('sendPhoto','photo'), 'VIDEO':('sendVideo','video'), 'AUDIO':('sendAudio','audio'), 'DOCUMENT':('sendDocument','document')}
            if kind not in methods or not isinstance(content,str) or not 0<len(content)<= (4000 if kind=='TEXT' else 1000): raise InboxError('Mensaje inválido.')
            method,field = methods[kind]
            body = {'business_connection_id':cid,'chat_id':int(chat),'_inbox_request_id':rid}
            if kind=='TEXT': body[field]=content
            else:
                url = data.get('mediaUrl','')
                parsed = urllib.parse.urlsplit(url)
                if parsed.scheme!='https' or parsed.hostname!='tiendavirtualsuper.com' or not parsed.path.startswith('/uploads/') or parsed.username or parsed.port not in (None,443): raise InboxError('El archivo debe pertenecer a la tienda.')
                if kind == 'AUDIO':
                    extension = Path(parsed.path).suffix.lower()
                    if extension == '.ogg': method,field = 'sendVoice','voice'
                    elif extension not in ('.mp3','.m4a'): method,field = 'sendDocument','document'
                body.update({field:url,'caption':content})
            reply = data.get('replyToMessageId')
            if reply is not None:
                if not isinstance(reply,int) or reply<1: raise InboxError('Respuesta inválida.')
                body['reply_parameters']={'message_id':reply}
            self.set_paused(cid,chat,True)
            adapter.shopping.pause(cid,int(chat)); adapter.db.commit()
            revision = self.snapshot(adapter,cid,chat)
            with self.lock:
                self.db.execute('INSERT INTO inbox_sends VALUES (?,?,?,NULL)', (rid,fingerprint,'sending')); self.db.commit()
            try:
                result = self.raw_api(method,body)
                response = {'messageId':result['message_id'],'revision':revision}
                with self.lock:
                    self.db.execute("UPDATE inbox_sends SET state='sent',response=? WHERE id=?", (json.dumps(response),rid)); self.db.commit()
                return response
            except urllib.error.HTTPError as error:
                with self.lock:
                    self.db.execute("UPDATE inbox_sends SET state=? WHERE id=?", ('failed' if error.code<500 else 'uncertain',rid)); self.db.commit()
                raise InboxError('Telegram rechazó el envío. Revisa los permisos, el archivo o el límite de mensajes.',502,error.code>=500) from None
            except Exception:
                with self.lock:
                    self.db.execute("UPDATE inbox_sends SET state='uncertain' WHERE id=?", (rid,)); self.db.commit()
                raise InboxError('No se pudo confirmar el envío. Revisa Telegram antes de reenviar.',502,True) from None

    def status(self, adapter):
        with adapter.lock:
            connected = adapter.db.execute('SELECT count(*) FROM connections WHERE enabled=1 AND reply=1').fetchone()[0]>0
        with self.lock:
            pending = self.db.execute('SELECT count(*) FROM inbox_events WHERE sent=0').fetchone()[0]
        return dict(connected=self.enabled and connected,pending=pending)

    def tick(self):
        if not self.enabled: return False
        with self.lock:
            row = self.db.execute('SELECT id,payload FROM inbox_events WHERE sent=0 ORDER BY id LIMIT 1').fetchone()
        if not row: return False
        req = urllib.request.Request(self.url, data=row[1].encode(), headers={'Authorization':'Bearer '+self.secret,'Content-Type':'application/json','User-Agent':'RockyStoreInbox/1.0'})
        with urllib.request.urlopen(req,timeout=20) as response:
            if response.status != 200: raise RuntimeError('Inbox unavailable')
        with self.lock:
            self.db.execute('UPDATE inbox_events SET sent=1 WHERE id=?',(row[0],)); self.db.commit()
        return True

    def start(self):
        def run():
            while True:
                try:
                    if self.tick(): continue
                except Exception as error: print('inbox_sync_retry '+type(error).__name__,flush=True)
                time.sleep(3)
        threading.Thread(target=run,daemon=True).start()

    def media(self, handler, file_id):
        if not file_id or len(file_id)>1024: raise InboxError('Archivo inválido.')
        item = self.raw_api('getFile',{'file_id':file_id})
        path = item.get('file_path','')
        if path.startswith('/'):
            # Local Bot API returns a path in its shared data mount, not an arbitrary host file.
            target = Path('/telegram-files') / path.removeprefix('/var/lib/telegram-bot-api/')
            root = Path('/telegram-files').resolve()
            resolved = target.resolve()
            if root not in resolved.parents or not resolved.is_file(): raise InboxError('Archivo no disponible.',404)
            size = resolved.stat().st_size
            start,end,status = 0,size-1,200
            range_header = handler.headers.get('Range','')
            if range_header:
                import re
                match = re.fullmatch(r'bytes=(\d*)-(\d*)',range_header)
                if not match or not any(match.groups()): raise InboxError('Rango inválido.',416)
                a,b = match.groups()
                start = int(a) if a else max(0,size-int(b))
                end = min(int(b),size-1) if a and b else size-1
                if start>end or start>=size: raise InboxError('Rango inválido.',416)
                status=206
            handler.send_response(status)
            handler.send_header('Content-Type',mimetypes.guess_type(path)[0] or 'application/octet-stream')
            handler.send_header('Content-Length',str(end-start+1)); handler.send_header('Accept-Ranges','bytes')
            if status==206: handler.send_header('Content-Range',f'bytes {start}-{end}/{size}')
            handler.end_headers()
            with resolved.open('rb') as source:
                source.seek(start); remaining=end-start+1
                while remaining:
                    chunk=source.read(min(65536,remaining))
                    if not chunk: break
                    handler.wfile.write(chunk); remaining-=len(chunk)
            return
        if not path or '..' in path.split('/'): raise InboxError('Archivo no disponible.',404)
        url = self.config.get('api_base','https://api.telegram.org').rstrip('/')+'/file/bot'+self.config['token']+'/'+urllib.parse.quote(path,safe='/')
        headers = {}
        if handler.headers.get('Range'): headers['Range']=handler.headers['Range']
        with urllib.request.urlopen(urllib.request.Request(url,headers=headers),timeout=45) as response:
            handler.send_response(response.status)
            for key in ('Content-Type','Content-Length','Content-Range','Accept-Ranges'):
                value=response.headers.get(key)
                if value: handler.send_header(key,value)
            handler.end_headers()
            while chunk:=response.read(65536): handler.wfile.write(chunk)


def handle(inbox, adapter, handler):
    path = urllib.parse.urlsplit(handler.path).path
    if not path.startswith('/inbox/'): return False
    if not inbox.authorized(handler.headers.get('Authorization')):
        handler.reply(401,{'error':'No autorizado'}); return True
    try:
        if handler.command=='GET' and path=='/inbox/status': handler.reply(200,inbox.status(adapter))
        elif handler.command=='GET' and path=='/inbox/media': inbox.media(handler,urllib.parse.parse_qs(urllib.parse.urlsplit(handler.path).query).get('fileId',[''])[0])
        elif handler.command=='POST' and path in ('/inbox/send','/inbox/control'):
            size=int(handler.headers.get('Content-Length','0'))
            if not 1<=size<=32000: raise InboxError('Solicitud demasiado grande.',413)
            handler.connection.settimeout(40)
            data=json.loads(handler.rfile.read(size))
            if not isinstance(data,dict): raise InboxError('Solicitud inválida.')
            handler.reply(200,inbox.command(path.rsplit('/',1)[-1],data,adapter))
        else: handler.reply(404,{'error':'No encontrado'})
    except InboxError as error: handler.reply(error.status,{'error':str(error),'uncertain':error.uncertain})
    except (ValueError,TypeError): handler.reply(400,{'error':'Solicitud inválida'})
    except Exception: handler.reply(502,{'error':'No se pudo completar la operación de Telegram','uncertain':True})
    return True
