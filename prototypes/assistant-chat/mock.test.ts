import {test} from "node:test";
import assert from "node:assert/strict";
import {planReply,seed,TODAY,YESTERDAY,type Task} from "./mock";
test("补充食量保留既有米饭数量，单次只生成一份待确认预览",()=>{
 const task:Task={date:TODAY,rice:150,origin:"meal"};
 const result=planReply("鸡胸肉100克","meal",task,null,false,"op-1");
 assert.equal(result.preview?.id,"op-1");assert.equal(result.preview?.status,"pending");
 assert.match(result.preview!.detail,/米饭 150克 · 鸡胸肉 100克/);assert.equal(result.preview!.date,TODAY);
});
test("照片没有实际食量时不默认150克，分次补充保留已知食量",()=>{
 const start=planReply("帮我记这顿饭","photo",null,null,true,"op");
 assert.equal(start.task?.rice,null);assert.equal(start.preview,undefined);
 const ambiguous=planReply("100克","photo",start.task!,null,false,"op");
 assert.equal(ambiguous.preview,undefined);assert.equal(ambiguous.task?.rice,null);
 const chicken=planReply("鸡胸肉100克","photo",start.task!,null,false,"op");
 assert.equal(chicken.task?.chicken,100);assert.equal(chicken.task?.rice,null);
 const rice=planReply("米饭150克","photo",chicken.task!,null,false,"op");
 assert.match(rice.preview!.detail,/米饭 150克 · 鸡胸肉 100克/);
});
test("引用旧消息按消息日期定位，不根据最近晚餐猜测",()=>{
 const messages=seed("quote"),old=messages.find(row=>row.id==="meal-09")!;
 const result=planReply("备注改成聚餐","quote",null,old,false,"note-op");
 assert.equal(result.preview?.date,"2026-11-09");assert.equal(result.preview?.noteOnly,true);
 assert.match(result.preview!.detail,/原餐项、数量和营养保留/);
 assert.equal(planReply("改一下","quote",null,{...old,date:undefined},false,"op").preview,undefined);
});
test("切换到身体查询不推进原饮食任务；查询失败不表示没有记录",()=>{
 const result=planReply("最近体重怎么样","meal",{date:YESTERDAY,rice:150,origin:"meal"},null,false,"op");
 assert.equal(result.preview,undefined);assert.equal(result.task,undefined);assert.match(result.answer,/缺测/);
 const failure=planReply("查昨天饮食","tool-error",null,null,false,"op");
 assert.ok(failure.failure);assert.equal(failure.preview,undefined);assert.equal(failure.answer,"");
});
test("来源更新、部分失败、预览失效与单次截断分别表达",()=>{
 const stale=planReply("查昨天","stale-source",null,null,false,"op");assert.equal(stale.sources?.[0].stale,true);
 assert.match(planReply("查记录","partial",null,null,false,"op").answer,/消耗查询失败/);
 const expired=planReply("100克","expired",{date:TODAY,rice:150,origin:"meal"},null,false,"op");
 assert.equal(expired.preview?.status,"expired");
 assert.equal(planReply("总结","long",null,null,false,"op").truncated,true);
});
