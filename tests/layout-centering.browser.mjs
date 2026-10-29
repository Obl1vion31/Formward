import assert from "node:assert/strict";
import {mkdir,writeFile} from "node:fs/promises";

export async function checkLayoutCentering({baseURL,page,engine="chromium"}){
 const folder=process.env.FORMWARD_CENTERING_ARTIFACTS??".codex/centering-visual/"+engine;
 const baseline=process.env.FORMWARD_CENTERING_CAPTURE_ONLY==="1",measurements=[],screens=[];
 await mkdir(folder,{recursive:true});
 const pages=[["overview","/dashboard"],["meals","/dashboard/meals"],["energy","/dashboard/energy"],["body","/dashboard/measurements"]];
 async function visit(path){await page.waitForLoadState("networkidle");await page.goto(baseURL+path);await page.waitForLoadState("networkidle");await page.evaluate(()=>document.fonts.ready);await page.locator("[data-record-workspace]").waitFor();await page.waitForTimeout(150);}
 async function shot(name){const path=folder+"/"+name+".png";await page.screenshot({path});screens.push(path);}
 async function bounds(){return page.evaluate(()=>{
  const rect=selector=>{const r=document.querySelector(selector).getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};};
  const page=rect(".dashboard-page"),content=rect("[data-record-workspace]");
  const trigger=[...document.querySelectorAll('button[aria-label="工具"]')].find(n=>n.getClientRects().length>0);
  const t=trigger.getBoundingClientRect();
  return {page,content,tool:{x:t.x,y:t.y,width:t.width,height:t.height},viewportHeight:innerHeight,centerDeltaX:content.x+content.width/2-(page.x+page.width/2),toolDeltaY:t.y+t.height/2-innerHeight/2};
 });}
 for(const [width,height] of (baseline?[[1440,900]]:[[1100,900],[1440,900],[1920,1080],[1440,640],[320,560],[390,640],[430,780]])){
  await page.setViewportSize({width,height});
  for(const [name,path] of pages){
   await visit(path);await page.evaluate(()=>scrollTo(0,0));const before=await bounds();measurements.push({name,width,height,...before});
   if(!baseline){assert.ok(Math.abs(before.centerDeltaX)<=1,name+" main must be horizontally centered "+JSON.stringify(before));if(width>700)assert.ok(Math.abs(before.toolDeltaY)<=1,"tool center must match viewport center "+JSON.stringify(before));}
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),"no horizontal overflow");
   const nav=page.locator(width>700?".desktop-record-nav":".mobile-bottom-nav");assert.ok(await nav.isVisible());
   if(width>700){const n=await nav.boundingBox();assert.ok(n.x+n.width<=before.content.x,"left navigation does not overlap main");}
   await shot(name+"-"+width+"x"+height);
   if(name==="overview"){
    const trigger=page.getByRole("button",{name:"工具",exact:true});await trigger.click();const dialog=page.getByRole("dialog",{name:"工具",exact:true});await dialog.waitFor();await page.waitForTimeout(350);const after=await bounds();assert.ok(Math.abs(before.content.x-after.content.x)<=1&&Math.abs(before.content.width-after.content.width)<=1,"drawer does not recenter or resize main");await shot("tools-"+width+"x"+height);await page.keyboard.press("Escape");await dialog.waitFor({state:"hidden"});assert.ok(await trigger.evaluate(n=>n===document.activeElement));
    await page.evaluate(()=>scrollTo(0,document.body.scrollHeight));const scrolled=await bounds();if(width>700&&!baseline)assert.ok(Math.abs(scrolled.toolDeltaY)<=1,"tools stay centered while scrolling");
   }
  }
 }
 // Secondary pages retain their mobile bottom-right shortcut, without the desktop centering transform.
 for(const path of ["/dashboard/ai","/dashboard/export"]){
  await page.setViewportSize({width:390,height:640});await page.waitForLoadState("networkidle");await page.goto(baseURL+path);await page.waitForLoadState("networkidle");const t=page.getByRole("button",{name:"工具",exact:true});await t.waitFor();const r=await t.boundingBox();if(!baseline){assert.ok(Math.abs(640-r.y-r.height-16)<=1,"secondary mobile tool keeps bottom gap");assert.equal(await t.evaluate(n=>getComputedStyle(n).transform),"none");}await shot(path.split("/").at(-1)+"-mobile-tool");
 }
 // Resizing and reduced motion use the same geometry, with no stale dimensions.
 await page.emulateMedia({reducedMotion:"reduce"});await page.setViewportSize({width:1440,height:900});await visit("/dashboard");let result=await bounds();if(!baseline){assert.ok(Math.abs(result.centerDeltaX)<=1);assert.ok(Math.abs(result.toolDeltaY)<=1);}await page.emulateMedia({reducedMotion:"no-preference"});
 if(!baseline){
  for(const [width,height] of [[1100,700],[1440,900]]){await page.setViewportSize({width,height});await page.waitForTimeout(150);const resized=await bounds();assert.ok(Math.abs(resized.centerDeltaX)<=1);assert.ok(Math.abs(resized.toolDeltaY)<=1);}
  try{await page.evaluate(()=>document.body.style.zoom="1.5");await page.waitForTimeout(150);const zoomed=await bounds();assert.ok(Math.abs(zoomed.centerDeltaX)<=1,"150% zoom main center");assert.ok(Math.abs(zoomed.toolDeltaY)<=1,"150% zoom tools center");await shot("overview-zoom-150");}finally{await page.evaluate(()=>document.body.style.zoom="");}
 }
 const report={passed:!baseline,baseline,engine,measurements,screens,realIOS:"未测",softwareKeyboard:"未测"};
 await writeFile(folder+"/report.json",JSON.stringify(report,null,2));
 console.log(JSON.stringify({engine,baseline,screens:screens.length,maxHorizontalOffset:Math.max(...measurements.map(m=>Math.abs(m.centerDeltaX))),maxDesktopVerticalOffset:Math.max(...measurements.filter(m=>m.width>700).map(m=>Math.abs(m.toolDeltaY)))}));
}
