import assert from "node:assert/strict";
import {test} from "node:test";
import {withoutRepeatedFollowup,chatDisplayText,chatRecordReferences,chatTranscript} from "./chat-presentation";
import type { ChatMessage } from "./chat-model";
const references=[{title:"查看提交",href:"/dashboard/ai/operations/example",kind:"preview" as const,operationId:"example"}];
test("站内确认指示归卡片，事实、真实引用和用户原文保留",()=>{
 const text="晚餐685千卡。\n\n请打开链接登录确认后才会正式保存（21:12前有效）：\n\nhttps://formward.top/dashboard/ai/operations/example\n\n参考：[食物资料](https://example.org/food)";
 const message={role:"assistant" as const,text,references};const result=chatDisplayText(message,true);
 assert.match(result,/685千卡/);assert.match(result,/https:\/\/example.org\/food/);assert.doesNotMatch(result,/21:12|登录|operations/);
 assert.equal(chatDisplayText({...message,role:"user"},true),text);assert.equal(chatDisplayText(message,false),text);
});
test("确认卡不重复附加自动业务跳转，无卡时保留并去重",()=>{
 const ref={title:"查看饮食记录",href:"/dashboard/meals",kind:"record" as const};assert.deepEqual(chatRecordReferences([...references,ref],true,[{name:"preview_meals"}]),[]);assert.deepEqual(chatRecordReferences([ref,ref],true),[ref]);
});

test("独立查询入口和真实外部引用不被其他业务的确认卡吞掉",()=>{
 const body={title:"查看实测记录",href:"/dashboard/measurements",kind:"record" as const};
 assert.deepEqual(chatRecordReferences([...references,body],true,[{name:"preview_meals"}]),[body]);
 const answer=chatDisplayText({role:"assistant",references,text:"已生成今天午餐的待确认预览：米饭150克。请打开提交检查，确认后才会保存。"},true);
 assert.match(answer,/米饭150克/);assert.doesNotMatch(answer,/待确认|请打开/);
});


test("旧消息无需当前预览编号也退出审核URL、登录与旧期限",()=>{
 const text="点心50千卡，来源：包装标签。\n\n确认链接（请在网页登录后确认才会正式保存，约 **04:24** 前有效）：\nhttps://formward.top/dashboard/ai/operations/old-uuid\n\n目前还是**待确认**状态，没正式写入，需要你点进去确认。\n\n过期了也没关系，跟我说一声我重新提一条。";
 const result=chatDisplayText({role:"assistant",text,references:[]},true);
 assert.match(result,/点心50千卡，来源：包装标签/);assert.match(result,/AI 确认/);assert.doesNotMatch(result,/old-uuid|登录|04:24|待确认|重新提/);
 for(const link of ["<https://formward.top/dashboard/ai/operations/old-uuid>","https://formward.top/dashboard/ai/operations/old-uuid.","(https://formward.top/dashboard/ai/operations/old-uuid)"]){assert.doesNotMatch(chatDisplayText({role:"assistant",text:"点心50千卡。\n\n"+link,references},true),/old-uuid|<>/);}
 assert.doesNotMatch(chatDisplayText({role:"assistant",text:"点心50千卡。当前还未保存，需要你确认。",references},true),/还未保存/);
 assert.equal(chatDisplayText({role:"assistant",text,references:[]},false),text);
 assert.equal(chatDisplayText({role:"user",text,references:[]},true),text);
});
test("历史链接编号不同、Markdown和换行URL均由当前卡片接管",()=>{
 const text="体重67.00 kg；来源：OKOK。\n\n[核对提交](https://global.formward.top/dashboard/ai/operations/old-a)\n\nhttps://formward.top/dashboard/ai/operations/\nold-b\n\n请在当前界面核对后确认，确认才会正式保存（约在 **04:07** 后这一批草稿有效期内）。";
 const result=chatDisplayText({role:"assistant",text,references},true);assert.match(result,/67.00 kg/);assert.match(result,/OKOK/);assert.doesNotMatch(result,/old-a|old-b|04:07|登录|确认才会|AI 确认/);
});
test("健康不确定、事实链接标签和外部同路径引用保持",()=>{
 const text="份量待确认，暂不估算。\n\n[点心50千卡](https://formward.top/dashboard/ai/operations/old-c)\n\n[外部说明](https://example.org/dashboard/ai/operations/example)\n\n来源：用户给出的标签；时区：GMT+8。";
 const result=chatDisplayText({role:"assistant",text,references},true);assert.match(result,/份量待确认，暂不估算/);assert.match(result,/点心50千卡/);assert.match(result,/https:\/\/example.org\/dashboard\/ai\/operations\/example/);assert.match(result,/来源：用户给出的标签；时区：GMT\+8/);
});
test("围栏代码与普通回答原样保留，不补造提交状态",()=>{
 const text="代码示例：\n\n```text\n请打开链接登录确认。\nhttps://formward.top/dashboard/ai/operations/example\n```\n\n普通回答。";
 assert.equal(chatDisplayText({role:"assistant",text,references:[]},true),text);
 assert.equal(chatDisplayText({role:"assistant",text:"没有找到记录。",references:[]},true),"没有找到记录。");
 for(const ordinary of ["当前未保存过体重记录。","外部AI继续使用网页确认页，站内卡片由你保存。"]){assert.equal(chatDisplayText({role:"assistant",text:ordinary,references:[]},true),ordinary);}
});
test("遗留操作旁白只移除操作包装，不丢业务内容",()=>{
 const text="我去把刚才那条预览的确认链接取出来给你。\n\n点心50千卡。先调起记餐能力。\n\n我这就按同样内容（11/16 加餐、示例点心50 kcal）重新生成一条带确认链接的预览，稍等。";
 const result=chatDisplayText({role:"assistant",text,references},true);assert.match(result,/点心50千卡/);assert.match(result,/11\/16 加餐、示例点心50 kcal/);assert.doesNotMatch(result,/取出来|调起|重新生成|稍等|确认链接/);
});
test("缺编号的旧审核引用不再跳页，真实查询和外部引用保留",()=>{
 const old={title:"查看提交",href:"https://formward.top/dashboard/ai/operations/old-d",kind:"preview" as const};
 const query={title:"查看身体记录",href:"/dashboard/measurements",kind:"record" as const};
 assert.deepEqual(chatRecordReferences([old,query],true),[query]);assert.deepEqual(chatRecordReferences([old,query],false),[old,query]);
});

test('结构化补充只去掉完全相同的问题行，保留体重、来源和解释',()=>{
 const task={messageId:'00000000-0000-4000-8000-000000000001',subject:'来源',question:'这次用什么测量？',questions:[{id:'source',prompt:'这次用什么测量？',allowText:true}]};
 assert.equal(withoutRepeatedFollowup('体重67kg已保留。\n这次用什么测量？',task),'体重67kg已保留。');
 assert.equal(withoutRepeatedFollowup('来源OKOK，体重67kg。',task),'来源OKOK，体重67kg。');
});

test("只有相邻、同模型且有原始补充关联的回答收起重复来源", () => {
  const row = (id: string, fields: Partial<ChatMessage> = {}): ChatMessage => ({
    id, seq: 1, role: "assistant", provider: "qwen", state: "complete", text: id,
    createdAt: "2026-11-19T03:47:00.000Z", replyTo: null, imageIds: [], steps: [], references: [], error: null, ...fields,
  });
  const original = row("prompt");
  const supplement = row("supplement", {
    role: "user", provider: null, followupSourceId: original.id,
    answeredQuestions: [{ prompt: "吃了几份？", value: "半份", skipped: false }],
  });
  const answer = row("answer", { runId: "run", question: { id: supplement.id, text: "半份" } });
  const legacy = { ...answer, id: "legacy", runId: undefined };
  const otherModel = { ...answer, id: "other-model", provider: "mimo" } as const;
  const newRequest = row("新问题", { role: "user", provider: null });

  const joined = chatTranscript([original, supplement, answer]);
  assert.deepEqual(joined.visible.map(message => message.id), [original.id, answer.id]);
  assert.deepEqual([...joined.continuations], [answer.id]);
  assert.equal(joined.answers.get(original.id)?.[0]?.value, "半份");
  assert.equal(chatTranscript([supplement, answer]).visible.length, 2, "未加载较早消息时保留补充原文");
  for (const messages of [
    [original, supplement, legacy], [original, supplement, otherModel], [original, supplement, newRequest, answer],
  ]) assert.equal(chatTranscript(messages).continuations.size, 0);
});
