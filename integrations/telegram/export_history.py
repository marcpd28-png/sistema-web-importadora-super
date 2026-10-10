"""Read recent history for already-connected business chats, using an existing session.

Runs inside the retention container. Does not send messages or change Telegram state.
Inputs and output stay in its private data directory; no account credentials are logged.
"""
import asyncio
import json
import os
import sqlite3
from pathlib import Path
from telethon import TelegramClient, types, utils
from telethon.sessions import MemorySession
from telethon.crypto import AuthKey

async def main():
    os.umask(0o077)
    root=Path('/service')
    config=json.loads((root/'config.json').read_text())
    targets=json.loads((root/'data/inbox-history-targets.json').read_text())
    db=sqlite3.connect('file:/service/data/account.session?mode=ro',uri=True)
    row=db.execute('SELECT dc_id,server_address,port,auth_key FROM sessions LIMIT 1').fetchone()
    hashes=dict(db.execute('SELECT id,hash FROM entities').fetchall()); db.close()
    if not row: raise RuntimeError('Existing account session is unavailable')
    session=MemorySession(); session.set_dc(row[0],row[1],row[2]); session.auth_key=AuthKey(row[3])
    client=TelegramClient(session,int(config['api_id']),config['api_hash'],receive_updates=False,flood_sleep_threshold=0)
    events=[]; skipped=0
    try:
        await client.connect()
        me=await client.get_me()
        if not me or me.bot or (me.username or '').lower()!='superimportaciones': raise RuntimeError('Unexpected account')
        for cid,chat in targets:
            try:
                if chat not in hashes: skipped+=1; continue
                peer=types.InputPeerUser(chat,hashes[chat])
                entity=await client.get_entity(peer)
                if getattr(entity,'bot',False) or chat==me.id: continue
                name=(' '.join(filter(None,(entity.first_name,entity.last_name))) or entity.username or 'Cliente de Telegram')[:180]
                messages=await client.get_messages(peer,limit=50)
                for m in reversed(messages):
                    if not isinstance(m,types.Message): continue
                    kind='IMAGE' if m.photo else 'VIDEO' if m.video or m.gif else 'AUDIO' if m.voice or m.audio else 'DOCUMENT' if m.document else 'TEXT'
                    event=dict(eventId=f'history:{cid}:{chat}:{m.id}',kind='message',connectionId=cid,chatId=str(chat),messageId=m.id,
                        sender='BOT' if getattr(m,'via_business_bot_id',None) else 'AGENT' if m.out else 'CUSTOMER',type=kind,
                        content=m.message or {'IMAGE':'Imagen','VIDEO':'Video','AUDIO':'Audio','DOCUMENT':'Documento'}.get(kind,'[Mensaje de Telegram]'),
                        timestamp=int(m.date.timestamp()),name=name,historical=True)
                    if m.file:
                        file_id=utils.pack_bot_file_id(m.media)
                        if file_id:event['fileId']=file_id
                        if m.file.name:event['filename']=m.file.name[:255]
                    if m.reply_to and m.reply_to.reply_to_msg_id:event['replyToMessageId']=m.reply_to.reply_to_msg_id
                    events.append(event)
                await asyncio.sleep(0.15)
            except Exception as error:
                skipped+=1
                if type(error).__name__=='FloodWaitError': break
        (root/'data/inbox-history.json').write_text(json.dumps(events,ensure_ascii=False))
        print(json.dumps({'messages':len(events),'skipped_chats':skipped}))
    finally: await client.disconnect()

asyncio.run(main())
