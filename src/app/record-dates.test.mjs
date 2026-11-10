import test from 'node:test';
import assert from 'node:assert/strict';
import {displayRecordDate,shortRecordDate,recordDateRange,recordDateLabel} from '../components/record-dates.ts';

test('界面日期和跨年范围保持一致，原始日期不改写',()=>{
 const date='2026-11-10';
 assert.equal(displayRecordDate(date),'2026.11.10');
 assert.equal(shortRecordDate(date),'11.10');
 assert.equal(recordDateRange('2026-11-04',date),'11.04—11.10');
 assert.equal(recordDateRange('2025-12-30','2026-01-05'),'2025.12.30—2026.01.05');
 assert.equal(recordDateLabel(date,date),'2026.11.10 · 今天');
 assert.equal(recordDateLabel('2026-11-09',date),'2026.11.09 · 昨天');
 assert.equal(recordDateLabel('2026-10-18',date),'2026.10.18');
 assert.equal(recordDateLabel(date,''),'2026.11.10');
 assert.equal(date,'2026-11-10');
});
