import {createHmac,createHash} from "node:crypto";
import {readFile,realpath} from "node:fs/promises";
const domain="formward.top",host="dnspod.tencentcloudapi.com",service="dnspod";

const sha=value=>createHash("sha256").update(value).digest("hex"),hmac=(key,value)=>createHmac("sha256",key).update(value).digest();
async function api(action,payload){
 const timestamp=Math.floor(Date.now()/1000),date=new Date(timestamp*1000).toISOString().slice(0,10),body=JSON.stringify(payload);
 const headers="content-type:application/json; charset=utf-8\nhost:"+host+"\n",signed="content-type;host",canonical=["POST","/","",headers,signed,sha(body)].join("\n"),scope=date+"/"+service+"/tc3_request";
 const signing=hmac(hmac(hmac("TC3"+process.env.Tencent_SecretKey,date),service),"tc3_request"),signature=createHmac("sha256",signing).update(["TC3-HMAC-SHA256",String(timestamp),scope,sha(canonical)].join("\n")).digest("hex");
 const response=await fetch("https://"+host,{method:"POST",signal:AbortSignal.timeout(20000),headers:{"Content-Type":"application/json; charset=utf-8",Host:host,Authorization:"TC3-HMAC-SHA256 Credential="+process.env.Tencent_SecretId+"/"+scope+", SignedHeaders="+signed+", Signature="+signature,"X-TC-Action":action,"X-TC-Version":"2021-03-23","X-TC-Timestamp":String(timestamp)},body});
 const result=(await response.json()).Response;
 if(result.Error&&result.Error.Code!=="ResourceNotFound.NoDataOfRecord")throw new Error("DNS接口拒绝："+String(result.Error.Code).replace(/[^a-zA-Z0-9_.]/g,""));
 return result;
}
export function ownIssueProofs(records,log){
 const proofs=new Set([...log.matchAll(/Adding TXT value: ([a-zA-Z0-9_-]{20,128}) for domain: ([a-zA-Z0-9_.-]+)/g)].map(match=>match[2].toLowerCase()+"\n"+match[1]));
 const allowed=new Set(["_acme-challenge","_acme-challenge.www","_acme-challenge.cn","_acme-challenge.origin"]);
 return records.filter(record=>record.Type==="TXT"&&allowed.has(record.Name)&&proofs.has(record.Name+"."+domain+"\n"+record.Value));
}
async function main(){
 if(!process.env.Tencent_SecretId||!process.env.Tencent_SecretKey)throw new Error("缺少专用DNS环境配置。");
 const result=await api("DescribeRecordList",{Domain:domain,Limit:100}),records=result.RecordList??[],args=process.argv.slice(2);
 if(Number(result.RecordCountInfo?.TotalCount??records.length)>records.length)throw new Error("记录清单不完整，拒绝继续。");
 if(args.length){
  if(args[0]!=="--cleanup-issue"||![2,3].includes(args.length)||(args.length===3&&args[2]!=="--apply"))throw new Error("用法：check-dns.mjs [--cleanup-issue 私有签发日志 [--apply]]");
  const path=await realpath(args[1]);if(!/^\/var\/lib\/formward\/certificate-issue(?:-attempt[0-9]+)?\.log$/.test(path))throw new Error("只允许指定本项目签发日志。");
  const own=ownIssueProofs(records,await readFile(path,"utf8"));
  if(args[2]==="--apply")for(const record of own)await api("DeleteRecord",{Domain:domain,RecordId:record.RecordId});
  console.log(JSON.stringify({domain,mode:args[2]==="--apply"?"cleanup_applied":"cleanup_preview",matchedOwnProofs:own.length,otherRecordsUntouched:true}));
 }else{
  const types={};for(const record of records)types[record.Type]=(types[record.Type]??0)+1;
  console.log(JSON.stringify({domain,recordCount:records.length,recordTypes:types,websiteRecords:records.filter(record=>["A","AAAA","CNAME"].includes(record.Type)).length}));
 }
}
if(import.meta.main)main().catch(error=>{
 console.error(error instanceof Error&&error.message.startsWith("DNS接口拒绝：")?error.message:"DNS检查失败；未输出凭据、验证文字或原始响应。");process.exitCode=1;
});
