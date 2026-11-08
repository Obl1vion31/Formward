import {test} from "node:test";
import assert from "node:assert/strict";
import {ownIssueProofs} from "./check-dns.mjs";
const value="fictional_DNS_proof_value_123456789",log="Adding TXT value: "+value+" for domain: _acme-challenge.origin.formward.top";
test("仅清理本次日志准确匹配的域名、TXT类型与验证值",()=>{
 const records=[
  {RecordId:1,Type:"TXT",Name:"_acme-challenge.origin",Value:value},
  {RecordId:2,Type:"TXT",Name:"_acme-challenge.origin",Value:"another-operation-proof-123456789"},
  {RecordId:3,Type:"A",Name:"_acme-challenge.origin",Value:value},
  {RecordId:4,Type:"TXT",Name:"@",Value:value},
  {RecordId:5,Type:"TXT",Name:"_acme-challenge.other",Value:value}
 ];
 assert.deepEqual(ownIssueProofs(records,log).map(r=>r.RecordId),[1]);
 assert.deepEqual(ownIssueProofs(records,""),[]);
 assert.deepEqual(ownIssueProofs(records,log.replace("formward.top","attacker.example")),[]);
});
test("四个签发域名均可准确识别，其他TXT与网站记录保持",()=>{
 const names=["_acme-challenge","_acme-challenge.www","_acme-challenge.cn","_acme-challenge.origin"];
 const records=names.map((Name,index)=>({RecordId:index,Type:"TXT",Name,Value:value}));
 const entries=names.map(name=>"Adding TXT value: "+value+" for domain: "+name+".formward.top").join("\n");
 assert.equal(ownIssueProofs(records,entries).length,4);
 assert.deepEqual(ownIssueProofs(records,entries+"; DeleteRecord *"),records);
});
