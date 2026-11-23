import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

class FakeSocket {
  static OPEN=1;
  static CONNECTING=0;
  constructor(){this.readyState=1;this.sent=[];this.fail=false;}
  addEventListener(){}
  send(data){if(this.fail)throw new Error('socket closed during send');this.sent.push(JSON.parse(data));}
  close(){this.readyState=3;}
}
globalThis.WebSocket=FakeSocket;

test('failed socket send is retryable and does not consume sequence number',async()=>{
  const source=await readFile(new URL('../multiplayer-client.js',import.meta.url),'utf8');
  const {GooseCoopClient}=await import('data:text/javascript,'+encodeURIComponent(source));
  const client=new GooseCoopClient('https://relay.example');
  const socket=client.connect('A'.repeat(16));
  socket.fail=true;
  assert.equal(client.state(1,2),false);
  assert.equal(client.seq.state,0);
  socket.fail=false;
  assert.equal(client.state(1,2),true);
  assert.deepEqual(socket.sent,[{t:'state',seq:0,x:1,z:2}]);
  assert.equal(client.seq.state,1);
  socket.fail=true;
  assert.equal(client.state(2,3),false);
  assert.equal(client.seq.state,1);
});
