// Geese With Teeth procedural soundtrack. Original composition generated in-browser with Web Audio.
const $=s=>document.querySelector(s);
let ctx,master,musicBus,noiseBuffer,timer=null,step=0,enabled=true,intensity=1;
const BPM=132,STEP=60/BPM/4;
function init(){if(ctx)return;ctx=new (window.AudioContext||window.webkitAudioContext)();master=ctx.createGain();master.gain.value=.58;master.connect(ctx.destination);musicBus=ctx.createGain();musicBus.gain.value=.24;musicBus.connect(master);noiseBuffer=ctx.createBuffer(1,ctx.sampleRate*.5,ctx.sampleRate);let d=noiseBuffer.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1}
function osc(freq,when,dur,type='sawtooth',gain=.06,detune=0){let o=ctx.createOscillator(),g=ctx.createGain(),f=ctx.createBiquadFilter();o.type=type;o.frequency.setValueAtTime(freq,when);o.detune.value=detune;f.type='lowpass';f.frequency.value=1100;f.Q.value=3;g.gain.setValueAtTime(.0001,when);g.gain.exponentialRampToValueAtTime(gain,when+.006);g.gain.exponentialRampToValueAtTime(.0001,when+dur);o.connect(f);f.connect(g);g.connect(musicBus);o.start(when);o.stop(when+dur+.03)}
function kick(t){let o=ctx.createOscillator(),g=ctx.createGain();o.type='sine';o.frequency.setValueAtTime(115,t);o.frequency.exponentialRampToValueAtTime(42,t+.12);g.gain.setValueAtTime(.18,t);g.gain.exponentialRampToValueAtTime(.0001,t+.16);o.connect(g);g.connect(musicBus);o.start(t);o.stop(t+.18)}
function snare(t){let n=ctx.createBufferSource(),g=ctx.createGain(),f=ctx.createBiquadFilter();n.buffer=noiseBuffer;f.type='highpass';f.frequency.value=1200;g.gain.setValueAtTime(.12,t);g.gain.exponentialRampToValueAtTime(.0001,t+.1);n.connect(f);f.connect(g);g.connect(musicBus);n.start(t);n.stop(t+.11)}
function hat(t){let n=ctx.createBufferSource(),g=ctx.createGain(),f=ctx.createBiquadFilter();n.buffer=noiseBuffer;f.type='highpass';f.frequency.value=6000;g.gain.setValueAtTime(.025,t);g.gain.exponentialRampToValueAtTime(.0001,t+.025);n.connect(f);f.connect(g);g.connect(musicBus);n.start(t);n.stop(t+.03)}
// Deliberately original minor-tritone motif: playful nursery cadence smashed into industrial rhythm.
const riff=[55,55,65.41,55,77.78,73.42,55,49],lead=[220,261.63,233.08,311.13,220,196,207.65,155.56];
function schedule(){if(!ctx||!enabled)return;let now=ctx.currentTime+.04;for(let i=0;i<32;i++){let s=(step+i)%32,t=now+i*STEP;if(s%4===0)kick(t);if(s%8===4)snare(t);if(intensity>1&&s%2===0)hat(t);if(s%4===0){let f=riff[(s/4)%8];osc(f,t,STEP*3.4,'sawtooth',.055*intensity);osc(f,t,STEP*3.4,'square',.018*intensity,-12)}if(intensity>1.35&&s%8===6)osc(lead[(s/4|0)%8],t,STEP*1.7,'square',.018)}step=(step+32)%32;timer=setTimeout(schedule,32*STEP*1000-120)}
function start(){init();ctx.resume();if(!timer){step=0;schedule()}setTimeout(()=>{$('#musicToggle')?.classList.add('alive')},200)}
function toggle(){init();enabled=!enabled;if(enabled){musicBus.gain.setTargetAtTime(.24,ctx.currentTime,.05);if(!timer)schedule()}else{musicBus.gain.setTargetAtTime(.0001,ctx.currentTime,.05);clearTimeout(timer);timer=null}let b=$('#musicToggle');if(b)b.textContent=enabled?'♫':'×♫'}
function addUI(){if($('#musicToggle'))return;let b=document.createElement('button');b.id='musicToggle';b.textContent='♫';b.setAttribute('aria-label','Toggle music');b.onclick=toggle;document.body.appendChild(b)}
addUI();document.querySelectorAll('.start').forEach(b=>b.addEventListener('click',start));
// Music becomes nastier as the visible wave count rises.
setInterval(()=>{let n=parseInt($('#wave')?.textContent?.match(/\d+/)?.[0]||1);intensity=n>=10?1.7:n>=5?1.45:n>=3?1.2:1},900);
document.addEventListener('visibilitychange',()=>{if(!ctx)return;if(document.hidden)ctx.suspend();else if(enabled)ctx.resume()});
