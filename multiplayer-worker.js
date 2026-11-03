// Geese With Teeth minimal Cloudflare Durable Object relay.
// Real networking only: no simulated remote player. Configure this worker before exposing co-op UI.
const MAX_PLAYERS=2;
const MAX_MESSAGE_BYTES=2048;
const INPUT_HZ=20;
const STATE_HZ=20;
const MIN_INPUT_MS=1000/INPUT_HZ;
const MIN_STATE_MS=1000/STATE_HZ;
const STATE_STALE_MS=1000;
const REVIVE_RADIUS=2.4;
const REVIVE_MS=3000;
const REVIVE_HP=35;
const DAMAGE_COOLDOWN_MS=150;
const MAX_DAMAGE_PER_HIT=40;
const MAX_STATE_SPEED=18; // generous sprint/network ceiling in world units per second
const STATE_DISTANCE_GRACE=1.5;
const encoder=new TextEncoder();
const ROOM_API_HEADERS={
  'access-control-allow-origin':'*',
  'access-control-allow-methods':'POST, OPTIONS',
  'access-control-allow-headers':'content-type',
  'cache-control':'no-store',
  'vary':'Origin'
};

function json(ws,value){try{ws.send(JSON.stringify(value))}catch{}}
function clamp(n,min,max){return Math.max(min,Math.min(max,Number(n)||0))}
function safeRoomId(value){return typeof value==='string'&&/^[A-Za-z0-9_-]{16,64}$/.test(value)}
function randomRoomId(){const b=new Uint8Array(18);crypto.getRandomValues(b);return btoa(String.fromCharCode(...b)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')}
function messageBytes(value){return typeof value==='string'?encoder.encode(value).byteLength:Infinity}
function otherCharacter(character){return character==='Mummy'?'Phoenix':'Mummy'}
function seqChannel(type){return type==='input'?'input':type==='state'?'state':`action:${type}`}
function isFreshSeq(p,type,seq){const channel=seqChannel(type);return Number.isSafeInteger(seq)&&seq>=0&&seq>(p.seq[channel]??-1)}
function commitSeq(p,type,seq){p.seq[seqChannel(type)]=seq}

export class GooseRoom {
  constructor(state){this.state=state;this.players=new Map();this.seed=crypto.getRandomValues(new Uint32Array(1))[0];this.wave=1;this.score=0;this.tick=0}
  async fetch(request){
    if(request.headers.get('Upgrade')?.toLowerCase()!=='websocket')return new Response('WebSocket required',{status:426});
    if(this.players.size>=MAX_PLAYERS)return new Response('Room full',{status:409});
    const pair=new WebSocketPair(),client=pair[0],server=pair[1];server.accept();
    const slot=this.players.has('p1')?'p2':'p1';
    const existing=[...this.players.values()][0];
    const character=existing?otherCharacter(existing.character):(slot==='p1'?'Phoenix':'Mummy');
    const p={slot,ws:server,seq:{input:-1,state:-1},lastInput:0,lastState:0,lastDamage:0,hasState:false,character,x:0,z:0,hp:100,downed:false,downedAt:0,downedPositionTrusted:false,revive:null};
    this.players.set(slot,p);
    server.addEventListener('message',e=>this.onMessage(p,e));
    const close=()=>{
      if(!this.players.has(slot))return;
      this.cancelRevivesBy(slot);
      if(p.revive)this.cancelRevive(p,'target_left');
      this.players.delete(slot);
      this.broadcast({t:'peer_left',slot});
    };
    server.addEventListener('close',close);server.addEventListener('error',close);
    json(server,{t:'welcome',slot,seed:this.seed,wave:this.wave,score:this.score,players:[...this.players.values()].map(this.publicPlayer)});
    this.broadcast({t:'peer_joined',player:this.publicPlayer(p)},slot);
    return new Response(null,{status:101,webSocket:client});
  }
  publicPlayer(p){return {slot:p.slot,character:p.character,x:p.x,z:p.z,hp:p.hp,downed:p.downed}}
  broadcast(msg,except){for(const p of this.players.values())if(p.slot!==except)json(p.ws,msg)}
  cancelRevivesBy(slot,reason='reviver_left'){for(const target of this.players.values())if(target.revive?.by===slot){target.revive=null;this.broadcast({t:'revive_cancelled',target:target.slot,reason})}}
  cancelRevive(target,reason='cancelled'){if(!target?.revive)return;target.revive=null;this.broadcast({t:'revive_cancelled',target:target.slot,reason})}
  reviverStateFresh(p,now=Date.now()){return !!p?.hasState&&now-p.lastState<=STATE_STALE_MS}
  validateRevive(target){
    if(!target?.revive)return false;
    if(!target.downed){this.cancelRevive(target,'target_recovered');return false}
    const reviver=this.players.get(target.revive.by);
    if(!reviver){this.cancelRevive(target,'reviver_left');return false}
    if(reviver.downed){this.cancelRevive(target,'reviver_downed');return false}
    if(!target.hasState||!target.downedPositionTrusted){this.cancelRevive(target,'position_unknown');return false}
    if(!this.reviverStateFresh(reviver)){this.cancelRevive(target,'reviver_state_stale');return false}
    if(Math.hypot(reviver.x-target.x,reviver.z-target.z)>REVIVE_RADIUS){this.cancelRevive(target,'out_of_range');return false}
    return true;
  }
  scheduleRevive(target){
    const started=target.revive?.started;
    setTimeout(()=>{
      if(!target.revive||target.revive.started!==started||!this.validateRevive(target))return;
      const by=target.revive.by;
      target.revive=null;target.downed=false;target.downedAt=0;target.downedPositionTrusted=false;target.hp=REVIVE_HP;
      this.broadcast({t:'revived',target:target.slot,by,hp:target.hp,player:this.publicPlayer(target)});
    },REVIVE_MS);
  }
  onMessage(p,event){
    if(messageBytes(event.data)>MAX_MESSAGE_BYTES)return;
    let m;try{m=JSON.parse(event.data)}catch{return}
    if(!m||typeof m!=='object'||Array.isArray(m)||typeof m.t!=='string'||!isFreshSeq(p,m.t,m.seq))return;

    if(m.t==='input'){
      const now=Date.now();if(now-p.lastInput<MIN_INPUT_MS)return;p.lastInput=now;commitSeq(p,m.t,m.seq);
      const move=Array.isArray(m.move)?m.move:[0,0];
      const x=clamp(move[0],-1,1),z=clamp(move[1],-1,1),mag=Math.hypot(x,z),scale=mag>1?1/mag:1;
      const clean=p.downed
        ?{t:'input',slot:p.slot,seq:m.seq,move:[0,0],yaw:clamp(m.yaw,-Math.PI*4,Math.PI*4),pitch:clamp(m.pitch,-1.5,1.5),sprint:false,fire:false}
        :{t:'input',slot:p.slot,seq:m.seq,move:[x*scale,z*scale],yaw:clamp(m.yaw,-Math.PI*4,Math.PI*4),pitch:clamp(m.pitch,-1.5,1.5),sprint:!!m.sprint,fire:!!m.fire};
      this.broadcast(clean,p.slot);return;
    }
    if(m.t==='state'){
      const now=Date.now();if(now-p.lastState<MIN_STATE_MS)return;
      const rawX=Number(m.x),rawZ=Number(m.z);
      if(!Number.isFinite(rawX)||!Number.isFinite(rawZ)){json(p.ws,{t:'state_rejected',reason:'invalid_position',x:p.x,z:p.z});return}
      const nextX=clamp(rawX,-105,105),nextZ=clamp(rawZ,-105,105);
      if(p.hasState){
        const elapsed=Math.max(MIN_STATE_MS,now-p.lastState)/1000;
        const allowed=MAX_STATE_SPEED*elapsed+STATE_DISTANCE_GRACE;
        if(Math.hypot(nextX-p.x,nextZ-p.z)>allowed){json(p.ws,{t:'state_rejected',reason:'movement_too_fast',x:p.x,z:p.z});return}
        if(p.downed&&Math.hypot(nextX-p.x,nextZ-p.z)>0.05){json(p.ws,{t:'state_rejected',reason:'downed',x:p.x,z:p.z});return}
      }
      p.lastState=now;p.hasState=true;p.x=nextX;p.z=nextZ;commitSeq(p,m.t,m.seq);
      for(const target of this.players.values())if(target.revive&&(target===p||target.revive.by===p.slot))this.validateRevive(target);
      this.broadcast({t:'state',slot:p.slot,seq:m.seq,x:p.x,z:p.z},p.slot);return;
    }
    if(m.t==='character'){
      if(m.character!=='Mummy'&&m.character!=='Phoenix')return;
      commitSeq(p,m.t,m.seq);
      const wanted=m.character,other=[...this.players.values()].find(q=>q!==p);
      p.character=other&&other.character===wanted?otherCharacter(wanted):wanted;
      this.broadcast({t:'character',slot:p.slot,character:p.character});json(p.ws,{t:'character',slot:p.slot,character:p.character});return;
    }
    if(m.t==='damage'){
      // A damage event received while already downed is terminally irrelevant. Consume its
      // sequence number so a delayed/replayed packet cannot become valid after a revive.
      if(p.downed){commitSeq(p,m.t,m.seq);return}
      const amount=Number(m.amount);if(!Number.isFinite(amount)||amount<=0||amount>MAX_DAMAGE_PER_HIT)return;
      const now=Date.now();
      // A valid hit inside the cooldown is intentionally ignored, not deferred. Consume its
      // sequence number so retransmission cannot turn that ignored hit into future damage.
      if(now-p.lastDamage<DAMAGE_COOLDOWN_MS){commitSeq(p,m.t,m.seq);return}
      p.lastDamage=now;commitSeq(p,m.t,m.seq);p.hp=Math.max(0,p.hp-amount);
      if(p.hp===0){
        p.downed=true;p.downedAt=now;
        p.downedPositionTrusted=!!p.hasState&&now-p.lastState<=STATE_STALE_MS;
        this.cancelRevivesBy(p.slot,'reviver_downed');
      }
      const update={t:'health',slot:p.slot,hp:p.hp,downed:p.downed};
      this.broadcast(update);json(p.ws,update);return;
    }
    if(m.t==='revive_start'){
      const target=this.players.get(m.target);if(!target||target===p||p.downed||!target.downed||target.revive)return;
      if(!target.hasState||!target.downedPositionTrusted||!this.reviverStateFresh(p))return;
      if(Math.hypot(p.x-target.x,p.z-target.z)>REVIVE_RADIUS)return;
      commitSeq(p,m.t,m.seq);target.revive={by:p.slot,started:Date.now()};this.broadcast({t:'revive_started',target:target.slot,by:p.slot,duration:REVIVE_MS});this.scheduleRevive(target);return;
    }
    if(m.t==='revive_cancel'){
      const target=this.players.get(m.target);if(target?.revive?.by===p.slot){commitSeq(p,m.t,m.seq);this.cancelRevive(target,'reviver_cancelled')}
    }
  }
}

export default {
  async fetch(request,env){
    const url=new URL(request.url);
    if(url.pathname==='/room'&&request.method==='OPTIONS')return new Response(null,{status:204,headers:ROOM_API_HEADERS});
    if(url.pathname==='/room'&&request.method==='POST')return Response.json({room:randomRoomId()},{headers:ROOM_API_HEADERS});
    if(url.pathname.startsWith('/room/')&&request.headers.get('Upgrade')?.toLowerCase()==='websocket'){
      const room=url.pathname.slice(6);if(!safeRoomId(room))return new Response('Invalid room',{status:400});
      const id=env.GOOSE_ROOMS.idFromName(room);return env.GOOSE_ROOMS.get(id).fetch(request);
    }
    return new Response('Geese With Teeth relay',{status:200});
  }
};
