import json
import os
import sys
import unittest
import urllib.error
from io import BytesIO
from unittest.mock import patch
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent))
from inbox import Inbox, InboxError, handle

class Shopping:
    def support_session(self,*args): return None
    def pause(self,*args): pass
    def leave_support(self,*args): pass
class Database:
    def commit(self): pass
    def execute(self,*args): return self
    def fetchone(self): return (1,)
class Adapter:
    def __init__(self):
        import threading
        self.lock=threading.Lock()
        self.shopping=Shopping()
        self.db=Database()
    def get_connection(self,cid): return (1,1,1) if cid=='linked' else None

class InboxTests(unittest.TestCase):
    def setUp(self):
        self.calls=[]
        self.now=200000
        def send(method,body):
            self.calls.append((method,body)); return {'message_id':33}
        self.inbox=Inbox(':memory:',{'inbox_secret':'x'*40,'inbox_url':'https://example.test','super_bot_silence_seconds':0},send,now=lambda:self.now)
        self.adapter=Adapter()
        self.message={'message_id':7,'business_connection_id':'linked','chat':{'id':2,'type':'private'},'from':{'id':2,'first_name':'Cliente'},'date':self.now,'text':'Hola'}
        self.inbox.observe({'update_id':11,'business_message':self.message},self.adapter)
        self.request={'connectionId':'linked','chatId':'2','requestId':'tgout:test','type':'TEXT','content':'Respuesta'}
    def tearDown(self):
        self.inbox.db.close()
    def test_auth_requires_configured_secret(self):
        self.assertFalse(self.inbox.authorized(None)); self.assertFalse(self.inbox.authorized('Bearer wrong'))
        self.assertTrue(self.inbox.authorized('Bearer '+'x'*40))
    def test_incoming_is_durable_and_deduplicated(self):
        self.inbox.observe({'update_id':11,'business_message':self.message},self.adapter)
        rows=self.inbox.db.execute('SELECT payload FROM inbox_events').fetchall()
        self.assertEqual(len(rows),1); self.assertEqual(json.loads(rows[0][0])['sender'],'CUSTOMER')
        queued=self.inbox.db.execute("SELECT count(*) FROM inbox_super_bot_replies WHERE state='queued'").fetchone()[0]
        self.assertEqual(queued,1)
    def test_super_bot_reply_is_sent_without_pausing_the_conversation(self):
        self.inbox.config.update(super_bot_url='https://tiendavirtualsuper.com/api/internal/super-bot/reply',super_bot_key='shared-key')
        self.inbox.super_bot_reply=lambda content: ('Respuesta de Super Bot',None)
        self.assertTrue(self.inbox.super_bot_tick(self.adapter))
        self.assertEqual(len(self.calls),1); self.assertEqual(self.calls[0][0],'sendMessage')
        self.assertTrue(self.calls[0][1]['_inbox_automated']); self.assertFalse(self.inbox.paused('linked',2))
        state=self.inbox.db.execute('SELECT state FROM inbox_super_bot_replies').fetchone()[0]
        self.assertEqual(state,'sent')

    def test_own_super_bot_echo_from_the_owner_does_not_pause_the_chat(self):
        self.inbox.config.update(super_bot_url='https://tiendavirtualsuper.com/api/internal/super-bot/reply',super_bot_key='shared-key')
        self.inbox.super_bot_reply=lambda content: ('Respuesta de Super Bot',None)
        self.assertTrue(self.inbox.super_bot_tick(self.adapter))

        # Telegram Business can echo an outbound automatic reply with the
        # store owner's id and no sender_business_bot marker.
        echo=dict(self.message,message_id=33,text='Respuesta de Super Bot',**{'from':{'id':1}})
        self.assertFalse(self.inbox.observe({'update_id':12,'business_message':echo},self.adapter))
        self.assertFalse(self.inbox.paused('linked',2))
        event=json.loads(self.inbox.db.execute('SELECT payload FROM inbox_events ORDER BY id DESC LIMIT 1').fetchone()[0])
        self.assertEqual(event['sender'],'BOT')
        self.assertEqual(event['protocol'],'super-bot-v1')

    def test_super_bot_waits_for_silence_and_batches_consecutive_customer_messages(self):
        self.inbox.config.update(super_bot_url='https://tiendavirtualsuper.com/api/internal/super-bot/reply',super_bot_key='shared-key',super_bot_silence_seconds=3)
        self.now += 1
        second=dict(self.message,message_id=8,date=self.now,text='Necesito un parlante')
        self.inbox.observe({'update_id':12,'business_message':second},self.adapter)
        # Repeated provider delivery must not append the same fragment twice.
        self.inbox.observe({'update_id':12,'business_message':second},self.adapter)
        requests=[]
        def reply(request):
            requests.append(request)
            return {'text':'Te comparto opciones.', 'document':None, 'products':[]}
        self.inbox.super_bot_reply=reply
        self.assertFalse(self.inbox.super_bot_tick(self.adapter))
        self.now += 3
        self.assertTrue(self.inbox.super_bot_tick(self.adapter))
        self.assertEqual(len(requests),1)
        request=requests[0]
        self.assertEqual(request['message'],'Hola\nNecesito un parlante')
        self.assertEqual(request['channel'],'telegram')
        self.assertTrue(request['eventId'].startswith('tgbot:'))
        self.assertEqual(request['conversationId'],'telegram:linked:2')
        self.assertEqual(request['recentMessages'],[])
        self.assertTrue(request['isFirstContact'])
        self.assertEqual([call[0] for call in self.calls],['sendMessage'])
        states=self.inbox.db.execute('SELECT state FROM inbox_super_bot_replies ORDER BY created,id').fetchall()
        self.assertEqual(states,[('sent',),('sent',)])

    def test_super_bot_sends_recent_history_and_marks_later_contact(self):
        self.inbox.config.update(super_bot_url='https://tiendavirtualsuper.com/api/internal/super-bot/reply',super_bot_key='shared-key')
        self.inbox.super_bot_reply=lambda request: {'text':'Primera respuesta', 'document':None, 'products':[]}
        self.assertTrue(self.inbox.super_bot_tick(self.adapter))
        bot_message=dict(self.message,message_id=70,text='Primera respuesta',**{'from':{'id':1}})
        self.inbox.message(bot_message,'BOT',event_key='bot:70')
        self.now += 1
        next_message=dict(self.message,message_id=8,date=self.now,text='¿Tienes otro modelo?')
        self.inbox.observe({'update_id':12,'business_message':next_message},self.adapter)
        requests=[]
        def reply(request):
            requests.append(request)
            return {'text':'Sí, reviso otras opciones.', 'document':None, 'products':[]}
        self.inbox.super_bot_reply=reply
        self.assertTrue(self.inbox.super_bot_tick(self.adapter))
        self.assertFalse(requests[0]['isFirstContact'])
        self.assertEqual(requests[0]['recentMessages'],[
            {'role':'user','text':'Hola'},
            {'role':'assistant','text':'Primera respuesta'},
        ])

    def test_super_bot_sends_up_to_three_verified_store_images_before_text(self):
        self.inbox.config.update(super_bot_url='https://tiendavirtualsuper.com/api/internal/super-bot/reply',super_bot_key='shared-key')
        self.inbox.super_bot_reply=lambda request: {
            'text':'Estas son las opciones disponibles.', 'document':None,
            'products':[
                {'name':'Producto uno','code':'UNO-1','telegramImageUrl':'/api/telegram/product-image/UNO-1','imageUrl':'/uploads/products/uno.webp','outboundImageUrl':'https://tiendavirtualsuper.com/uploads/products/uno.jpg'},
                {'name':'Producto externo','code':'EXT-1','telegramImageUrl':'https://tiendavirtualsuper.com/api/other-image/EXT-1','imageUrl':'https://example.test/no.jpg'},
                {'name':'Producto dos','code':'DOS-2','imageUrl':'https://tiendavirtualsuper.com/uploads/products/dos.jpg'},
                {'name':'Producto tres','code':'TRES-3','outboundImageUrl':'https://tiendavirtualsuper.com/uploads/products/tres.png'},
                {'name':'Producto cuatro','code':'CUATRO-4','imageUrl':'/uploads/products/cuatro.jpg'},
            ],
        }
        self.assertTrue(self.inbox.super_bot_tick(self.adapter))
        self.assertEqual([call[0] for call in self.calls],['sendPhoto','sendPhoto','sendPhoto','sendMessage'])
        photos=[call[1]['photo'] for call in self.calls[:3]]
        self.assertEqual(photos,[
            'https://tiendavirtualsuper.com/api/telegram/product-image/UNO-1',
            'https://tiendavirtualsuper.com/uploads/products/dos.jpg',
            'https://tiendavirtualsuper.com/uploads/products/tres.png',
        ])
        ids=[call[1]['_inbox_request_id'] for call in self.calls]
        self.assertEqual(len(ids),len(set(ids)))
        self.assertTrue(all(call[1]['_inbox_automated'] for call in self.calls))
        self.assertTrue(all(call[1]['_inbox_sender'] == 'BOT' for call in self.calls))
        self.assertTrue(all(call[1]['_inbox_protocol'] == 'super-bot-v1' for call in self.calls))
        self.assertFalse(self.inbox.super_bot_tick(self.adapter))
        self.assertEqual(len(self.calls),4)

    def test_super_bot_rejects_other_api_paths_and_derivative_query_strings(self):
        images=self.inbox.product_image_messages([
            {'name':'Válido','code':'O864','telegramImageUrl':'/api/telegram/product-image/O864'},
            {'name':'Con query','code':'BAD-Q','telegramImageUrl':'/api/telegram/product-image/O864?next=/uploads/products/otro.jpg'},
            {'name':'Otro API','code':'BAD-A','telegramImageUrl':'/api/admin/uploads/O864'},
            {'name':'Host externo','code':'BAD-H','telegramImageUrl':'https://example.test/api/telegram/product-image/O864'},
        ])
        self.assertEqual(images,[{
            'url':'https://tiendavirtualsuper.com/api/telegram/product-image/O864',
            'caption':'Válido · O864',
        }])

    def test_rejected_product_photo_does_not_block_the_text_reply(self):
        self.inbox.config.update(super_bot_url='https://tiendavirtualsuper.com/api/internal/super-bot/reply',super_bot_key='shared-key')
        attempts=[]
        def send(method,body):
            attempts.append((method,body))
            if method == 'sendPhoto':
                raise urllib.error.HTTPError('https://api.telegram.org',400,'unsupported photo',{},None)
            self.calls.append((method,body))
            return {'message_id':33}
        self.inbox.raw_api=send
        self.inbox.super_bot_reply=lambda request: {
            'text':'Te comparto la información solicitada.', 'document':None,
            'products':[
                {'name':'URL malformada','code':'BAD-1','imageUrl':'https://tiendavirtualsuper.com:invalid/uploads/products/no.jpg'},
                {'name':'Producto','code':'P-1','imageUrl':'/uploads/products/compatible.jpg'},
            ],
        }
        self.assertTrue(self.inbox.super_bot_tick(self.adapter))
        self.assertEqual([method for method,_ in attempts],['sendPhoto','sendMessage'])
        self.assertEqual([call[0] for call in self.calls],['sendMessage'])
        state=self.inbox.db.execute('SELECT state FROM inbox_super_bot_replies').fetchone()[0]
        self.assertEqual(state,'sent')

    def test_human_pause_blocks_a_batched_reply_before_model_or_media(self):
        self.inbox.config.update(super_bot_url='https://tiendavirtualsuper.com/api/internal/super-bot/reply',super_bot_key='shared-key')
        self.inbox.set_paused('linked',2,True)
        requested=[]
        self.inbox.super_bot_reply=lambda request: requested.append(request) or {
            'text':'No debe enviarse.', 'document':None,
            'products':[{'name':'Producto','code':'P-1','imageUrl':'/uploads/products/compatible.jpg'}],
        }
        self.assertTrue(self.inbox.super_bot_tick(self.adapter))
        self.assertEqual(requested,[])
        self.assertEqual(self.calls,[])
        state=self.inbox.db.execute('SELECT state FROM inbox_super_bot_replies').fetchone()[0]
        self.assertEqual(state,'failed')

    def test_advisor_typing_lease_defers_then_auto_resumes_the_queued_reply(self):
        self.inbox.config.update(super_bot_url='https://tiendavirtualsuper.com/api/internal/super-bot/reply',super_bot_key='shared-key')
        result=self.inbox.command('typing',{
            'connectionId':'linked','chatId':'2','sender':'AGENT','typing':True,'leaseSeconds':8,
        },self.adapter)
        self.assertEqual(result,{'typing':True,'typingUntil':self.now+8})
        self.assertFalse(self.inbox.paused('linked',2))
        requests=[]
        self.inbox.super_bot_reply=lambda request: requests.append(request) or {
            'text':'Tengo estas opciones disponibles.', 'document':None, 'products':[],
        }
        self.assertFalse(self.inbox.super_bot_tick(self.adapter))
        self.assertEqual(requests,[])
        self.assertEqual(self.calls,[])
        self.assertEqual(self.inbox.db.execute('SELECT state FROM inbox_super_bot_replies').fetchone()[0],'queued')
        self.now += 8
        self.assertTrue(self.inbox.super_bot_tick(self.adapter))
        self.assertEqual(len(requests),1)
        self.assertEqual(self.inbox.db.execute('SELECT state FROM inbox_super_bot_replies').fetchone()[0],'sent')

    def test_advisor_typing_started_while_composing_requeues_before_delivery(self):
        self.inbox.config.update(super_bot_url='https://tiendavirtualsuper.com/api/internal/super-bot/reply',super_bot_key='shared-key')
        def composing_reply(request):
            self.inbox.command('typing',{
                'connectionId':'linked','chatId':'2','sender':'AGENT','typing':True,'leaseSeconds':8,
            },self.adapter)
            return {'text':'Tengo estas opciones disponibles.', 'document':None, 'products':[]}
        self.inbox.super_bot_reply=composing_reply
        self.assertFalse(self.inbox.super_bot_tick(self.adapter))
        self.assertEqual(self.calls,[])
        row=self.inbox.db.execute('SELECT state,error FROM inbox_super_bot_replies').fetchone()
        self.assertEqual(row,('queued',None))
        self.now += 8
        self.inbox.super_bot_reply=lambda request: {'text':'Tengo estas opciones disponibles.', 'document':None, 'products':[]}
        self.assertTrue(self.inbox.super_bot_tick(self.adapter))
        self.assertEqual([call[0] for call in self.calls],['sendMessage'])

    def test_advisor_typing_lease_can_be_cleared_and_rejects_invalid_values(self):
        self.inbox.command('typing',{
            'connectionId':'linked','chatId':'2','sender':'AGENT','typing':True,'leaseSeconds':8,
        },self.adapter)
        self.assertTrue(self.inbox.advisor_typing_active('linked',2))
        self.assertEqual(self.inbox.command('typing',{
            'connectionId':'linked','chatId':'2','sender':'AGENT','typing':False,
        },self.adapter),{'typing':False,'typingUntil':None})
        self.assertFalse(self.inbox.advisor_typing_active('linked',2))
        for invalid in ('yes',0,31,True,float('nan')):
            with self.assertRaises(InboxError):
                self.inbox.command('typing',{
                    'connectionId':'linked','chatId':'2','sender':'AGENT','typing':True,'leaseSeconds':invalid,
                },self.adapter)
        with self.assertRaises(InboxError):
            self.inbox.command('typing',{
                'connectionId':'linked','chatId':'2','sender':'BOT','typing':True,'leaseSeconds':8,
            },self.adapter)

    def test_authenticated_typing_endpoint_uses_the_typing_until_contract(self):
        body=json.dumps({
            'connectionId':'linked','chatId':'2','sender':'AGENT','typing':True,'leaseSeconds':8,
        }).encode()
        class Connection:
            def settimeout(self, value): self.timeout=value
        class Handler:
            command='POST'
            path='/inbox/typing'
            headers={'Authorization':'Bearer '+'x'*40,'Content-Length':str(len(body))}
            rfile=BytesIO(body)
            connection=Connection()
            def __init__(self): self.responses=[]
            def reply(self, status, payload): self.responses.append((status,payload))
        handler=Handler()
        self.assertTrue(handle(self.inbox,self.adapter,handler))
        self.assertEqual(handler.responses,[(200,{'typing':True,'typingUntil':self.now+8})])

    def test_super_bot_preserves_catalog_pdf_delivery(self):
        self.inbox.config.update(super_bot_url='https://tiendavirtualsuper.com/api/internal/super-bot/reply',super_bot_key='shared-key')
        self.inbox.super_bot_reply=lambda request: {
            'text':'Aquí tienes el catálogo.',
            'document':{'url':'https://tiendavirtualsuper.com/uploads/catalogs/catalogo-parlantes.pdf'},
            'products':[],
        }
        self.assertTrue(self.inbox.super_bot_tick(self.adapter))
        self.assertEqual(self.calls[0][0],'sendDocument')
        self.assertEqual(self.calls[0][1]['document'],'https://tiendavirtualsuper.com/uploads/catalogs/catalogo-parlantes.pdf')

    def test_super_bot_http_reply_reads_the_response_once(self):
        self.inbox.config.update(super_bot_url='https://tiendavirtualsuper.com/api/internal/super-bot/reply',super_bot_key='shared-key')
        class Response:
            def __init__(self): self.reads=0
            def __enter__(self): return self
            def __exit__(self,*args): return False
            def read(self):
                self.reads += 1
                if self.reads > 1: raise AssertionError('response body read twice')
                return b'{"reply":{"text":"Respuesta corta","products":[]}}'
        response=Response()
        with patch('inbox.urllib.request.urlopen',return_value=response) as urlopen:
            reply=self.inbox.super_bot_reply({
                'message':'Hola','channel':'telegram','eventId':'tgbot:test',
                'conversationId':'telegram:linked:2','recentMessages':[],'isFirstContact':True,
            })
        payload=json.loads(urlopen.call_args.args[0].data.decode())
        self.assertEqual(response.reads,1)
        self.assertEqual(payload['isFirstContact'],True)
        self.assertEqual(reply['text'],'Respuesta corta')
    def test_missing_super_bot_configuration_never_falls_back_to_legacy(self):
        self.assertTrue(self.inbox.super_bot_tick(self.adapter))
        self.assertFalse(self.calls)
        row=self.inbox.db.execute('SELECT state,error FROM inbox_super_bot_replies').fetchone()
        self.assertEqual(row[0],'failed'); self.assertIn('Super Bot',row[1])
    def test_status_keeps_the_versioned_super_bot_capability(self):
        status=self.inbox.status(self.adapter)
        self.assertTrue(status['connected'])
        self.assertEqual(status['capabilities'],{'superBotSendV1':True,'superBotControlV1':True})
    def test_versioned_super_bot_control_and_send_are_idempotent(self):
        control=self.inbox.command('control',{
            'connectionId':'linked','chatId':'2','botEnabled':False,'expectedRevision':0,
            'sender':'BOT','protocol':'super-bot-v1',
        },self.adapter)
        self.assertEqual(control,{'revision':1,'sender':'BOT','protocol':'super-bot-v1'})
        self.assertTrue(self.inbox.super_bot_claimed('linked',2))
        request={
            'connectionId':'linked','chatId':'2','requestId':'ai:verified-reply','type':'TEXT',
            'content':'Respuesta de Super Bot','sender':'BOT','protocol':'super-bot-v1',
        }
        result=self.inbox.command('send',request,self.adapter)
        self.assertEqual(result,{
            'messageId':33,'revision':1,'connectionId':'linked','chatId':'2',
            'sender':'BOT','protocol':'super-bot-v1',
        })
        self.assertEqual(self.inbox.command('send',request,self.adapter),result)
        self.assertEqual(len(self.calls),1)
        self.assertEqual(self.calls[0][1]['_inbox_sender'],'BOT')
        self.assertEqual(self.calls[0][1]['_inbox_protocol'],'super-bot-v1')
    def test_versioned_super_bot_refuses_stale_or_unclaimed_delivery(self):
        self.inbox.set_paused('linked',2,True,advance_revision=True)
        with self.assertRaises(InboxError) as stale:
            self.inbox.command('control',{
                'connectionId':'linked','chatId':'2','botEnabled':False,'expectedRevision':0,
                'sender':'BOT','protocol':'super-bot-v1',
            },self.adapter)
        self.assertEqual(stale.exception.status,409)
        with self.assertRaises(InboxError) as unclaimed:
            self.inbox.command('send',{
                'connectionId':'linked','chatId':'2','requestId':'ai:unclaimed','type':'TEXT',
                'content':'No debe salir','sender':'BOT','protocol':'super-bot-v1',
            },self.adapter)
        self.assertEqual(unclaimed.exception.status,409)
        self.assertFalse(self.calls)
    def test_customer_edits_are_claimed_without_queuing_a_second_reply(self):
        claimed=self.inbox.observe({'update_id':12,'edited_business_message':dict(self.message,text='Hola de nuevo')},self.adapter)
        self.assertTrue(claimed)
        queued=self.inbox.db.execute("SELECT count(*) FROM inbox_super_bot_replies WHERE state='queued'").fetchone()[0]
        self.assertEqual(queued,1)
    def test_reply_pauses_and_is_idempotent(self):
        result=self.inbox.command('send',self.request,self.adapter)
        self.assertEqual(self.inbox.command('send',self.request,self.adapter),result)
        self.assertEqual(len(self.calls),1); self.assertTrue(self.inbox.paused('linked',2))
    def test_changed_retry_rejected(self):
        self.inbox.command('send',self.request,self.adapter)
        with self.assertRaises(InboxError): self.inbox.command('send',dict(self.request,content='Otro'),self.adapter)
        self.assertEqual(len(self.calls),1)
    def test_expired_window_does_not_send(self):
        self.now+=86401
        with self.assertRaises(InboxError): self.inbox.command('send',self.request,self.adapter)
        self.assertFalse(self.calls)
    def test_edit_does_not_reopen_window(self):
        self.now+=86401
        self.inbox.observe({'update_id':12,'edited_business_message':dict(self.message,date=self.now)},self.adapter)
        with self.assertRaises(InboxError): self.inbox.command('send',self.request,self.adapter)
    def test_external_attachment_rejected(self):
        with self.assertRaises(InboxError): self.inbox.command('send',dict(self.request,type='IMAGE',mediaUrl='https://example.com/a.jpg'),self.adapter)
        self.assertFalse(self.calls)
    def test_only_the_exact_telegram_image_derivative_api_path_is_accepted(self):
        valid=dict(self.request,requestId='tgbot:verified-photo',type='IMAGE',content='Power bank · O864',mediaUrl='https://tiendavirtualsuper.com/api/telegram/product-image/O864',automated=True)
        self.inbox.command('send',valid,self.adapter)
        self.assertEqual(self.calls[-1][0],'sendPhoto')
        for invalid in (
            'https://tiendavirtualsuper.com/api/admin/uploads/O864',
            'https://tiendavirtualsuper.com/api/telegram/product-image/O864?redirect=/uploads/products/other.jpg',
        ):
            with self.assertRaises(InboxError):
                self.inbox.command('send',dict(valid,requestId='tgbot:bad-photo:'+str(len(invalid)),mediaUrl=invalid),self.adapter)
    def test_ambiguous_send_never_retried(self):
        def fail(*args): self.calls.append(args); raise TimeoutError()
        self.inbox.raw_api=fail
        for _ in range(2):
            with self.assertRaises(InboxError) as caught:self.inbox.command('send',self.request,self.adapter)
            self.assertTrue(caught.exception.uncertain)
        self.assertEqual(len(self.calls),1)
    def test_owner_reply_pauses(self):
        self.inbox.observe({'update_id':12,'business_message':dict(self.message,message_id=8,**{'from':{'id':1}})},self.adapter)
        self.assertTrue(self.inbox.paused('linked',2))
        self.inbox.command('control',{'connectionId':'linked','chatId':'2','botEnabled':True},self.adapter)
        self.assertFalse(self.inbox.paused('linked',2))
    def test_unknown_account_rejected(self):
        with self.assertRaises(InboxError): self.inbox.command('send',dict(self.request,connectionId='other'),self.adapter)
        self.assertFalse(self.calls)
    def test_media_event_does_not_expose_bot_token(self):
        self.inbox.message(dict(self.message,photo=[{'file_id':'opaque'}]),'CUSTOMER')
        payload=json.loads(self.inbox.db.execute('SELECT payload FROM inbox_events ORDER BY id DESC LIMIT 1').fetchone()[0])
        self.assertEqual(payload['fileId'],'opaque'); self.assertEqual(payload['type'],'IMAGE')
    def test_recorded_ogg_uses_voice_method(self):
        self.inbox.command('send',dict(self.request,type='AUDIO',mediaUrl='https://tiendavirtualsuper.com/uploads/documents/test.ogg'),self.adapter)
        self.assertEqual(self.calls[0][0],'sendVoice')

class AdapterIntegration(unittest.TestCase):
    def test_incoming_pause_resume_and_advisor_sync(self):
        source = os.environ.get('TELEGRAM_BRIDGE_SOURCE')
        if source:
            sys.path.insert(0, source)
        try:
            from app import Adapter as RealAdapter
        except ModuleNotFoundError:
            self.skipTest('Set TELEGRAM_BRIDGE_SOURCE to run against the separate Telegram bridge.')
        calls=[]; now=200000
        def api(method,body):calls.append((method,body));return {'message_id':100+len(calls)}
        adapter=RealAdapter(':memory:',api,lambda update:None,now=lambda:now)
        adapter.connection({'id':'linked','user':{'id':1,'username':'superimportaciones'},'is_enabled':True,'rights':{'can_reply':True}})
        inbox=Inbox(':memory:',{'inbox_secret':'x'*40,'inbox_url':'https://example.test','super_bot_silence_seconds':0},api,now=lambda:now)
        adapter.inbox=inbox
        m={'message_id':10,'business_connection_id':'linked','chat':{'id':2,'type':'private'},'from':{'id':2},'date':now,'text':'hola'}
        adapter.process({'update_id':1,'business_message':m})
        self.assertEqual(len(calls),0)
        inbox.config.update(super_bot_url='https://tiendavirtualsuper.com/api/internal/super-bot/reply',super_bot_key='shared-key')
        inbox.super_bot_reply=lambda content: ('Hola desde Super Bot',None)
        inbox.super_bot_tick(adapter)
        self.assertEqual(len(calls),1)
        inbox.command('send',{'connectionId':'linked','chatId':'2','requestId':'tgout:test','type':'TEXT','content':'Hola desde tienda'},adapter)
        count=len(calls)
        now+=30
        adapter.process({'update_id':2,'business_message':dict(m,message_id=11,date=now)})
        self.assertEqual(len(calls),count)
        inbox.command('control',{'connectionId':'linked','chatId':'2','botEnabled':True},adapter)
        now+=30
        adapter.process({'update_id':3,'business_message':dict(m,message_id=12,date=now)})
        self.assertEqual(len(calls),count+1)
        adapter.process({'update_id':4,'callback_query':{'id':'callback','from':{'id':2},'message':m,'data':'superbot:human'}})
        event=json.loads(inbox.db.execute('SELECT payload FROM inbox_events ORDER BY id DESC LIMIT 1').fetchone()[0])
        self.assertFalse(event['botEnabled']); self.assertTrue(event['needsAdvisor'])
        adapter.db.close(); inbox.db.close()

if __name__=='__main__':unittest.main()
