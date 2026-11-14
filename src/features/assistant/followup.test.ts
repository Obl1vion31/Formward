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
