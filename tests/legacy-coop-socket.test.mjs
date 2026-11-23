// Run with: node --test tests/legacy-coop-socket.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../multiplayer-client.js', import.meta.url), 'utf8');
const { GooseCoopClient } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
globalThis.CustomEvent ??= class CustomEvent extends Event { constructor(type, options={}) { super(type); this.detail=options.detail; } };
class FakeSocket extends EventTarget {
  static OPEN=1; static CONNECTING=0;
  constructor(url){ super(); this.url=url; this.readyState=0; this.sent=[]; FakeSocket.instances.push(this); }
  send(data){ if(this.failSend) throw Error('socket closed during send'); this.sent.push(JSON.parse(data)); }
  close(){ this.readyState=3; }
  emit(type,data){ const event=new Event(type); if(data!==undefined)event.data=data; this.dispatchEvent(event); }
}
FakeSocket.instances=[];
globalThis.WebSocket=FakeSocket;
const room='abcdefghijklmnop';

test('replaced socket cannot dispatch stale messages or open/error events',()=>{
  const client=new GooseCoopClient('https://example.org');
  let opened=0,errors=0,messages=0;
  client.addEventListener('transportopen',()=>opened++);
  client.addEventListener('transporterror',()=>errors++);
  client.addEventListener('message',()=>messages++);
  const old=client.connect(room),current=client.connect(room);
  old.emit('open');old.emit('error');old.emit('message',JSON.stringify({t:'welcome',slot:1}));
  assert.equal(opened,0);assert.equal(errors,0);assert.equal(messages,0);
  assert.equal(client.connected,false);
  current.emit('open');current.emit('message',JSON.stringify({t:'welcome',slot:2}));
  assert.equal(opened,1);assert.equal(messages,1);assert.equal(client.slot,2);
});

test('Safari send race returns false without consuming sequence number',()=>{
  const client=new GooseCoopClient('https://example.org');
  const ws=client.connect(room);ws.readyState=FakeSocket.OPEN;ws.failSend=true;
  assert.equal(client.state(1,2),false);
  ws.failSend=false;
  assert.equal(client.state(3,4),true);
  assert.equal(ws.sent[0].seq,0);
  assert.equal(client.state(5,6),true);
  assert.equal(ws.sent[1].seq,1);
});
