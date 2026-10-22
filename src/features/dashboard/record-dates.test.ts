import test from "node:test";
import assert from "node:assert/strict";
import { recentRecordDates, recordDateLabel, preferredRecordedDate, rangeContaining } from "@/components/record-dates";
test("日历空日只作为展示，包含昨日、跨月和闰日", () => {
 assert.deepEqual(recentRecordDates("2028-03-01",3),["2028-03-01","2028-02-29","2028-02-28"]);
 assert.equal(recentRecordDates("2026-01-01")[1],"2025-12-31");
 assert.equal(recordDateLabel("2026-10-22","2026-10-23"),"2026-10-22 · 昨天");
});
test("默认收支支持明确0和部分合计；无完整数值才退回最近事实", () => {
 const rows=[{date:"2026-10-23",intake:null,energy:null,present:false},{date:"2026-10-22",intake:1200,energy:null,present:true},{date:"2026-10-21",intake:0,energy:0,present:true}];
 const complete=(r:typeof rows[number])=>r.intake!==null&&r.energy!==null;
 const present=(r:typeof rows[number])=>r.present;
 assert.equal(preferredRecordedDate(rows,"2026-10-23",complete,present),"2026-10-21");
 assert.equal(preferredRecordedDate(rows.slice(0,2),"2026-10-23",complete,present),"2026-10-22");
 assert.equal(preferredRecordedDate([],"2026-10-23",complete,present),"2026-10-23");
 assert.equal(rows[0].date,"2026-10-23");
});
test("最近有效记录超出默认区间时扩大，历史深链保持自己的结束日", () => {
 assert.equal(rangeContaining("2026-10-22","2026-10-23","7"),"7");
 assert.equal(rangeContaining("2026-10-01","2026-10-23","7"),"30");
 assert.equal(rangeContaining("2026-08-01","2026-10-23","7"),"90");
 assert.equal(rangeContaining("2026-01-01","2026-10-23","30"),"all");
 assert.equal(rangeContaining("2026-10-01","2026-10-01","7"),"7");
});
