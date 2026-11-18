import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {eq} from 'drizzle-orm';
import * as schema from '../src/db/schema.ts';

/** 实际登录、HTTP入口、worker和模拟供应商共同运行；不保存正式健康事实。 */
export async function runMembershipContextSmoke(db){
 const fixture=JSON.parse(await readFile(process.env.FORMWARD_CHAT_BROWSER_CONFIG,'utf8')),base=fixture.baseURL,checks=[];
 const healthTables={meals:schema.meal,measurements:schema.measurement,energy:schema.energyDay,activities:schema.activity,training:schema.trainingSession};
 async function counts(){return Object.fromEntries(await Promise.all(Object.entries(healthTables).map(async([name,table])=>[name,(await db.select({id:table.id}).from(table)).length])));}
 const before=await counts();
 async function login(account){const response=await fetch(base+'/api/auth/sign-in/email',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify({email:account.email,password:account.password})});assert.equal(response.status,200);return response.headers.getSetCookie().map(value=>value.split(';')[0]).join('; ');}
 async function call(cookie,path,body,status=200){
  const response=await fetch(base+path,{method:body?'POST':'GET',headers:{Cookie:cookie,Origin:base,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(45000)});
  const text=await response.text();assert.equal(response.status,status,`${path}: ${text.slice(0,600)}`);
  assert.ok(!text.includes('membership_configuration')&&!text.includes('会员配置尚未就绪'));
  return response.headers.get('content-type')?.includes('text/event-stream')?text:JSON.parse(text);
 }
 const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const [ownerImage]=await db.select().from(schema.mealImage).where(eq(schema.mealImage.id,fixture.imageId));assert.ok(ownerImage);
 await db.update(schema.user).set({membershipTier:'beta',membershipTierId:'beta'}).where(eq(schema.user.id,fixture.other.id));
 const betaImageId=randomUUID();await db.insert(schema.mealImage).values({...ownerImage,id:betaImageId,userId:fixture.other.id,createdBy:fixture.other.id,pathname:'meal-formal-v2/'+fixture.other.id+'/membership-fixture.png'});
 for(const[role,account,imageId]of[['owner',fixture.account,fixture.imageId],['beta',fixture.other,betaImageId]]){
  const cookie=await login(account),initial=await call(cookie,'/api/assistant-chat');assert.equal(initial.entitlement.chat,true);
  await call(cookie,'/api/assistant-chat/control',{action:'enable',provider:'qwen'});
  const current=await call(cookie,'/api/assistant-chat');
  const stream=await call(cookie,'/api/assistant-chat',{action:'send',requestId:randomUUID(),provider:'qwen',conversationId:current.conversationId,text:'查询最近七天体重',timezone:'Asia/Shanghai'});assert.ok(stream.includes('"type":"done"'));
  const answer=await call(cookie,'/api/assistant-chat');assert.ok(answer.messages.some(message=>message.role==='assistant'&&message.state==='complete'&&message.text.includes('已查询你的近七天实测记录')));checks.push(role+'实际聊天HTTP与worker完成');
  const meal=await call(cookie,'/api/assistant-meal',{action:'create',draftKey:randomUUID(),draft:{date,mealType:'午餐',items:[],imageIds:[],timezone:'Asia/Shanghai'}});
  assert.ok(meal.taskId);await call(cookie,'/api/assistant-meal?taskId='+meal.taskId);
  await call(cookie,'/api/assistant-meal',{action:'enable_model',taskId:meal.taskId,provider:'qwen'});
  const mealStream=await call(cookie,'/api/assistant-meal',{action:'run',taskId:meal.taskId,requestId:randomUUID(),provider:'qwen',imageIds:[imageId],text:'1份',timezone:'Asia/Shanghai'});assert.ok(mealStream.includes('"type":"done"'));
  const recognized=await call(cookie,'/api/assistant-meal?taskId='+meal.taskId);assert.ok(recognized.previewId,'识图应产生待确认结果');assert.ok(recognized.messages.some(message=>message.role==='assistant'&&message.state==='complete'));assert.ok(recognized.operation);checks.push(role+'实际识图HTTP、照片归属、worker及待确认结果完成');
 }
 const betaCookie=await login(fixture.other);await db.update(schema.user).set({membershipTier:'free',membershipTierId:'free'}).where(eq(schema.user.id,fixture.other.id));
 const free=await call(betaCookie,'/api/assistant-chat');assert.equal(free.entitlement.chat,false);assert.equal(free.entitlement.dailyRecognitionLimit,4);
 const denied=await call(betaCookie,'/api/assistant-chat',{action:'send',requestId:randomUUID(),provider:'qwen',conversationId:free.conversationId,text:'不应发送模型',timezone:'Asia/Shanghai'},403);assert.equal(denied.code,'chat_unavailable');checks.push('Free聊天拒绝且保留4次识图规则');
 await db.update(schema.user).set({aiPaused:true}).where(eq(schema.user.id,fixture.other.id));
 const paused=await call(betaCookie,'/api/assistant-meal',{action:'create',draftKey:randomUUID(),draft:{date,mealType:'午餐',items:[]}},403);assert.equal(paused.code,'meal_ai_disabled');checks.push('个人暂停仍拒绝识图');
 const after=await counts();assert.deepEqual(after,before);checks.push('五类正式健康表数量保持');
 const report={passed:true,managedMembershipRequired:true,checks,healthCountsBefore:before,healthCountsAfter:after,provider:'仅测试进程加载的模型回放',paidModelRequests:0,productionWrites:0};
 await writeFile(join(process.env.FORMWARD_CHAT_ARTIFACTS,'membership-context.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}
