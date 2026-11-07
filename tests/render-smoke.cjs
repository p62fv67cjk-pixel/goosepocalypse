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
   const menuShot=await page.screenshot({path:'test-artifacts/'+name+'-menu.png',fullPage:true});
   if(menuShot.length<5000)throw Error(name+' menu screenshot unexpectedly small');
   if(!result.webgl||!result.canvasWidth||!result.canvasHeight)throw Error(name+' WebGL canvas not ready: '+JSON.stringify(result));
   // Exercise real menu interactions rather than merely bypassing the menu.
   await page.locator('.pick[data-hero="Mummy"]').click();
   if(!await page.locator('.pick[data-hero="Mummy"]').evaluate(el=>el.classList.contains('on')))throw Error(name+' Mummy selection failed');
   // Guard against invisible image-map buttons overlapping: Play must not steal difficulty taps.
   const hitboxes=await page.evaluate(()=>{
    const difficulty=document.querySelector('.difficulties').getBoundingClientRect();
    const play=document.querySelector('.start').getBoundingClientRect();
    return {difficultyBottom:difficulty.bottom,playTop:play.top};
   });
   if(hitboxes.difficultyBottom>hitboxes.playTop)throw Error(name+' menu hitboxes overlap: '+JSON.stringify(hitboxes));
   await page.locator('.difficulty[data-difficulty="hard"]').click();
   if(!await page.locator('.difficulty[data-difficulty="hard"]').evaluate(el=>el.classList.contains('on')))throw Error(name+' difficulty selection failed');
   // Test the second hero and every difficulty without relying on desktop hover.\n   await page.locator('.pick[data-hero="Phoenix"]').click();\n   if(!await page.locator('.pick[data-hero="Phoenix"]').evaluate(el=>el.classList.contains('on')))throw Error(name+' Phoenix selection failed');\n   for(const level of ['easy','medium','hard']){\n    await page.locator('.difficulty[data-difficulty="'+level+'"]').click();\n    if(!await page.locator('.difficulty[data-difficulty="'+level+'"]').evaluate(el=>el.classList.contains('on')))throw Error(name+' '+level+' difficulty selection failed');\n   }\n   // Return to Mummy before starting, so both characters are exercised.\n   await page.locator('.pick[data-hero="Mummy"]').click();\n   await page.locator('.start').click();
   await page.waitForTimeout(1500);
   const gameShot=await page.screenshot({path:'test-artifacts/'+name+'-game.png',fullPage:true});
   if(gameShot.length<5000)throw Error(name+' gameplay screenshot unexpectedly small');
   // Catch a stale/frozen menu frame: gameplay must render a visibly different frame.
   if(gameShot.equals(menuShot))throw Error(name+' gameplay screenshot is identical to menu screenshot');
   const inGame=await page.evaluate(()=>({width:document.querySelector('#game').width,height:document.querySelector('#game').height}));
   if(inGame.width<width*.75||inGame.height<height*.75)throw Error(name+' game canvas not resized to viewport: '+JSON.stringify(inGame));
   const visible=await page.locator('#menu').evaluate(el=>getComputedStyle(el).display!=='none');
   if(visible)throw Error(name+' game did not leave menu');
   // Keep the game running briefly to catch animation-loop errors after startup.\n   await page.waitForTimeout(3000);\n   if(errors.length)throw Error(name+' uncaught errors: '+errors.join(' | '));
   console.log(name+' rendered:',JSON.stringify(result));
   await page.close();
  }
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
