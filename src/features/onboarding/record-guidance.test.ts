import assert from "node:assert/strict";
import {test} from "node:test";
import {guideKindForPath,guidePlacement,recordGuideKey} from "./record-guidance-model";

test("首次引导只适用真实录入模块，完成标记按账号和模块隔离",()=>{
 assert.equal(guideKindForPath("/dashboard"),null);
 assert.equal(guideKindForPath("/dashboard/profile"),null);
 assert.equal(guideKindForPath("/dashboard/meals"),"meals");
 assert.equal(guideKindForPath("/dashboard/measurements"),"body");
 assert.notEqual(recordGuideKey("account-a","meals"),recordGuideKey("account-b","meals"));
 assert.notEqual(recordGuideKey("account-a","meals"),recordGuideKey("account-a","body"));
});
test("提示避开目标，适应窄屏、键盘缩小的视口和放大文字",()=>{
 for(const viewport of [{left:0,top:0,width:320,height:560},{left:0,top:180,width:390,height:260},{left:0,top:0,width:1440,height:900}]){
  for(const target of [{left:4,top:200,right:100,bottom:244},{left:300,top:460,right:385,bottom:510}]){
   const p=guidePlacement(target,viewport,{width:336,height:300});
   assert.ok(p.left>=viewport.left+12);
   assert.ok(p.left+p.width<=viewport.left+viewport.width-12);
   assert.ok(p.top>=viewport.top+12);
   assert.ok(p.top+p.height<=viewport.top+viewport.height-12);
  }
 }
 const target={left:20,top:300,right:200,bottom:350},viewport={left:0,top:0,width:390,height:560};
 const p=guidePlacement(target,viewport,{width:336,height:240});
 assert.ok(p.top+p.height<target.top,"下方不足时提示放在上方，不挡住填写区");
});
