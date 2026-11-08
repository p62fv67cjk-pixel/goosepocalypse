// Sample the entire horizontal movement path, not just the endpoint.
// A fast sprint or throttled mobile frame must not tunnel through thin cover.
export function canTraverse(startX,startZ,endX,endZ,blocked,stepSize=0.12){
 if(![startX,startZ,endX,endZ,stepSize].every(Number.isFinite)||stepSize<=0||typeof blocked!=='function')return false;
 const distance=Math.hypot(endX-startX,endZ-startZ);
 const steps=Math.max(1,Math.ceil(distance/stepSize));
 for(let i=1;i<=steps;i++){
  const t=i/steps;
  if(blocked(startX+(endX-startX)*t,startZ+(endZ-startZ)*t))return false;
 }
 return true;
}
