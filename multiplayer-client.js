// Geese With Teeth real co-op transport. Not loaded by index.html until a relay URL is configured.
export class GooseCoopClient extends EventTarget {
  constructor(relayUrl){
    super();
    this.relayUrl=String(relayUrl||'').replace(/\/$/,'');
    this.ws=null;this.room=null;this.slot=null;this.connected=false;
    this.seq={input:0,state:0,character:0,damage:0,revive_start:0,revive_cancel:0};
  }
  async createRoom(signal){
    if(!this.relayUrl)throw new Error('Co-op relay is not configured');
    const r=await fetch(`${this.relayUrl}/room`,{method:'POST',signal,cache:'no-store'});
    if(!r.ok)throw new Error(`Room creation failed (${r.status})`);
    const data=await r.json();
    if(!data?.room||!/^[A-Za-z0-9_-]{16,64}$/.test(data.room))throw new Error('Relay returned an invalid room id');
    return data.room;
  }
  shareUrl(room,base=location.href){
    const u=new URL(base);u.searchParams.set('room',room);return u.toString();
  }
  connect(room){
    if(!this.relayUrl)throw new Error('Co-op relay is not configured');
    if(!/^[A-Za-z0-9_-]{16,64}$/.test(room))throw new Error('Invalid room id');
    this.close();this.room=room;
    const u=new URL(this.relayUrl);u.protocol=u.protocol==='https:'?'wss:':u.protocol==='http:'?'ws:':u.protocol;
    u.pathname=`${u.pathname.replace(/\/$/,'')}/room/${encodeURIComponent(room)}`;
    const ws=this.ws=new WebSocket(u);
    ws.addEventListener('open',()=>this.dispatchEvent(new CustomEvent('transportopen')));
    ws.addEventListener('message',e=>this.#receive(e.data));
    ws.addEventListener('close',e=>{if(this.ws!==ws)return;this.connected=false;this.slot=null;this.dispatchEvent(new CustomEvent('disconnect',{detail:{code:e.code,reason:e.reason}}))});
    ws.addEventListener('error',()=>this.dispatchEvent(new CustomEvent('transporterror')));
    return ws;
  }
  #receive(raw){
    let m;try{m=JSON.parse(raw)}catch{return}
    if(!m||typeof m!=='object'||typeof m.t!=='string')return;
    if(m.t==='welcome'){this.slot=m.slot;this.connected=true}
    this.dispatchEvent(new CustomEvent(m.t,{detail:m}));
    this.dispatchEvent(new CustomEvent('message',{detail:m}));
  }
  #send(type,payload={}){
    if(!this.ws||this.ws.readyState!==WebSocket.OPEN)return false;
    const seq=this.seq[type]??0;this.seq[type]=seq+1;
    this.ws.send(JSON.stringify({t:type,seq,...payload}));return true;
  }
  input({moveX=0,moveY=0,yaw=0,pitch=0,sprint=false,fire=false}={}){return this.#send('input',{move:[moveX,moveY],yaw,pitch,sprint,fire})}
  state(x,z){return this.#send('state',{x,z})}
  character(character){return this.#send('character',{character})}
  damage(amount){return this.#send('damage',{amount})}
  reviveStart(target){return this.#send('revive_start',{target})}
  reviveCancel(target){return this.#send('revive_cancel',{target})}
  close(){const ws=this.ws;this.ws=null;this.connected=false;this.slot=null;if(ws&&(ws.readyState===WebSocket.OPEN||ws.readyState===WebSocket.CONNECTING))ws.close(1000,'client_close')}
}

export function roomFromLocation(url=location.href){
  const room=new URL(url).searchParams.get('room');
  return room&&/^[A-Za-z0-9_-]{16,64}$/.test(room)?room:null;
}
