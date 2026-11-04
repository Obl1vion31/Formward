import assert from "node:assert/strict";
export async function checkLoginStage({browser,baseURL,account,artifacts,engine}){
 const results=[];
 for(const [width,height] of [[1440,900],[1100,700],[390,720]]){
  const mobile=width<700,context=await browser.newContext({viewport:{width,height},locale:"zh-CN",isMobile:mobile,hasTouch:mobile}),p=await context.newPage();
  try{
   await p.goto(baseURL);await p.waitForFunction(()=>document.querySelector('.home-page')?.getAttribute("data-images-ready")==="true",{},{timeout:25000});
   if(mobile)await p.locator(".home-stage").tap({position:{x:180,y:100}});else{await p.mouse.move(700,400);await p.mouse.wheel(0,160);}
   await p.waitForFunction(()=>document.querySelector(".home-page")?.getAttribute("data-phase")==="LOGIN_READY");await p.waitForTimeout(700);
   await p.getByLabel("Email",{exact:true}).fill(account.email);await p.getByLabel("Password",{exact:true}).fill("fictional-bad-password");
   const measure=()=>p.locator(".home-stage").evaluate(n=>{const b=n.getBoundingClientRect();return {top:b.top,width:b.width,scrollY,clientWidth:document.documentElement.clientWidth};});
   const before=await measure();
   await p.route("**/api/auth/sign-in/email",async r=>{await new Promise(resolve=>setTimeout(resolve,1100));await r.fulfill({status:401,contentType:"application/json",body:JSON.stringify({message:"Invalid email or password",code:"INVALID_EMAIL_OR_PASSWORD"})});});
   await p.getByRole("button",{name:"ENTER",exact:true}).click();await p.locator("dialog.page-loading-dialog[open]").waitFor();
   const during=await measure();assert.ok(Math.abs(before.top-during.top)<=1,"加载不能使舞台上跳");assert.ok(Math.abs(before.width-during.width)<=1,"加载不能横向挤动舞台");
   await p.locator("#login-error").waitFor();const after=await measure();assert.ok(Math.abs(before.top-after.top)<=1);assert.ok(Math.abs(before.width-after.width)<=1);
   await p.screenshot({path:artifacts+"/"+engine+"-login-"+width+".png"});results.push({width,height,before,during,after});
   if(width===1440){
    await p.unroute("**/api/auth/sign-in/email");await p.getByLabel("Password",{exact:true}).fill(account.password);
    await p.getByRole("button",{name:"ENTER",exact:true}).click();await p.waitForURL(baseURL+"/dashboard",{timeout:20000});results.push({successfulLogin:true,finalAnimationPreserved:true});
   }
  }finally{await context.close();}
 }
 return results;
}
