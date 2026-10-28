import assert from "node:assert/strict";
import {test} from "node:test";
import {formatRecordNumber,signedRecordNumber,formatIntegerNumber,signedIntegerNumber,formatUnitNumber} from "../../components/number-format";
test("健康读数统一两位、未知和0分开、负零不误导",()=>{
 for(const v of [null,undefined,"","invalid"])assert.equal(formatRecordNumber(v),"—");
 assert.equal(formatRecordNumber("741.0000"),"741.00");assert.equal(formatRecordNumber(0),"0.00");assert.equal(formatRecordNumber(-.0001),"0.00");
 assert.equal(formatRecordNumber("1.005"),"1.01");assert.equal(signedRecordNumber(".2"),"+0.20");assert.equal(signedRecordNumber("-.2"),"-0.20");
 const raw="400.1234";formatRecordNumber(raw);assert.equal(raw,"400.1234");
});

test("营养和消耗显示整数，身体两位，换算先求和再展示",()=>{
 assert.equal(formatIntegerNumber("741.0000"),"741");assert.equal(formatIntegerNumber(0),"0");assert.equal(formatIntegerNumber(null),"—");
 assert.equal(formatIntegerNumber("40.5900"),"41");assert.equal(formatIntegerNumber(100.4+100.4),"201");
 assert.equal(signedIntegerNumber(-.1),"0");assert.equal(signedIntegerNumber(-1025),"-1025");assert.equal(signedIntegerNumber(741),"+741");
 assert.equal(formatUnitNumber("67.8","kg"),"67.80");assert.equal(formatUnitNumber("16.3","%"),"16.30");assert.equal(formatUnitNumber("741.1234","kcal"),"741");
 const raw="741.1234";formatIntegerNumber(raw);assert.equal(raw,"741.1234");
});
