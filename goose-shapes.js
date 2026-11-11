// Pure geometry generators for the realistic goose body, neck, bill and webbed foot.
//
// Deliberately free of any three.js import: every shape is plain arrays {pos,nor,uv,idx} (indexed triangles,
// outward-facing, analytic normals) so the maths can be unit-tested in plain Node. goose-rig.js bakes these shapes
// into its shared vertex-coloured geometries. All shapes are original work written for this game.
//
// Conventions: goose local space, head faces -Z, +Y up. Shapes are built around the origin and positioned by the rig.
export const TAU=Math.PI*2;

const norm=(x,y,z)=>{const l=Math.hypot(x,y,z)||1;return [x/l,y/l,z/l]};
const lerp=(a,b,t)=>a+(b-a)*t;

// Make every triangle agree with its vertex normals, so a winding mistake in a generator cannot produce inside-out faces.
function orient(shape){
 const {pos,nor,idx}=shape;
 for(let t=0;t<idx.length;t+=3){
  const a=idx[t]*3,b=idx[t+1]*3,c=idx[t+2]*3;
  const e1x=pos[b]-pos[a],e1y=pos[b+1]-pos[a+1],e1z=pos[b+2]-pos[a+2];
  const e2x=pos[c]-pos[a],e2y=pos[c+1]-pos[a+1],e2z=pos[c+2]-pos[a+2];
  const fx=e1y*e2z-e1z*e2y,fy=e1z*e2x-e1x*e2z,fz=e1x*e2y-e1y*e2x;
  const d=fx*(nor[a]+nor[b]+nor[c])+fy*(nor[a+1]+nor[b+1]+nor[c+1])+fz*(nor[a+2]+nor[b+2]+nor[c+2]);
  if(d<0){const tmp=idx[t+1];idx[t+1]=idx[t+2];idx[t+2]=tmp}
 }
 return shape;
}

// (rings+1) x (seg+1) vertex grid. fn(v,u) -> {p,n,uv}; v runs along the shape, u around it.
function grid(rings,seg,fn){
 const pos=[],nor=[],uv=[],idx=[],stride=seg+1;
 for(let i=0;i<=rings;i++)for(let j=0;j<=seg;j++){
  const o=fn(i/rings,j/seg),n=norm(o.n[0],o.n[1],o.n[2]);
  pos.push(o.p[0],o.p[1],o.p[2]);nor.push(n[0],n[1],n[2]);uv.push(o.uv[0],o.uv[1]);
 }
 for(let i=0;i<rings;i++)for(let j=0;j<seg;j++){const a=i*stride+j,b=a+stride;idx.push(a,b,a+1,b,b+1,a+1)}
 return orient({pos,nor,uv,idx});
}

// Torso: a smooth teardrop. Full, deep chest and belly at the front (-Z), narrowing and lifting towards the rump (+Z).
// Spans x +-.62, y -.56..+.67 (rump lift included) and z +-length around the origin.
export function bodyShape({seg=26,rings=18,length=.99}={}){
 return grid(rings,seg,(v,u)=>{
  const th=v*Math.PI,ph=u*TAU;
  const z=-Math.cos(th),r=Math.sin(th),x=r*Math.cos(ph),y=r*Math.sin(ph);   // unit sphere with poles on the Z axis
  const back=z>0?z:0,front=z<0?-z:0;
  const w=.62*(1-.46*back*back)*(1-.2*front*front);
  const h=(y>=0?.5*(1-.34*back*back):.56*(1-.12*back*back))*(1-.12*front*front);
  return {
   p:[x*w,y*h+.17*back*back-.03*front,z*length],
   n:[x/w,y/h,z/length],                                                   // ellipsoid gradient: no seam artefacts
   uv:[u*4,v*3],
  };
 });
}

// Uniform Catmull-Rom spline through pts, sampled n+1 times.
export function spline(pts,n){
 const out=[],m=pts.length-1,P=i=>pts[Math.max(0,Math.min(m,i))];
 for(let k=0;k<=n;k++){
  const f=k/n*m,i=Math.min(m-1,Math.floor(f)),t=f-i,t2=t*t,t3=t2*t;
  const p0=P(i-1),p1=P(i),p2=P(i+1),p3=P(i+2),pt=[0,0,0];
  for(let a=0;a<3;a++)pt[a]=.5*(2*p1[a]+(-p0[a]+p2[a])*t+(2*p0[a]-5*p1[a]+4*p2[a]-p3[a])*t2+(-p0[a]+3*p1[a]-3*p2[a]+p3[a])*t3);
  out.push(pt);
 }
 return out;
}
function radiusAt(stops,t){
 if(t<=stops[0][0])return stops[0][1];
 for(let i=1;i<stops.length;i++)if(t<=stops[i][0]){const a=stops[i-1],b=stops[i];return lerp(a[1],b[1],(t-a[0])/(b[0]-a[0]||1))}
 return stops[stops.length-1][1];
}

// Curved tube along a spline that lies (mostly) in the YZ plane, with a radius profile given as [t,radius] stops.
// Used for the S-curved neck. The ring frame uses world X as the side axis, so the path must never run along X.
export function tubeShape(points,stops,{radial=12,samples=14}={}){
 const C=spline(points,samples);
 return grid(samples,radial,(v,u)=>{
  const k=Math.round(v*samples),c=C[k],a=C[Math.max(0,k-1)],b=C[Math.min(samples,k+1)];
  const t=norm(b[0]-a[0],b[1]-a[1],b[2]-a[2]);
  const un=norm(0,t[2],-t[1]);                                            // T x X
  const r=radiusAt(stops,v),ph=u*TAU,cx=Math.cos(ph),sx=Math.sin(ph);
  const nx=cx,ny=sx*un[1],nz=sx*un[2];
  return {p:[c[0]+r*nx,c[1]+r*ny,c[2]+r*nz],n:[nx,ny,nz],uv:[u*3,v*2]};
 });
}

// Goose bill: a tapered, flat-topped wedge that points towards -Z from the origin, with a rounded tip.
// hw/hh are half-width / half-height at the base (0) and the tip (1); droop lowers the tip slightly.
export function billShape({len=.4,hw0=.15,hw1=.08,hh0=.07,hh1=.04,droop=.03,rings=8,radial=10}={}){
 return grid(rings,radial,(t,u)=>{
  const ph=u*TAU,c=Math.cos(ph),s=Math.sin(ph);
  const e=t>.85?Math.sqrt(Math.max(0,1-Math.pow((t-.85)/.15,2))):1;      // rounded nail: radius collapses over the last 15%
  const hw=lerp(hw0,hw1,t)*e,hh=lerp(hh0,hh1,t)*e;
  const sx=Math.sign(c)*Math.pow(Math.abs(c),.7);                        // squarer cross-section than an ellipse
  const sy=Math.sign(s)*Math.pow(Math.abs(s),.8)*(s>0?1:.6);             // flatter underside
  return {
   p:[sx*hw,sy*hh-droop*t*t,-len*t],
   n:[c/Math.max(hw,.01),s/Math.max(hh,.01),t>.85?-(t-.85)/.15*.8:0],
   uv:[u*2,t*1.5],
  };
 });
}

// Webbed foot: a thin, flat web between three toes (toes point to -Z), centred on the ankle at the origin.
export function footShape({thick=.02}={}){
 const outline=[[-.06,.05],[-.16,-.14],[-.19,-.33],[-.09,-.22],[0,-.38],[.09,-.22],[.19,-.33],[.16,-.14],[.06,.05]];
 const n=outline.length,pos=[],nor=[],uv=[],idx=[];
 const layer=(y,ny)=>{
  const base=pos.length/3;
  pos.push(0,y,-.1);nor.push(0,ny,0);uv.push(0,0);
  for(const [x,z] of outline){pos.push(x,y,z);nor.push(0,ny,0);uv.push(0,0)}
  for(let i=0;i<n;i++)idx.push(base,base+1+i,base+1+((i+1)%n));
 };
 layer(thick/2,1);layer(-thick/2,-1);
 return orient({pos,nor,uv,idx});
}
