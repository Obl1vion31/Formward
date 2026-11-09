import assert from "node:assert/strict";
import {test} from "node:test";
import {habitualMeasurementSource} from "./source-habit";
import type {MeasurementDisplay} from "./entry-state";
const row=(date:string,period:"daytime"|"evening",patch:Partial<MeasurementDisplay>={}):MeasurementDisplay=>({id:date+period,recordDate:date,period,weightKg:"70.00",bodyFatPercent:null,fasting:period==="daytime",sourceLocalTime:date+" 08:00:00",recordKind:"observed",timezone:"Asia/Shanghai",sourceType:"manual",sourceSystem:null,sourceRecordId:null,entryChannel:"manual",deviceLabel:"虚构秤",timePrecision:"day_period",updatedAt:date,...patch});
const rows=[row("2026-10-30","daytime"),row("2026-10-30","evening"),row("2026-10-31","daytime")];
test("来源晨晚一起计三次，同日不同槽有效，估计不计",()=>{
 assert.equal(habitualMeasurementSource(rows,["虚构秤"],"2026-10-31","evening"),"虚构秤");
 assert.equal(habitualMeasurementSource(rows.slice(0,2),["虚构秤"],"2026-10-31","evening"),"");
 assert.equal(habitualMeasurementSource([...rows.slice(0,2),{...rows[2],recordKind:"estimated"}],["虚构秤"],"2026-10-31","evening"),"");
});
test("重复保存同一槽位不凑次数；空来源中断，移除不自动复活",()=>{
 assert.equal(habitualMeasurementSource([rows[0],{...rows[0],id:"duplicate",updatedAt:"2026-11-01"}],["虚构秤"],"2026-11-02","daytime"),"");
 assert.equal(habitualMeasurementSource([rows[0],{...rows[1],deviceLabel:null},rows[2]],["虚构秤"],"2026-11-01","daytime"),"");
 assert.equal(habitualMeasurementSource(rows,[],"2026-11-01","daytime"),"");
});
test("补录不采用未来来源，旧非空腹晨间不冒充有效实测",()=>{
 assert.equal(habitualMeasurementSource(rows,["虚构秤"],"2026-10-30","evening"),"");
 assert.equal(habitualMeasurementSource([{...rows[0],fasting:false},...rows.slice(1)],["虚构秤"],"2026-11-01","daytime"),"");
});
