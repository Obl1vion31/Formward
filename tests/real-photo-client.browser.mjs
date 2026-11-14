import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {parseEnv} from 'node:util';
import {createHash,randomUUID} from 'node:crypto';
import COS from 'cos-nodejs-sdk-v5';
import {eq,sql} from 'drizzle-orm';
import * as schema from '../src/db/schema.ts';
/** 仅PGlite虚构账号；显式私有COS配置，不读取正式DB，不调用收费模型。 */
export async function checkRealPhotoClient(db){
 const fixture=JSON.parse(await readFile(process.env.FORMWARD_CHAT_BROWSER_CONFIG,'utf8')),dir=process.env.FORMWARD_CHAT_ARTIFACTS;
 assert.equal(fixture.isolatedFixture,'pglite');assert.equal(fixture.baseURL,'http://127.0.0.1:3300');
 const env=parseEnv(await readFile(process.env.FORMWARD_REAL_PHOTO_CONFIG,'utf8')),cos=new COS({SecretId:env.FORMWARD_COS_SECRET_ID,SecretKey:env.FORMWARD_COS_SECRET_KEY,Timeout:15000}),bucket={Bucket:env.FORMWARD_COS_BUCKET,Region:env.FORMWARD_COS_REGION};
 const chromium=(await import(process.env.PLAYWRIGHT_MODULE??'/home/obl1vion/.local/formward-tools/node_modules/playwright/index.mjs')).chromium;
 const webkit=(await import(process.env.FORMWARD_WEBKIT_MODULE??'/home/obl1vion/.local/formward-webkit-165/node_modules/playwright/index.mjs')).webkit;
 const paths=new Set(),results=[];
 async function health(){const result=[];for(const name of ['meals','meal_items','measurements','energy_days','activities']){const data=await db.execute(sql.raw("select count(*)::int count,md5(string_agg(to_jsonb(t)::text,'' order by id)) digest from "+name+" t"));result.push({name,rows:data.rows??data});}return JSON.stringify(result);}
 const before=await health();
 try{
  for(const [engine,launcher]of [['chromium',chromium],['webkit',webkit]]){
   const browser=await launcher.launch({headless:true});
   try{
    const context=await browser.newContext({viewport:{width:390,height:844},locale:'zh-CN',timezoneId:'Asia/Shanghai',reducedMotion:'reduce'}),page=await context.newPage();let modelPosts=0;
    await page.route('**/api/assistant-chat',async route=>{if(route.request().method()==='POST'){modelPosts++;await route.abort();}else await route.continue();});
    const login=await context.request.post(fixture.baseURL+'/api/auth/sign-in/email',{headers:{Origin:fixture.baseURL},data:fixture.account});assert.equal(login.status(),200);
    await page.addInitScript(()=>{window.__actualPhotoBytes=[];const send=XMLHttpRequest.prototype.send;XMLHttpRequest.prototype.send=function(body){this.upload.addEventListener('progress',event=>{if(event.lengthComputable)window.__actualPhotoBytes.push({loaded:event.loaded,total:event.total});});return send.call(this,body);};});
    page.on('response',async response=>{try{if(response.url()!==fixture.baseURL+'/api/meal-images/upload')return;const request=response.request();if(request.headers()['content-type']?.includes('application/json')&&request.postDataJSON()?.step==='prepare'){const data=await response.json();if(data.pathname?.startsWith('meal-tmp-v2/'+fixture.userId+'/'))paths.add(data.pathname);}}catch{}});
    await page.goto(fixture.baseURL+'/dashboard');await page.locator('[data-assistant-trigger]:visible').click();const panel=page.getByRole('dialog',{name:'小助手',exact:true});await panel.getByRole('button',{name:'千问',exact:true}).waitFor();
    for(const mode of ['direct','relay']){
     const bytes=Buffer.concat([Buffer.from(fixture.imageBytes,'base64'),Buffer.from(randomUUID()),Buffer.alloc(mode==='relay'?5*1024*1024:1024*1024,7)]),file={name:'虚构原图-'+mode+'.png',mimeType:'image/png',buffer:bytes};
     if(mode==='relay')await page.route('https://'+bucket.Bucket+'.cos.'+bucket.Region+'.myqcloud.com/**',route=>route.abort('internetdisconnected'));
     console.log(JSON.stringify({engine,mode,phase:'starting',bytes:bytes.length}));await panel.locator('input[type=file]').setInputFiles(file);
     if(mode==='relay'){await panel.getByRole('button',{name:'换方式上传',exact:true}).waitFor({timeout:20000});await page.screenshot({path:join(dir,engine+'-real-relay-error.png')});await panel.getByRole('button',{name:'换方式上传',exact:true}).click();}
     try{await panel.locator('[data-photo-phase=ready]').waitFor({timeout:150000});}catch(error){await page.screenshot({path:join(dir,engine+'-real-'+mode+'-failure.png')});await writeFile(join(dir,engine+'-real-'+mode+'-failure.json'),JSON.stringify({phase:await panel.locator('[data-photo-phase]').first().getAttribute('data-photo-phase'),status:await panel.locator('[data-photo-phase]').first().innerText(),progress:await page.evaluate(()=>window.__actualPhotoBytes),error:String(error)},null,2));throw error;}
     const [image]=await db.select().from(schema.mealImage).where(eq(schema.mealImage.sha256,createHash('sha256').update(bytes).digest('hex')));assert.ok(image);assert.equal(image.userId,fixture.userId);assert.ok(image.pathname.startsWith('meal-formal-v2/'+fixture.userId+'/'));paths.add(image.pathname);
     const original=await context.request.get(fixture.baseURL+'/api/meal-images/'+image.id);assert.equal(original.status(),200);assert.deepEqual(await original.body(),bytes);
     assert.equal((await fetch(fixture.baseURL+'/api/meal-images/'+image.id)).status,401);
     await page.screenshot({path:join(dir,engine+'-real-'+mode+'-ready.png')});
     const progress=await page.evaluate(()=>window.__actualPhotoBytes);assert.ok(progress.some(event=>event.loaded>0&&event.total>0),'真实XHR上传字节事件');
     results.push({engine,mode,bytes:bytes.length,byteIdentical:true,private:true,progressEvents:progress.length});
     await panel.getByRole('button',{name:'移除照片 1',exact:true}).click();if(mode==='relay')await page.unroute('https://'+bucket.Bucket+'.cos.'+bucket.Region+'.myqcloud.com/**');
    }
    assert.equal(modelPosts,0);
   }finally{await browser.close();}
  }
  assert.equal(await health(),before);await writeFile(join(dir,'real-photo-report.json'),JSON.stringify({results,modelCalls:0,healthUnchanged:true,physicalIphone:'not-tested'},null,2));console.log(JSON.stringify({realPhotoCases:results.length,engines:['chromium','webkit'],healthUnchanged:true,modelCalls:0,physicalIphone:'not-tested'}));
 }finally{
  const rows=await db.select().from(schema.mealImage).where(eq(schema.mealImage.userId,fixture.userId));for(const row of rows)if(row.id!==fixture.imageId)paths.add(row.pathname);
  for(const pathname of paths){assert.ok(pathname.startsWith('meal-tmp-v2/'+fixture.userId+'/')||pathname.startsWith('meal-formal-v2/'+fixture.userId+'/'));await cos.deleteObject({...bucket,Key:pathname});}
 }
}
