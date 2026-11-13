import assert from 'node:assert/strict';
import {test} from 'node:test';
import {buildAiSystemPrompt} from './ai-prompt.mjs';
import {createAiToolSession} from './ai-tool-session.mjs';
import {aiContractSnapshot} from '../mcp/contract-export';
import {chatToolBridge,chatToolCatalog} from '../assistant/chat-tools';
import type {Database} from '../../db/client';

test('长短提示共用服务边界、目录和时钟，站内专用追问与附件说明单独追加',()=>{
  const input={directory:'query_meals：查饮食',instructions:'完整MCP工作说明只应出现在长版',now:'2026-11-11T08:28:04Z',localTime:'2026-11-11 16:28:04',timezone:'Asia/Shanghai',channelInstructions:'站内使用request_followup；已保存附件直接引用。'};
  const full=buildAiSystemPrompt({...input,variant:'original'}),short=buildAiSystemPrompt({...input,variant:'compact'});
  for(const text of [full,short])for(const known of [input.directory,input.now,input.localTime,input.timezone,input.channelInstructions,'混合表达中有健康任务时处理该任务'])assert.ok(text.includes(known));
  assert.ok(full.includes(input.instructions));assert.ok(!short.includes(input.instructions));
  for(const rule of ['不猜常见克数','估算数字必须填写对应营养字段','不能把假设的大小、克重写成用户报告','站内已私有保存的附件'])assert.ok(short.includes(rule));
});
test('站内目录与正式导出同源，仅由会话隐藏请求编号；外部定义保持不变',async()=>{
  const {contract}=await aiContractSnapshot();
  const bridge=chatToolBridge({} as Database,{userId:'fictional-prompt',tokenId:'fictional-prompt-token',permission:'write'},new Request('http://localhost/api/assistant-chat'));
  try{
    const catalog=await chatToolCatalog(bridge);
    assert.equal(catalog.directory,contract.catalog.map((t:{name:string;title:string;operation:string;usage:string})=>`${t.name}：${t.title}（${t.operation}）；${t.usage}`).join('\n'));
    catalog.load({names:['preview_meal']});
    const tool=catalog.tools().find(t=>t.function.name==='preview_meal')!;
    assert.equal('operationId' in (tool.function.parameters.properties as object),false);
    const original=contract.tools.find((t:{name:string})=>t.name==='preview_meal')!;assert.ok((original.inputSchema.required as string[]).includes('operationId'));
    const failure=await bridge.rpc('tools/call',{name:'preview_meal',arguments:{}});
    assert.ok(failure.isError);assert.ok((failure.structuredContent?.message ?? failure.content?.[0]?.text).includes('operationId'));
  }finally{await bridge.close();}
});
test('程序管理编号复用同内容重试，更改内容分配新编号；不改其他业务参数',()=>{
  let ids=0;const contract={tools:[{name:'preview_meal',description:'单餐',inputSchema:{type:'object',properties:{operationId:{type:'string'},date:{type:'string'}},required:['operationId','date']}}]};
  const external=createAiToolSession(contract),session=createAiToolSession(contract,{managedOperationIds:true,operationIdFor:()=>`server-op-${++ids}`});
  session.load({names:['preview_meal']});external.load({names:['preview_meal']});
  assert.ok(external.tools()[1].function.parameters.required?.includes('operationId'));
  const a=session.prepare('preview_meal',{date:'today',mealType:'早餐',foods:[]}),b=session.prepare('preview_meal',{date:'today',mealType:'早餐',foods:[]});
  assert.deepEqual(a.args,b.args);assert.equal(a.args?.operationId,'server-op-1');
  assert.equal(session.prepare('preview_meal',{date:'yesterday',mealType:'早餐',foods:[]}).args?.operationId,'server-op-2');
  session.remember('preview_meal',a.args!,{id:'pending-1',revision:1,status:'pending',rows:[]});
  assert.equal(session.prepare('preview_meal',{date:'today',mealType:'早餐',foods:[]}).result?.repeated,true);
});
test('餐次转为统一审核后的原草稿编号与版本及时更新，不另建同餐',()=>{
  const contract={tools:['preview_meal','preview_meal_changes'].map(name=>({name,description:name,inputSchema:{}}))},s=createAiToolSession(contract);
  s.remember('preview_meal',{date:'today',mealType:'早餐'},{id:'child',revision:1,status:'pending',rows:[{meal:{date:'2026-11-11'}}]});
  s.remember('preview_meal_changes',{previewId:'child',revision:1},{id:'parent',revision:2,status:'pending',rows:[]});
  const blocked=s.prepare('preview_meal',{date:'today',mealType:'早餐',foods:[{name:'新值'}]});
  assert.equal(blocked.result?.previewId,'parent');assert.equal(blocked.result?.revision,2);
});

test('统一草稿修正的编号同样由程序稳定生成，失败重试不另分配编号',()=>{
  let ids=0;
  const contract={tools:[{name:'submit_record_operation',description:'统一预览',inputSchema:{properties:{operationId:{type:'string'}}}}]};
  const s=createAiToolSession(contract,{managedOperationIds:true,operationIdFor:()=>`correction-${++ids}`});
  s.remember('submit_record_operation',{items:[{key:'meal',kind:'meal'}]},{id:'draft',revision:2,status:'pending'});
  const args={items:[{key:'meal',kind:'meal',notes:'新备注'}]};
  const first=s.prepare('submit_record_operation',args),retry=s.prepare('submit_record_operation',args);
  assert.deepEqual(first.args,retry.args);assert.equal(first.args?.previewId,'draft');assert.equal(first.args?.operationId,'correction-1');
  s.remember('submit_record_operation',first.args!,{id:'draft',revision:3,status:'pending'});
  assert.equal(s.prepare('submit_record_operation',args).result?.repeated,true);
});

test('受控会话只规范明确未知的新自由餐项空值，不猜食量，不改变历史清空及未标记输入',()=>{
  const contract={tools:[{name:'preview_meal',description:'预览',inputSchema:{properties:{operationId:{type:'string'}}}}]};
  const s=createAiToolSession(contract,{managedOperationIds:true,normalizeUnknownAmounts:true});
  const blank={name:'虚构食物',quantity:'',unit:'',amountDecision:'unknown_accepted'};
  const raw={date:'today',mealType:'午餐',foods:[blank]};
  const a=s.prepare('preview_meal',raw),b=s.prepare('preview_meal',{...raw,foods:[{...blank,quantity:null,unit:null}]});
  assert.deepEqual(a.args,b.args);assert.deepEqual(a.args?.foods,[{name:'虚构食物',amountDecision:'unknown_accepted'}]);assert.equal(raw.foods[0].quantity,'');
  const notAgreed={...raw,foods:[{...blank,amountDecision:'provided'}]};assert.deepEqual(s.prepare('preview_meal',notAgreed).args?.foods,notAgreed.foods);
  const correction={previewId:'existing',revision:1,updateFoods:[{index:0,quantity:null}],addFoods:[blank]};
  const corrected=s.prepare('preview_meal_changes',correction);assert.deepEqual(corrected.args?.updateFoods,correction.updateFoods);assert.deepEqual(corrected.args?.addFoods,[{name:'虚构食物',amountDecision:'unknown_accepted'}]);
  assert.deepEqual(createAiToolSession(contract).prepare('preview_meal',raw).args,raw);
});

test('同一历史餐次已有预览时拦截跨工具重建，重复调用复用回执，继续修改沿用原预览',()=>{
  const tools=['preview_meal_changes','submit_meal_operation','get_meal_operation'].map(name=>({name,description:name,inputSchema:{}}));
  const s=createAiToolSession({tools});const first={mealId:'original-meal',version:1,notes:'聚餐'};
  s.remember('preview_meal_changes',first,{id:'preview-1',revision:1,operationType:'meal',status:'pending',confirmationUrl:'https://example.test/review/1'});
  assert.equal(s.prepare('preview_meal_changes',first).result?.repeated,true);
  const blocked=s.prepare('submit_meal_operation',{actions:[{kind:'save_meal',id:'original-meal',version:1,items:[]}]});
  assert.equal(blocked.result?.error,'existing_meal_edit_preview_requires_correction');assert.equal(blocked.result?.executed,false);assert.equal(blocked.result?.confirmationUrl,'https://example.test/review/1');
  assert.equal(s.prepare('submit_meal_operation',{actions:[{kind:'save_meal',id:'different-meal'}]}).result,undefined);
  const correction={previewId:'preview-1',revision:1,notes:'新备注'};assert.deepEqual(s.prepare('preview_meal_changes',correction).args,correction);
  s.remember('preview_meal_changes',correction,{id:'preview-2',revision:2,operationType:'record',status:'pending'});
  assert.equal(s.prepare('submit_meal_operation',{actions:[{kind:'save_meal',id:'original-meal'}]}).result?.previewId,'preview-2');
});
