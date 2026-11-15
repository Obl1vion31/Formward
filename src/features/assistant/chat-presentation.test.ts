import assert from "node:assert/strict";
import {test} from "node:test";
import {chatDisplayText,chatRecordReferences} from "./chat-presentation";
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
