import assert from "node:assert/strict";
import {test} from "node:test";
import {transferPhoto,PhotoTransferError} from "./photo-transfer";
class XHR {
 upload:{onprogress:((event:ProgressEvent)=>void)|null}={onprogress:null};timeout=0;status=204;responseText="";onload:(()=>void)|null=null;onerror:(()=>void)|null=null;ontimeout:(()=>void)|null=null;onabort:(()=>void)|null=null;aborted=false;sent=false;
 open(){}setRequestHeader(){}getResponseHeader(){return null;}abort(){this.aborted=true;}send(){this.sent=true;}
 progress(loaded:number,total:number){this.upload.onprogress?.({loaded,total,lengthComputable:true} as ProgressEvent);}
}
const factory=(xhr:XHR)=>()=>xhr as unknown as XMLHttpRequest;
test("上传进度来自真实字节；100%仍等待服务端响应",async()=>{
 const xhr=new XHR(),states:number[]=[];let done=false;
 const pending=transferPhoto({url:"https://fictional.test",body:new Blob(["photo"]),createXHR:factory(xhr),onProgress:(loaded,total)=>states.push(loaded/total*100)}).then(()=>{done=true;});
 xhr.progress(50,100);xhr.progress(100,100);await Promise.resolve();assert.deepEqual(states,[50,100]);assert.equal(done,false);
 xhr.onload?.();await pending;assert.equal(done,true);assert.equal(xhr.aborted,false);
});
test("无新增字节及时结束，允许手动备用，不自动重传",async()=>{
 const xhr=new XHR();await assert.rejects(transferPhoto({url:"https://fictional.test",body:new Blob(["photo"]),createXHR:factory(xhr),stallMs:10}),error=>error instanceof PhotoTransferError&&error.kind==="stalled"&&error.allowRelay);
 assert.equal(xhr.aborted,true);
});
test("取消、超时、网络和服务端拒绝可区分，HTTP原文不泄漏",async()=>{
 const aborted=new XHR(),controller=new AbortController(),cancelled=transferPhoto({url:"https://fictional.test",body:new Blob(),createXHR:factory(aborted),signal:controller.signal});controller.abort();await assert.rejects(cancelled,error=>error instanceof PhotoTransferError&&error.kind==="abort"&&!error.allowRelay);
 const timed=new XHR(),timeout=transferPhoto({url:"https://fictional.test",body:new Blob(),createXHR:factory(timed)});timed.ontimeout?.();await assert.rejects(timeout,error=>error instanceof PhotoTransferError&&error.kind==="timeout"&&error.allowRelay);
 const network=new XHR(),failed=transferPhoto({url:"https://fictional.test",body:new Blob(),createXHR:factory(network)});network.onerror?.();await assert.rejects(failed,error=>error instanceof PhotoTransferError&&error.kind==="network");
 const rejected=new XHR();rejected.status=403;rejected.responseText="<Code>AccessDenied</Code><Message>private-secret</Message>";const request=transferPhoto({url:"https://fictional.test",body:new Blob(),createXHR:factory(rejected)});rejected.onload?.();await assert.rejects(request,error=>error instanceof PhotoTransferError&&error.status===403&&!error.allowRelay&&!error.message.includes("private-secret"));
});
