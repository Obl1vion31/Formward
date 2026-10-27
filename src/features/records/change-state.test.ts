import assert from "node:assert/strict";
import {test} from "node:test";
import {changedRecords,type RecordStamp} from "./change-state";
import {unusualNumbers} from "../../components/number-change";
const row=(key:string,version="1"):RecordStamp=>({key,id:key,version,date:"2024-04-04",title:"虚构午餐",href:"/dashboard/meals"});
test("检查新增、修改和删除，不依赖最后更新时间",()=>{const diff=changedRecords([row("a"),row("b")],[row("a","2"),row("c")]);assert.deepEqual(diff.map(x=>x.kind),["修改","删除","新增"]);assert.equal(changedRecords([row("a")],[row("a")]).length,0);});
test("温和提醒只检查有效正值的大数量级变化",()=>{const base={label:"热量",unit:"kcal",previous:"600"};assert.equal(unusualNumbers([{...base,value:"6000"}]).length,1);assert.equal(unusualNumbers([{...base,value:"59"}]).length,1);for(const value of ["600","0",null,undefined])assert.equal(unusualNumbers([{...base,value}]).length,0);assert.equal(unusualNumbers([{...base,previous:null,value:"6000"}]).length,0);});
