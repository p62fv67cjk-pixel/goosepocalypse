import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

class FakeSocket {
  static OPEN = 1;
  static CONNECTING = 0;
  constructor(url) { this.url=url; this.readyState=0; this.listeners=new Map(); FakeSocket.instances.push(this); }
  addEventListener(type, fn) { this.listeners.set(type, fn); }
  emit(type, detail={}) { this.listeners.get(type)?.(detail); }
  close() { this.readyState=3; }
}
FakeSocket.instances=[];
globalThis.WebSocket=FakeSocket;
globalThis.CustomEvent=class extends Event { constructor(type, options={}) {super(type);this.detail=options.detail;} };

test('replaced WebSocket cannot deliver stale welcome, errors or messages', async () => {
  const source=await readFile(new URL('../multiplayer-client.js', import.meta.url),'utf8');
  const {GooseCoopClient}=await import('data:text/javascript,'+encodeURIComponent(source));
  const client=new GooseCoopClient('https://relay.example');
  const seen=[];
  for(const event of ['transportopen','transporterror','welcome','message'])client.addEventListener(event,e=>seen.push(e.type));
  client.connect('A'.repeat(16));
  const stale=FakeSocket.instances.at(-1);
  client.connect('B'.repeat(16));
  const active=FakeSocket.instances.at(-1);
  stale.emit('open');
  stale.emit('error');
  stale.emit('message',{data:JSON.stringify({t:'welcome',slot:1})});
  assert.deepEqual(seen,[]);
  assert.equal(client.connected,false);
  assert.equal(client.slot,null);
  active.emit('open');
  active.emit('message',{data:JSON.stringify({t:'welcome',slot:2})});
  assert.deepEqual(seen,['transportopen','welcome','message']);
  assert.equal(client.slot,2);
  assert.equal(client.connected,true);
});
