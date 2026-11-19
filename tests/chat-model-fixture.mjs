// 仅隔离浏览器进程通过node --import使用；正式运行包不引用本文件。
import {readFile} from 'node:fs/promises';
const fixture=JSON.parse(await readFile(process.env.FORMWARD_CHAT_BROWSER_FIXTURE,'utf8'));
const images = new Map(await Promise.all((fixture.samples??[]).map(async sample=>[sample.pathname,await readFile(sample.file)])));
const original=globalThis.fetch,allowed=new Set(['maas.qianwenaiapi.com','api.xiaomimimo.com','open.bigmodel.cn']);
function result(content,calls,slow=false){
 const usage={prompt_tokens:180,completion_tokens:60,prompt_tokens_details:{cached_tokens:40}};
 if(calls)return new Response('data: '+JSON.stringify({choices:[{delta:{tool_calls:calls},finish_reason:'tool_calls'}]})+'\n\ndata: '+JSON.stringify({choices:[],usage})+'\n\ndata: [DONE]\n\n',{headers:{'content-type':'text/event-stream'}});
 let cancelled=false;return new Response(new ReadableStream({cancel(){cancelled=true;},async start(controller){for(let i=0;i<content.length;i+=slow?4:24){if(cancelled)return;controller.enqueue(new TextEncoder().encode('data: '+JSON.stringify({choices:[{delta:{content:content.slice(i,i+(slow?4:24))},finish_reason:null}]})+'\n\n'));if(slow)await new Promise(resolve=>setTimeout(resolve,100));}if(cancelled)return;controller.enqueue(new TextEncoder().encode('data: '+JSON.stringify({choices:[{delta:{},finish_reason:'stop'}]})+'\n\ndata: '+JSON.stringify({choices:[],usage})+'\n\ndata: [DONE]\n\n'));controller.close();}}),{headers:{'content-type':'text/event-stream'}});
}
function call(name,args,suffix=''){return result('',[{index:0,id:'call-'+name+suffix,type:'function',function:{name,arguments:JSON.stringify(args)}}]);}
globalThis.fetch=async function(input,init){
 const url=new URL(typeof input==='string'||input instanceof URL?String(input):input.url);
 if(process.env.FORMWARD_TEST_REAL_COS!=='1'&&url.hostname.endsWith('.cos.ap-shanghai.myqcloud.com')){
  const bytes = images.get(decodeURIComponent(url.pathname).slice(1))??Buffer.from(fixture.imageBytes,'base64');
  return new Response(bytes,{headers:{'content-type':'image/png'}});
 }
 if(!allowed.has(url.hostname))return original(input,init);
 const body=JSON.parse(typeof init?.body==='string'?init.body:await input.clone().text()),lastUser=[...body.messages].reverse().find(message=>message.role==='user'),text=typeof lastUser?.content==='string'?lastUser.content:lastUser?.content?.find(part=>part.type==='text')?.text??'';
 if(String(body.messages[0]?.content).includes('饮食页内的独立拍照任务')){
   const last=body.messages.at(-1);
   if(last.role==='tool'&&/confirmationUrl|confirmationPath/.test(String(last.content)))return result('已整理本餐新增食物，请在当前餐次中核对后保存。');
   const supplied=text.includes('补充说明：')?text.split('补充说明：')[1].split('\n已有草稿')[0]:text;
   if(!/1份|一份|100克/.test(supplied))return call('request_followup',{subject:'本餐实际食量',question:'这份实际吃了多少？',questions:[{id:'amount',prompt:'实际食量',options:[{id:'half',label:'半份'},{id:'one',label:'1份'}],allowText:true}]});
   if(!body.tools.some(tool=>tool.function.name==='preview_meals'))return call('load_tools',{names:['preview_meals']});
   return call('preview_meals',{meals:[{date:'today',mealType:'午餐',foods:[{name:'AI 识别食物',quantity:'1',unit:'份',caloriesKcal:'290',proteinG:'20',carbsG:'30',fatG:'10',amountDecision:'provided',sourceKind:'estimated',basis:'隔离回放的示例结果，非真实识别'}]}]});
  }
  if (fixture.samples?.length && (text.includes('海南鸡饭') || text.includes('分批验收'))) {
   const last = body.messages.at(-1);
   const calls = body.messages.flatMap(message=>message.tool_calls??[]);
   const tools = new Set(body.tools.map(tool=>tool.function.name));
   if (text.includes('分批验收')) return result('〔正文〕这一批照片已读取。你可以回到原消息继续处理其余照片。',null,true);
   const supplement = text.startsWith('补充「');
   if (!supplement) {
    if (!tools.has('search_foods')) return call('load_tools',{names:['search_foods']});
    const count = calls.filter(call=>call.function.name==='search_foods').length;
    if (count<2) return call('search_foods',{q:count?'白切鸡':'鸡油饭'},String(count));
    return call('request_followup',{subject:'海南鸡饭份量',question:'鸡油饭和白切鸡各吃了多少？',questions:[
     {id:'rice',fieldKey:'food.amount:鸡油饭',prompt:'鸡油饭大约吃了多少？',
      options:[{id:'half',label:'半碗'},{id:'one',label:'一碗'}],allowText:true},
     {id:'chicken',fieldKey:'food.amount:白切鸡',prompt:'白切鸡大约吃了多少？',
      options:[{id:'small',label:'几块'},{id:'one',label:'一份'}],allowText:true}
    ]});
   }
   const chosen = text.match(/鸡油饭大约吃了多少？：([^\n]+)/)?.[1]??'';
   const chicken = text.match(/白切鸡大约吃了多少？：([^\n]+)/)?.[1]??'';
   const known = value=>value && value!=='不知道' && value!=='暂不填写';
   if (!calls.some(call=>call.function.name==='request_followup') && !known(chicken)) {
    return call('request_followup',{subject:'海南鸡饭份量',question:'还记得吃了几块鸡吗？',
      questions:[{id:'renamed',fieldKey:'food.amount:白切鸡',prompt:'还记得吃了几块鸡吗？',allowText:true}]});
   }
   if (!known(chosen) && !known(chicken)) return result('〔正文〕先按晚餐整理这份海南鸡饭，鸡油饭和白切鸡的实际份量均留空。你之后可以主动补充。',null,true);
   if (last.role==='tool' && /confirmationUrl/.test(String(last.content)))
    return result('〔正文〕按晚餐整理好了。'+(known(chosen)?'鸡油饭按'+chosen+'。':'鸡油饭份量留空。')+
      (known(chicken)?'白切鸡按'+chicken+'。':'白切鸡份量留空。')+'你可以在下方核对待保存记录。',null,true);
   if (!tools.has('preview_meals')) return call('load_tools',{names:['preview_meals']},'-meal');
   const textIds = String(body.messages[0]?.content).match(/附件ID：([^。]+)/)?.[1]??'';
   const ids = textIds.split('、').filter(id=>fixture.samples.some(sample=>sample.id===id));
   const quantity = chosen.includes('3/4')?'0.75':chosen.includes('一碗')?'1':'0.5';
   return call('preview_meals',{meals:[{date:'today',mealType:'晚餐',foods:[
    {name:'鸡油饭',...(known(chosen)?{quantity,unit:'碗',amountDecision:'provided',caloriesKcal:'160',sourceKind:'estimated',basis:'隔离回放的鸡油饭示例，按用户提供的份量记录，实际用油量未知。'}:{amountDecision:'unknown_accepted'})},
    {name:'白切鸡',quantity:'1',unit:'份',amountDecision:'provided'}
   ],...(ids.length?{imageIds:ids,expectedImageCount:ids.length}:{})}]});
  }
  if(text.includes('逐题补充验收')){
   return call('request_followup',{subject:'隔离多题补充',question:'请补充以下信息',questions:[
    {id:'source',prompt:'这次测量使用什么设备？',options:[{id:'scale',label:'测试体重秤'},{id:'app',label:'测试健康应用'}],allowText:true,optional:true},
    {id:'time',prompt:'什么时候测量的？',options:[{id:'morning',label:'晨间'},{id:'evening',label:'晚间'}],allowText:false},
    {id:'conditions',prompt:'有哪些需要保留的说明？',options:[{id:'before',label:'早餐前'},{id:'exercise',label:'运动后'}],multiple:true,allowText:true,optional:true}
   ]});
  }
  if(text.includes('来源卡片验收')||text.includes('测量来源')){
   const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
   if(!text.includes('OKOK')&&!text.includes('okok'))return call('request_followup',{subject:'当前体重',question:'这次测量使用的设备或应用？',questions:[{id:'source',prompt:'测量来源',binding:{kind:'measurement_source',date,period:'daytime'},allowText:true,optional:true}]});
   if(!body.tools.some(tool=>tool.function.name==='preview_measurements'))return call('load_tools',{names:['preview_measurements']});
   if(body.messages.at(-1).role==='tool'&&String(body.messages.at(-1).content).includes('confirmationUrl'))return result('已整理这条实测记录，请核对后确认保存。');
   return call('preview_measurements',{items:[{kind:'save_record',date,period:'daytime',weightKg:'67.00',fasting:true,timezone:'Asia/Shanghai'}]});
  }
  if(text.includes('消耗卡片验收')||text.includes('训练卡片验收')){
   const name=text.includes('消耗卡片验收')?'preview_energy':'preview_training';
   if(body.messages.at(-1).role==='tool'&&String(body.messages.at(-1).content).includes('confirmationUrl'))return result('已整理待核对内容，请确认后保存。');
   if(!body.tools.some(tool=>tool.function.name===name))return call('load_tools',{names:[name]});
   if(name==='preview_energy')return call(name,{days:[{date:'2026-09-09',timezone:'Asia/Shanghai',entryMode:'total',totalKcal:'2200',steps:6000,sourceSystem:'隔离设备'}]});
   return call(name,{items:[{kind:'save_training_template',key:'qa_template',template:{name:'隔离力量计划',exercises:[{name:'俯卧撑',sets:3,reps:10}]}},{kind:'schedule_training',key:'qa_plan',date:'2026-11-16',templateRef:'qa_template'}]});
  }
  if(text.includes('平台余额测试')&&body.model==='glm-5.3-flash')return Response.json({error:{code:'insufficient_balance',message:'insufficient balance'}},{status:402});
 if(text.includes('排版验收'))return result('## 本餐汇总\n\n这是一条隔离回放，**不会保存正式数据**。\n\n| 食物 | 份量 | 热量 千卡 | 蛋白质 g | 碳水 g | 脂肪 g |\n| --- | --- | --- | --- | --- | --- |\n| 鸡肉饭 | 1份 | 630 | 28 | 56 | 30 |\n| 秋葵 | 半份 | 55 | 3 | 5 | 3.5 |\n\n- 合计约685千卡。\n- 份量按用户提供的实际食量。\n\n> 这是估算，油脂用量会影响结果。\n\n`caloriesKcal` 是接口字段。\n\n[真实引用](https://example.com/nutrition)\n\n<script>alert(1)</script>');
 if(text.includes('断网测试'))throw new TypeError('fixture network unavailable');
 if(text.includes('慢速测试'))return result('〔正文〕'+'这是隔离浏览器的慢速流式回答。这里只检查真实界面的停止、继续和固定槽位，不访问收费模型。'.repeat(3),null,true);
 if(text.includes('100克')||text.includes('创建预览')){
  if(!body.tools.some(tool=>tool.function.name==='preview_meals'))return call('load_tools',{names:['preview_meals']});
  const last=body.messages.at(-1);if(last.role==='tool'&&String(last.content).includes('confirmationUrl'))return result('已生成今天午餐的待确认预览：米饭150克、鸡胸肉100克。请打开提交检查，确认后才会保存。');
  const ids=[...text.matchAll(/[a-f0-9]{8}-[a-f0-9-]{27,}/g)].map(match=>match[0]).filter(id=>id===fixture.imageId);
  return call('preview_meals',{operationId:'fixture-operation-100',meals:[{date:'today',mealType:'午餐',timezone:'Asia/Shanghai',foods:[{name:'米饭',quantity:'150',unit:'g',caloriesKcal:'195',proteinG:'3.9',carbsG:'43',fatG:'0.5',sourceKind:'estimated',basis:'虚构验收估算，实际食量由输入提供'},{name:'鸡胸肉',quantity:'100',unit:'g',caloriesKcal:'165',proteinG:'31',carbsG:'0',fatG:'3.6',sourceKind:'estimated',basis:'虚构验收估算，实际食量由输入提供'}],...(ids.length?{imageIds:[...new Set(ids)],expectedImageCount:1}:{})}]});
 }
 if(Array.isArray(lastUser?.content)||text.includes('鸡胸肉'))return call('request_followup',{subject:'今天午餐实际食量',question:'米饭150克已保留，鸡胸肉实际吃了多少？',questions:[{id:'amount',prompt:'鸡胸肉食量',options:[{id:'g100',label:'100克'},{id:'g150',label:'150克'}],allowText:true}]});
 if(!body.tools.some(tool=>tool.function.name==='query_measurements'))return call('load_tools',{names:['query_measurements']});
 const last=body.messages.at(-1);
 if(last.role==='tool'&&body.messages.some(message=>message.tool_calls?.some(call=>call.function.name==='query_measurements')))return result('已查询你的近七天实测记录。缺测日保持为空，这次没有创建或修改健康记录。');
 return call('query_measurements',{range:'last7',view:'summary',timezone:'Asia/Shanghai'});
};
