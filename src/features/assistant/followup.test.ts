import assert from "node:assert/strict";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { followupQuestionsSchema, followupText } from "./followup";
import type { Followup } from "./chat-model";

test("补充不默认选择事实，兼容旧问题并拒绝伪造任务与选项",()=>{
 const task:Followup={messageId:randomUUID(),subject:"晨间体重",question:"用什么测量？",questions:[{id:"source",prompt:"测量来源",options:[{id:"scale",label:"家用体重秤"}],allowText:true}]};
 assert.throws(()=>followupText(task,{messageId:task.messageId,answers:[]}));
 assert.throws(()=>followupText(task,{messageId:randomUUID(),answers:[{questionId:"source",optionIds:["scale"]}]}));
 assert.throws(()=>followupText(task,{messageId:task.messageId,answers:[{questionId:"source",optionIds:["invented"]}]}));
 assert.match(followupText(task,{messageId:task.messageId,answers:[{questionId:"source",optionIds:["scale"]}]}),/家用体重秤/);
 const legacy={messageId:randomUUID(),subject:"食量",question:"实际吃了多少？"};
 assert.match(followupText(legacy,{messageId:legacy.messageId,answers:[{questionId:"answer",text:"半份"}]}),/半份/);
});
test("只有可选问题可跳过，多题统一提交不能漏题或夹带其他问题",()=>{
 const task:Followup={messageId:randomUUID(),subject:"本餐",question:"补充本餐",questions:[{id:"amount",prompt:"食量",allowText:true},{id:"notes",prompt:"其他说明",optional:true,allowText:true}]};
 assert.throws(()=>followupText(task,{messageId:task.messageId,answers:[{questionId:"amount",skipped:true},{questionId:"notes",skipped:true}]}));
 assert.throws(()=>followupText(task,{messageId:task.messageId,answers:[{questionId:"amount",text:"1份"}]}));
 const answer=followupText(task,{messageId:task.messageId,answers:[{questionId:"amount",text:"1份"},{questionId:"notes",skipped:true}]});
 assert.match(answer,/食量：1份/);assert.match(answer,/其他说明：暂不填写/);
 assert.equal(followupQuestionsSchema.safeParse([{id:"x",prompt:"一"},{id:"x",prompt:"二"}]).success,false);
});

test("明确未知按具体字段去重，跳过全部保留已有回答，旧格式仍适用", async () => {
  const {resolveSupplement,sameFollowupField,applyUnansweredMealFields} = await import("./followup");
  const task:Followup = {messageId:randomUUID(),assistantMessageId:randomUUID(),subject:"晚餐",question:"核对实际份量",questions:[
    {id:"rice",prompt:"鸡油饭实际多少？",fieldKey:"food.amount:鸡油饭",allowText:true},
    {id:"chicken",prompt:"白切鸡吃了多少？",fieldKey:"food.amount:白切鸡",allowText:true},
  ]};
  const answers = resolveSupplement(task,{messageId:task.messageId,stopFollowups:true,answers:[
    {questionId:"rice",text:"半碗"},{questionId:"chicken",text:"我记不清了。"},
  ]});
  assert.equal(answers.stopFollowups,true);
  assert.equal(answers.sourceAssistantMessageId,task.assistantMessageId);
  assert.equal(answers.answers[0].value,"半碗");
  assert.equal(answers.answers[1].outcome,"unknown");
  assert.equal(answers.answers[1].value,null);
  assert.ok(sameFollowupField(answers.answers[1],{id:"another",prompt:"还记得几块吗？",fieldKey:"food.amount:白切鸡"}));
  assert.deepEqual(applyUnansweredMealFields("preview_meals",{meals:[{foods:[
    {name:"鸡油饭",quantity:"0.5",unit:"碗"},{name:"白切鸡",quantity:"1",unit:"份",caloriesKcal:"148"},
  ]}]},answers),{meals:[{foods:[{name:"鸡油饭",quantity:"0.5",unit:"碗"},
    {name:"白切鸡",amountDecision:"unknown_accepted",sourceKind:"unknown"}]}]});
  assert.throws(()=>resolveSupplement(task,{messageId:task.messageId,answers:[
    {questionId:"rice",outcome:"skipped"},{questionId:"chicken",outcome:"unknown",text:"四块"},
  ]}));
});
