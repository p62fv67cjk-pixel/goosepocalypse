// Browser smoke test: real WebGL canvas, portrait/landscape, and no uncaught JS errors.
// Chromium emulation is not a substitute for testing physical iPhone Safari.
const {chromium}=require('playwright');
const fs=require('node:fs');
(async()=>{
 fs.mkdirSync('test-artifacts',{recursive:true});
 const browser=await chromium.launch({headless:true,args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--disable-web-security=false']});
 try{
  for(const [name,width,height] of [['portrait',390,844],['landscape',844,390]]){
   const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:1,isMobile:true,hasTouch:true});
   const errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   await page.goto('http://127.0.0.1:8765/',{waitUntil:'domcontentloaded'});
   await page.waitForTimeout(4000);
   const result=await page.evaluate(()=>{
    const canvas=document.querySelector('#game'),menu=document.querySelector('#menu');
    const gl=canvas.getContext('webgl2')||canvas.getContext('webgl');
    return {canvasWidth:canvas.width,canvasHeight:canvas.height,webgl:!!gl,menu:!!menu,viewport:[innerWidth,innerHeight]};
   });
   await page.screenshot({path:'test-artifacts/'+name+'-menu.png',fullPage:true});
   if(!result.webgl||!result.canvasWidth||!result.canvasHeight)throw Error(name+' WebGL canvas not ready: '+JSON.stringify(result));
   await page.locator('.start').click();
   await page.waitForTimeout(1500);
   await page.screenshot({path:'test-artifacts/'+name+'-game.png',fullPage:true});
   const visible=await page.locator('#menu').evaluate(el=>getComputedStyle(el).display!=='none');
   if(visible)throw Error(name+' game did not leave menu');
   if(errors.length)throw Error(name+' uncaught errors: '+errors.join(' | '));
   console.log(name+' rendered:',JSON.stringify(result));
   await page.close();
  }
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
