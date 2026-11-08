// Sample the entire horizontal movement path, not just the endpoint.
// A fast sprint or throttled mobile frame must not tunnel through thin cover.
// Reject pathological displacements rather than freezing Safari with millions
// of collision callbacks (for example after invalid physics state recovery).
export function canTraverse(startX,startZ,endX,endZ,blocked,stepSize=0.025){
 if(![startX,startZ,endX,endZ,stepSize].every(Number.isFinite)||stepSize<=0||typeof blocked!=='function')return false;
 const distance=Math.hypot(endX-startX,endZ-startZ);
 if(!Number.isFinite(distance))return false;
 const steps=Math.max(1,Math.ceil(distance/stepSize));
 if(!Number.isSafeInteger(steps)||steps>4096)return false;
 for(let i=1;i<=steps;i++){
  const t=i/steps;
  if(blocked(startX+(endX-startX)*t,startZ+(endZ-startZ)*t))return false;
 }
 return true;
}
