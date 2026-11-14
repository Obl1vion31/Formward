// 仅隔离浏览器进程通过node --import使用；正式运行包不引用本文件。
import {readFile} from 'node:fs/promises';
const fixture=JSON.parse(await readFile(process.env.FORMWARD_CHAT_BROWSER_FIXTURE,'utf8'));
const original=globalThis.fetch,allowed=new Set(['maas.qianwenaiapi.com','api.xiaomimimo.com','open.bigmodel.cn']);
function result(content,calls,slow=false){
 const usage={prompt_tokens:180,completion_tokens:60,prompt_tokens_details:{cached_tokens:40}};
 if(calls)return new Response('data: '+JSON.stringify({choices:[{delta:{tool_calls:calls},finish_reason:'tool_calls'}]})+'\n\ndata: '+JSON.stringify({choices:[],usage})+'\n\ndata: [DONE]\n\n',{headers:{'content-type':'text/event-stream'}});
 return new Response(new ReadableStream({async start(controller){for(let i=0;i<content.length;i+=slow?4:24){controller.enqueue(new TextEncoder().encode('data: '+JSON.stringify({choices:[{delta:{content:content.slice(i,i+(slow?4:24))},finish_reason:null}]})+'\n\n'));if(slow)await new Promise(resolve=>setTimeout(resolve,100));}controller.enqueue(new TextEncoder().encode('data: '+JSON.stringify({choices:[{delta:{},finish_reason:'stop'}]})+'\n\ndata: '+JSON.stringify({choices:[],usage})+'\n\ndata: [DONE]\n\n'));controller.close();}}),{headers:{'content-type':'text/event-stream'}});
}
function call(name,args){return result('',[{index:0,id:'call-'+name,type:'function',function:{name,arguments:JSON.stringify(args)}}]);}
globalThis.fetch=async function(input,init){
 const url=new URL(typeof input==='string'||input instanceof URL?String(input):input.url);
 if(process.env.FORMWARD_TEST_REAL_COS!=='1'&&url.hostname.endsWith('.cos.ap-shanghai.myqcloud.com'))return new Response(Buffer.from(fixture.imageBytes,'base64'),{headers:{'content-type':'image/png'}});
 if(!allowed.has(url.hostname))return original(input,init);
 const body=JSON.parse(typeof init?.body==='string'?init.body:await input.clone().text()),lastUser=[...body.messages].reverse().find(message=>message.role==='user'),text=typeof lastUser?.content==='string'?lastUser.content:lastUser?.content?.find(part=>part.type==='text')?.text??'';
 if(text.includes('平台余额测试')&&body.model==='glm-5.3-flash')return Response.json({error:{code:'insufficient_balance',message:'insufficient balance'}},{status:402});
 if(text.includes('断网测试'))throw new TypeError('fixture network unavailable');
 if(text.includes('慢速测试'))return result('这是隔离浏览器的慢速流式回答。这里只检查真实界面的停止、继续和固定槽位，不访问收费模型。'.repeat(3),null,true);
 if(text.includes('100克')||text.includes('创建预览')){
  if(!body.tools.some(tool=>tool.function.name==='preview_meal'))return call('load_tools',{names:['preview_meal']});
  const last=body.messages.at(-1);if(last.role==='tool'&&String(last.content).includes('confirmationUrl'))return result('已生成今天午餐的待确认预览：米饭150克、鸡胸肉100克。请打开提交检查，确认后才会保存。');
  const ids=[...text.matchAll(/[a-f0-9]{8}-[a-f0-9-]{27,}/g)].map(match=>match[0]).filter(id=>id===fixture.imageId);
  return call('preview_meal',{operationId:'fixture-operation-100',date:'today',mealType:'午餐',timezone:'Asia/Shanghai',foods:[{name:'米饭',quantity:'150',unit:'g',caloriesKcal:'195',proteinG:'3.9',carbsG:'43',fatG:'0.5',sourceKind:'estimated',basis:'虚构验收估算，实际食量由输入提供'},{name:'鸡胸肉',quantity:'100',unit:'g',caloriesKcal:'165',proteinG:'31',carbsG:'0',fatG:'3.6',sourceKind:'estimated',basis:'虚构验收估算，实际食量由输入提供'}],...(ids.length?{imageIds:[...new Set(ids)],expectedImageCount:1}:{})});
 }
 if(Array.isArray(lastUser?.content)||text.includes('鸡胸肉'))return call('request_followup',{subject:'今天午餐实际食量',question:'米饭150克已保留，鸡胸肉实际吃了多少？'});
 if(!body.tools.some(tool=>tool.function.name==='query_measurements'))return call('load_tools',{names:['query_measurements']});
 const last=body.messages.at(-1);
 if(last.role==='tool'&&body.messages.some(message=>message.tool_calls?.some(call=>call.function.name==='query_measurements')))return result('已查询你的近七天实测记录。缺测日保持为空，这次没有创建或修改健康记录。');
 return call('query_measurements',{range:'last7',view:'summary',timezone:'Asia/Shanghai'});
};
