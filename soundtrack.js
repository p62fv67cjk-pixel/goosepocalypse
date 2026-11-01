import './landscape.js';
// Geese With Teeth original adaptive soundtrack.
// Procedural WebAudio only: no samples, lyrics, recordings or borrowed melodies.
const AudioCtx=window.AudioContext||window.webkitAudioContext;
let ctx,master,musicBus,noiseBuffer,timer=null,step=0,running=false,boss=false;
const BPM=145,beat=60/BPM;
function ensure(){if(ctx)return;ctx=new AudioCtx();master=ctx.createGain();master.gain.value=.5;master.connect(ctx.destination);musicBus=ctx.createGain();musicBus.gain.value=.19;musicBus.connect(master);noiseBuffer=ctx.createBuffer(1,ctx.sampleRate*.25,ctx.sampleRate);const d=noiseBuffer.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1}
function osc(freq,when,dur,type='sawtooth',gain=.05,detune=0,cutoff=900){const o=ctx.createOscillator(),g=ctx.createGain(),f=ctx.createBiquadFilter();o.type=type;o.frequency.value=freq;o.detune.value=detune;f.type='lowpass';f.frequency.value=cutoff;g.gain.setValueAtTime(.0001,when);g.gain.exponentialRampToValueAtTime(gain,when+.006);g.gain.exponentialRampToValueAtTime(.0001,when+dur);o.connect(f);f.connect(g);g.connect(musicBus);o.start(when);o.stop(when+dur+.02)}
function kick(when,heavy=false){osc(heavy?44:52,when,heavy?.16:.11,'sine',heavy?.28:.2);osc(heavy?78:92,when,.035,'square',.04)}
function snare(when){const s=ctx.createBufferSource(),g=ctx.createGain(),f=ctx.createBiquadFilter();s.buffer=noiseBuffer;f.type='highpass';f.frequency.value=850;g.gain.setValueAtTime(.11,when);g.gain.exponentialRampToValueAtTime(.0001,when+.08);s.connect(f);f.connect(g);g.connect(musicBus);s.start(when);s.stop(when+.09)}
function hat(when){const s=ctx.createBufferSource(),g=ctx.createGain(),f=ctx.createBiquadFilter();s.buffer=noiseBuffer;f.type='highpass';f.frequency.value=5600;g.gain.setValueAtTime(.018,when);g.gain.exponentialRampToValueAtTime(.0001,when+.028);s.connect(f);f.connect(g);g.connect(musicBus);s.start(when);s.stop(when+.03)}
// Original low 8-string-inspired riff and deliberately simple eerie toy-box counter-melody.
const riff=[41.2,41.2,49,43.65,41.2,55,49,36.71,41.2,41.2,58.27,49,43.65,41.2,36.71,36.71];
const toy=[659.25,783.99,739.99,659.25,523.25,587.33,659.25,493.88];
function toyBell(freq,when,dur=.12){osc(freq,when,dur,'sine',boss?.032:.024,0,6200);osc(freq*2.01,when,dur*.7,'triangle',.012,0,7200)}
function tick(){if(!running||!ctx)return;const now=ctx.currentTime+.025,eighth=beat/2,i=step%16,n=riff[i],breakdown=boss&&i>=8;
  if(breakdown){if(i%2===0)kick(now,true);if(i===10||i===14)snare(now);osc(n,now,eighth*.72,'sawtooth',.11,-9,1050);osc(n,now,eighth*.72,'square',.06,9,900)}
  else{kick(now,i===0||i===8);if(i%4===2)snare(now);hat(now+eighth*.5);osc(n,now,eighth*.74,'sawtooth',boss?.09:.07,-8,1100);osc(n,now,eighth*.74,'square',boss?.05:.035,8,900);osc(n/2,now,eighth*.82,'sawtooth',.038,0,620)}
  if(i%2===0)toyBell(toy[(step/2|0)%toy.length],now+eighth*.08,eighth*.58);
  if(boss&&(i===7||i===15)){toyBell(987.77,now,eighth*.32);osc(32.7,now,eighth*.8,'sawtooth',.075,0,500)}
  step++;timer=setTimeout(tick,eighth*1000)}
function start(){ensure();ctx.resume();if(running)return;running=true;tick();button.textContent='♫ ON'}
function stop(){running=false;clearTimeout(timer);timer=null;if(button)button.textContent='♫ OFF'}
const button=document.createElement('button');button.id='musicToggle';button.textContent='♫ OFF';button.setAttribute('aria-label','Toggle music');Object.assign(button.style,{position:'fixed',right:'12px',top:'calc(env(safe-area-inset-top) + 115px)',zIndex:'6',width:'54px',height:'34px',borderRadius:'18px',border:'1px solid #ffffff88',background:'#111b',color:'#fff',fontWeight:'900',fontSize:'10px'});document.body.appendChild(button);button.addEventListener('click',e=>{e.stopPropagation();running?stop():start()});
document.querySelector('.start')?.addEventListener('click',()=>start(),{passive:true});
const wave=document.querySelector('#wave');if(wave)new MutationObserver(()=>{const n=parseInt(wave.textContent.match(/\d+/)?.[0]||'1',10);boss=n%5===0;if(musicBus&&ctx){musicBus.gain.cancelScheduledValues(ctx.currentTime);musicBus.gain.linearRampToValueAtTime(boss?.25:.19,ctx.currentTime+.2)}}).observe(wave,{childList:true,characterData:true,subtree:true});
document.addEventListener('visibilitychange',()=>{if(!ctx)return;document.hidden?ctx.suspend():running&&ctx.resume()});