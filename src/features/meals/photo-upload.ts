"use client";
import {choosePhotoRoute,type PhotoRegion,type PhotoRoute} from "./photo-route";
import {PhotoTransferError,transferPhoto} from "./photo-transfer";
import {imageMimeFromBytes} from "./image-format";
export {PhotoTransferError} from "./photo-transfer";
export type PhotoUploadPhase="read"|"route"|"prepare"|"sign"|"upload"|"relay"|"complete"|"ready";
export type PhotoUploadProgress={phase:PhotoUploadPhase;label:string;loaded:number;total:number;percent:number;region?:PhotoRegion};
export type PhotoUploadOptions={signal?:AbortSignal;region?:PhotoRegion;route?:Promise<PhotoRoute>;transport?:"direct"|"relay";onProgress?:(state:PhotoUploadProgress)=>void;onPreview?:(body:Blob)=>void};
const snapshots=new WeakMap<File,Promise<{body:Blob;sha256:string}>>();
function scope(signal:AbortSignal|undefined,ms:number){
 const controller=new AbortController(),abort=()=>controller.abort(signal?.reason),timer=setTimeout(()=>controller.abort(new DOMException("timeout","TimeoutError")),ms);
 if(signal?.aborted)abort();else signal?.addEventListener("abort",abort,{once:true});
 return {signal:controller.signal,close(){clearTimeout(timer);signal?.removeEventListener("abort",abort);}};
}
async function request(body:unknown,phase:string,signal?:AbortSignal,timeoutMs=30000){
 const timeout=scope(signal,timeoutMs);
 try{
  const response=await fetch("/api/meal-images/upload",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body),signal:timeout.signal});
  const result=await response.json().catch(()=>({error:"照片服务响应异常，请重试。"}));
  if(!response.ok)throw new Error((result.error??"照片上传失败，请重试。")+"（"+phase+"，HTTP "+response.status+"）");
  return result;
 }catch(error){if(signal?.aborted)throw new PhotoTransferError("照片上传已取消，尚未发送到聊天。","abort");if(timeout.signal.aborted)throw new Error(phase+"连接未完成或超时，请重试。");if(error instanceof TypeError)throw new Error(phase+"连接未完成，请重试。");throw error;}
 finally{timeout.close();}
}
async function snapshotPhoto(file:File){
 let pending=snapshots.get(file);
 if(!pending){
  pending=(async()=>{
   let timer:ReturnType<typeof setTimeout>|undefined;
   try{
    const bytes=await Promise.race([file.arrayBuffer(),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error("读取照片超时，请重新选择已下载到手机的原图。")),30000);})]);
    if(bytes.byteLength!==file.size)throw new Error("照片内容未完整读取，请重新选择原图。");
    const mimeType=imageMimeFromBytes(new Uint8Array(bytes));
    if(!mimeType)throw new Error("支持 JPEG、PNG、WebP，请选择对应原图。");
    const hash=await crypto.subtle.digest("SHA-256",bytes);
    return {body:new Blob([bytes],{type:mimeType}),sha256:[...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,"0")).join("")};
   }catch(error){snapshots.delete(file);if(error instanceof Error&&/^(读取照片超时|照片内容未完整读取|支持 JPEG)/.test(error.message))throw error;throw new Error("无法读取所选照片，请先将原图下载到手机后重新选择。");}
   finally{clearTimeout(timer);}
  })();
  snapshots.set(file,pending);
 }
 return pending;
}
function abortable<T>(promise:Promise<T>,signal?:AbortSignal):Promise<T>{
 if(!signal)return promise;
 return new Promise((resolve,reject)=>{const abort=()=>reject(new PhotoTransferError("照片上传已取消，尚未发送到聊天。","abort"));if(signal.aborted)abort();else signal.addEventListener("abort",abort,{once:true});promise.then(resolve,reject).finally(()=>signal.removeEventListener("abort",abort));});
}
function diagnostic(traceId:string,phase:string,started:number,extra:Record<string,unknown>={}){
 if(typeof window==="undefined")return;
 void fetch("/api/meal-images/upload",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({step:"diagnostic",diagnostic:{traceId,phase,elapsedMs:Math.trunc(Math.max(0,Math.min(900000,performance.now()-started))),...extra}}),keepalive:true,signal:AbortSignal.timeout(5000)}).catch(()=>{});
}
function validatePhoto(file:File){
 if(!file.size||file.size>20*1024*1024)throw new Error("照片须为非空文件，最大20 MiB。");
}
/** 选图时即保存原始字节；排队等待网络不再依赖Safari临时文件。 */
export async function stagePrivateMealPhoto(file:File){validatePhoto(file);return (await snapshotPhoto(file)).body;}
/** 聊天与表单共用私有原图；失败重试复用同一份内存字节，不重新读取Safari临时File。 */
export async function uploadPrivateMealPhoto(file:File,progress:(label:string)=>void=()=>{},options:PhotoUploadOptions={}){
 validatePhoto(file);
 const traceId=crypto.randomUUID(),started=performance.now();let loaded=0,total=file.size,phase:PhotoUploadPhase="read",region:PhotoRegion|undefined,relayAvailable=false;
 const report=(next:PhotoUploadPhase,label:string,percent=0)=>{phase=next;progress(label);options.onProgress?.({phase:next,label,loaded,total,percent,region});};
 const check=()=>{if(options.signal?.aborted)throw new PhotoTransferError("照片上传已取消，尚未发送到聊天。","abort");};
 try{
  check();report("read","正在读取照片…");diagnostic(traceId,phase,started);
  const snapshot=await abortable(snapshotPhoto(file),options.signal);check();options.onPreview?.(snapshot.body);
  report("route","正在选择上传通道…");
  region=(await abortable(options.region?Promise.resolve({region:options.region}):options.route??choosePhotoRoute(),options.signal)).region;
  report("prepare","正在申请上传凭据…");diagnostic(traceId,phase,started);
  const prepared=await request({step:"prepare",region,file:{fileName:file.name,size:snapshot.body.size,mimeType:snapshot.body.type,sha256:snapshot.sha256}},"申请上传凭据",options.signal);
  relayAvailable=prepared.provider==="cos"&&prepared.relayAvailable!==false;
  let image=prepared.image;check();
  if(!image){
   if(prepared.provider==="cos"){
    if(options.transport==="relay"){
     if(!relayAvailable)throw new Error("当前入口请改用国际通道上传原图。");
     report("relay","正在备用上传…");diagnostic(traceId,phase,started);
     await transferPhoto({url:"/api/meal-images/upload",body:snapshot.body,headers:{"Content-Type":"application/octet-stream","x-image-upload-ticket":prepared.ticket},signal:options.signal,onProgress:(sent,size)=>{loaded=sent;total=size;report("relay",sent>=size?"正在等待存储确认…":"正在备用上传…",Math.min(100,Math.floor(sent/size*100)));}});
    }else{
     phase="sign";diagnostic(traceId,phase,started);
     const signed=await request({type:"blob.generate-presigned-url",payload:{pathname:prepared.pathname,clientPayload:prepared.ticket}},"签发上传凭据",options.signal);
     const form=new FormData();for(const [key,value]of Object.entries(signed.fields))form.append(key,String(value));form.append("file",snapshot.body,file.name);
     report("upload","正在上传照片…");diagnostic(traceId,phase,started);
     await transferPhoto({url:signed.url,body:form,signal:options.signal,onProgress:(sent,size)=>{loaded=sent;total=size;report("upload",sent>=size?"正在等待存储确认…":"正在上传照片…",Math.min(100,Math.floor(sent/size*100)));}});
    }
   }else{
    if(options.transport==="relay")throw new Error("国际照片请使用原图直传。");
    report("sign","正在签发上传凭据…");
    const signed=await request({step:"sign_direct",ticket:prepared.ticket},"签发上传凭据",options.signal);
    const target=new URL(String(signed.url));
    if(signed.provider!=="blob"||signed.method!=="PUT"||target.origin!=="https://vercel.com"||!/^\/api\/blob\/?$/.test(target.pathname)||target.username||target.password||target.hash)throw new Error("国际上传地址无效，请重试。");
    report("upload","正在上传照片…");diagnostic(traceId,phase,started);
    await transferPhoto({url:target.href,method:"PUT",body:snapshot.body,headers:{"Content-Type":snapshot.body.type},signal:options.signal,onProgress:(sent,size)=>{loaded=sent;total=size;report("upload",sent>=size?"正在等待存储确认…":"正在上传照片…",Math.min(100,Math.floor(sent/size*100)));}});
   }
   check();report("complete","正在核对原图…",100);diagnostic(traceId,phase,started,{loaded,total,region});
   image=await request({step:"complete",ticket:prepared.ticket},"核对原图",options.signal,90000);
  }
  if(!image||typeof image.id!=="string"||!image.id)throw new Error("照片登记结果不完整，请重试，当前草稿已保留。");
  check();report("ready","照片已就绪",100);diagnostic(traceId,phase,started,{loaded,total,region});snapshots.delete(file);
  return {id:String(image.id),notice:prepared.notice as string|undefined};
 }catch(error){
  if(error instanceof PhotoTransferError&&!relayAvailable)error=new PhotoTransferError(error.message,error.kind,error.status,error.requestId,false);
  diagnostic(traceId,"error",started,{loaded,total,region,errorKind:error instanceof PhotoTransferError?error.kind:phase==="read"?"read":"other",...(error instanceof PhotoTransferError?{status:error.status,...(error.requestId?{requestId:error.requestId}:{})}:{})});
  throw error;
 }
}
