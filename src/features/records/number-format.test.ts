import assert from "node:assert/strict";
import {test} from "node:test";
import {formatRecordNumber,signedRecordNumber} from "../../components/number-format";
test("健康读数统一两位、未知和0分开、负零不误导",()=>{
 for(const v of [null,undefined,"","invalid"])assert.equal(formatRecordNumber(v),"—");
 assert.equal(formatRecordNumber("741.0000"),"741.00");assert.equal(formatRecordNumber(0),"0.00");assert.equal(formatRecordNumber(-.0001),"0.00");
 assert.equal(formatRecordNumber("1.005"),"1.01");assert.equal(signedRecordNumber(".2"),"+0.20");assert.equal(signedRecordNumber("-.2"),"-0.20");
 const raw="400.1234";formatRecordNumber(raw);assert.equal(raw,"400.1234");
});
