// Geese With Teeth minimal Cloudflare Durable Object relay.
// Real networking only: no simulated remote player. Configure this worker before exposing co-op UI.
const MAX_PLAYERS=2;
const MAX_MESSAGE_BYTES=2048;
const INPUT_HZ=20;
const STATE_HZ=20;
const MIN_INPUT_MS=1000/INPUT_HZ;
const MIN_STATE_MS=1000/STATE_HZ;
const REVIVE_RADIUS=2.4;
const REVIVE_MS=3000;
const REVIVE_HP=35;
const encoder=new TextEncoder();

function json(ws,value){try{ws.send(JSON.stringify(value))}catch{}}
function clamp(n,min,max){return Math.max(min,Math.min(max,Number(n)||0))}
function safeRoomId(value){return typeof value==='string'&&/^[A-Za-z0-9_-]{16,64}$/.test(value)}
function randomRoomId(){const b=new Uint8Array(18);crypto.getRandomValues(b);return btoa(String.fromCharCode(...b)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')}
function messageBytes(value){return typeof value==='string'?encoder.encode(value).byteLength:Infinity}

export class GooseRoom {
  constructor(state){this.state=state;this.players=new Map();this.seed=crypto.getRandomValues(new Uint32Array(1))[0];this.wave=1;this.score=0;this.tick=0}
  async fetch(request){
    if(request.headers.get('Upgrade')!=='websocket')return new Response('WebSocket required',{status:426});
    if(this.players.size>=MAX_PLAYERS)return new Response('Room full',{status:409});
    const pair=new WebSocketPair(),client=pair[0],server=pair[1];server.accept();
    const slot=this.players.has('p1')?'p2':'p1';
    const p={slot,ws:server,seq:-1,lastInput:0,lastState:0,character:slot==='p1'?'Phoenix':'Mummy',x:0,z:0,hp:100,downed:false,revive:null};
    this.players.set(slot,p);
    server.addEventListener('message',e=>this.onMessage(p,e));
    const close=()=>{if(!this.players.has(slot))return;this.cancelRevivesBy(slot);this.players.delete(slot);this.broadcast({t:'peer_left',slot})};
    server.addEventListener('close',close);server.addEventListener('error',close);
    json(server,{t:'welcome',slot,seed:this.seed,wave:this.wave,score:this.score,players:[...this.players.values()].map(this.publicPlayer)});
    this.broadcast({t:'peer_joined',player:this.publicPlayer(p)},slot);
    return new Response(null,{status:101,webSocket:client});
  }
  publicPlayer(p){return {slot:p.slot,character:p.character,x:p.x,z:p.z,hp:p.hp,downed:p.downed}}
  broadcast(msg,except){for(const p of this.players.values())if(p.slot!==except)json(p.ws,msg)}
  cancelRevivesBy(slot){for(const target of this.players.values())if(target.revive?.by===slot){target.revive=null;this.broadcast({t:'revive_cancelled',target:target.slot})}}
  cancelRevive(target){if(!target?.revive)return;target.revive=null;this.broadcast({t:'revive_cancelled',target:target.slot})}
  validateRevive(target){
    if(!target?.revive||!target.downed)return false;
    const reviver=this.players.get(target.revive.by);
    if(!reviver||reviver.downed||Math.hypot(reviver.x-target.x,reviver.z-target.z)>REVIVE_RADIUS){this.cancelRevive(target);return false}
    return true;
  }
  scheduleRevive(target){
    const started=target.revive?.started;
    setTimeout(()=>{
      if(!target.revive||target.revive.started!==started||!this.validateRevive(target))return;
      const by=target.revive.by;
      target.revive=null;target.downed=false;target.hp=REVIVE_HP;
      this.broadcast({t:'revived',target:target.slot,by,hp:target.hp,player:this.publicPlayer(target)});
    },REVIVE_MS);
  }
  onMessage(p,event){
    // String.length counts UTF-16 code units, not network bytes. Enforce the advertised
    // 2 KiB cap on encoded UTF-8 so multibyte payloads cannot bypass it.
    if(messageBytes(event.data)>MAX_MESSAGE_BYTES)return;
    let m;try{m=JSON.parse(event.data)}catch{return}
    if(!m||typeof m!=='object'||!Number.isSafeInteger(m.seq)||m.seq<=p.seq)return;p.seq=m.seq;
    if(m.t==='input'){
      const now=Date.now();if(now-p.lastInput<MIN_INPUT_MS)return;p.lastInput=now;
      const move=Array.isArray(m.move)?m.move:[0,0];
      const x=clamp(move[0],-1,1),z=clamp(move[1],-1,1),mag=Math.hypot(x,z),scale=mag>1?1/mag:1;
      const clean={t:'input',slot:p.slot,seq:p.seq,move:[x*scale,z*scale],yaw:clamp(m.yaw,-Math.PI*4,Math.PI*4),pitch:clamp(m.pitch,-1.5,1.5),sprint:!!m.sprint,fire:!!m.fire};
      this.broadcast(clean,p.slot);return;
    }
    if(m.t==='state'){
      // State packets are interpolation hints, not authority. Rate-limit them separately
      // so a client cannot flood its peer/room while still obeying the input limit.
      const now=Date.now();if(now-p.lastState<MIN_STATE_MS)return;p.lastState=now;
      // Position is bounded here for interpolation only. HP/score/kills are deliberately not client writable.
      p.x=clamp(m.x,-105,105);p.z=clamp(m.z,-105,105);
      for(const target of this.players.values())if(target.revive&&(target===p||target.revive.by===p.slot))this.validateRevive(target);
      this.broadcast({t:'state',slot:p.slot,seq:p.seq,x:p.x,z:p.z},p.slot);return;
    }
    if(m.t==='character'){
      const wanted=m.character==='Mummy'?'Mummy':'Phoenix',other=[...this.players.values()].find(q=>q!==p);
      p.character=other&&other.character===wanted?(wanted==='Mummy'?'Phoenix':'Mummy'):wanted;
      this.broadcast({t:'character',slot:p.slot,character:p.character});json(p.ws,{t:'character',slot:p.slot,character:p.character});return;
    }
    if(m.t==='revive_start'){
      const target=this.players.get(m.target);if(!target||target===p||p.downed||!target.downed||target.revive)return;
      if(Math.hypot(p.x-target.x,p.z-target.z)>REVIVE_RADIUS)return;
      target.revive={by:p.slot,started:Date.now()};this.broadcast({t:'revive_started',target:target.slot,by:p.slot,duration:REVIVE_MS});this.scheduleRevive(target);return;
    }
    if(m.t==='revive_cancel'){
      const target=this.players.get(m.target);if(target?.revive?.by===p.slot)this.cancelRevive(target);
    }
  }
}

export default {
  async fetch(request,env){
    const url=new URL(request.url);
    if(url.pathname==='/room'&&request.method==='POST')return Response.json({room:randomRoomId()},{headers:{'cache-control':'no-store'}});
    if(url.pathname.startsWith('/room/')&&request.headers.get('Upgrade')==='websocket'){
      const room=url.pathname.slice(6);if(!safeRoomId(room))return new Response('Invalid room',{status:400});
      const id=env.GOOSE_ROOMS.idFromName(room);return env.GOOSE_ROOMS.get(id).fetch(request);
    }
    return new Response('Geese With Teeth relay',{status:200});
  }
};
