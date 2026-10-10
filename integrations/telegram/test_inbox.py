import json
import sys
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent))
from inbox import Inbox, InboxError

class Shopping:
    def support_session(self,*args): return None
    def pause(self,*args): pass
    def leave_support(self,*args): pass
class Adapter:
    def __init__(self):
        import threading
        self.lock=threading.Lock()
        self.shopping=Shopping()
        self.db=type('DB',(),{'commit':lambda self:None})()
    def get_connection(self,cid): return (1,1,1) if cid=='linked' else None

class InboxTests(unittest.TestCase):
    def setUp(self):
        self.calls=[]
        self.now=200000
        def send(method,body):
            self.calls.append((method,body)); return {'message_id':33}
        self.inbox=Inbox(':memory:',{'inbox_secret':'x'*40,'inbox_url':'https://example.test'},send,now=lambda:self.now)
        self.adapter=Adapter()
        self.message={'message_id':7,'business_connection_id':'linked','chat':{'id':2,'type':'private'},'from':{'id':2,'first_name':'Cliente'},'date':self.now,'text':'Hola'}
        self.inbox.observe({'update_id':11,'business_message':self.message},self.adapter)
        self.request={'connectionId':'linked','chatId':'2','requestId':'tgout:test','type':'TEXT','content':'Respuesta'}
    def test_auth_requires_configured_secret(self):
        self.assertFalse(self.inbox.authorized(None)); self.assertFalse(self.inbox.authorized('Bearer wrong'))
        self.assertTrue(self.inbox.authorized('Bearer '+'x'*40))
    def test_incoming_is_durable_and_deduplicated(self):
        self.inbox.observe({'update_id':11,'business_message':self.message},self.adapter)
        rows=self.inbox.db.execute('SELECT payload FROM inbox_events').fetchall()
        self.assertEqual(len(rows),1); self.assertEqual(json.loads(rows[0][0])['sender'],'CUSTOMER')
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
        try:
            from app import Adapter as RealAdapter
        except ModuleNotFoundError:
            sys.path.insert(0,str(Path(__file__).resolve().parents[3]/'rocky-telegram-bridge'))
            from app import Adapter as RealAdapter
        calls=[]; now=200000
        def api(method,body):calls.append((method,body));return {'message_id':100+len(calls)}
        adapter=RealAdapter(':memory:',api,lambda update:None,now=lambda:now)
        adapter.connection({'id':'linked','user':{'id':1,'username':'superimportaciones'},'is_enabled':True,'rights':{'can_reply':True}})
        inbox=Inbox(':memory:',{'inbox_secret':'x'*40,'inbox_url':'https://example.test'},api,now=lambda:now)
        adapter.inbox=inbox
        m={'message_id':10,'business_connection_id':'linked','chat':{'id':2,'type':'private'},'from':{'id':2},'date':now,'text':'hola'}
        adapter.process({'update_id':1,'business_message':m})
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
        adapter.process({'update_id':4,'callback_query':{'id':'callback','from':{'id':2},'message':m,'data':'rocky:human'}})
        event=json.loads(inbox.db.execute('SELECT payload FROM inbox_events ORDER BY id DESC LIMIT 1').fetchone()[0])
        self.assertFalse(event['botEnabled']); self.assertTrue(event['needsAdvisor'])
        adapter.db.close(); inbox.db.close()

if __name__=='__main__':unittest.main()
