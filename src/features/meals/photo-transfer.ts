"use client";
export class PhotoTransferError extends Error {
 constructor(message:string,public kind:"network"|"stalled"|"timeout"|"http"|"abort",public status=0,public requestId?:string){super(message);this.name="PhotoTransferError";}
 get allowRelay(){return ["network","stalled","timeout"].includes(this.kind);}
}
/** 真实网络字节进度；停滞和绝对超时都结束请求，不自动重传。 */
export function transferPhoto({url,body,headers={},signal,onProgress,createXHR=()=>new XMLHttpRequest(),timeoutMs=120000,stallMs=30000}:{url:string;body:Blob|FormData;headers?:Record<string,string>;signal?:AbortSignal;onProgress?:(loaded:number,total:number)=>void;createXHR?:()=>XMLHttpRequest;timeoutMs?:number;stallMs?:number}){
 return new Promise<void>((resolve,reject)=>{
  const xhr=createXHR();let settled=false,idle:ReturnType<typeof setTimeout>|undefined,last=0;
  const clean=()=>{clearTimeout(idle);signal?.removeEventListener("abort",cancel);};
  const fail=(error:PhotoTransferError)=>{if(settled)return;settled=true;clean();xhr.abort();reject(error);};
  const cancel=()=>fail(new PhotoTransferError("照片上传已取消，尚未发送到聊天。","abort"));
  const resetIdle=()=>{clearTimeout(idle);idle=setTimeout(()=>fail(new PhotoTransferError("照片传输已停滞，可以重试或换方式上传。","stalled")),stallMs);};
  if(signal?.aborted){cancel();return;}
  xhr.open("POST",url);xhr.timeout=timeoutMs;for(const [key,value] of Object.entries(headers))xhr.setRequestHeader(key,value);
  xhr.upload.onprogress=event=>{if(settled)return;if(event.loaded>last){last=event.loaded;resetIdle();}if(event.lengthComputable&&event.total>0)onProgress?.(event.loaded,event.total);};
  xhr.onload=()=>{
   if(settled)return;
   if(xhr.status>=200&&xhr.status<300){settled=true;clean();resolve();return;}
   const text=xhr.responseText??"",code=text.match(/<Code>\s*([A-Za-z][A-Za-z0-9_]{0,63})\s*<\/Code>/)?.[1];
   const rawId=xhr.getResponseHeader("x-cos-request-id")??text.match(/<RequestId>\s*([^<]+)\s*<\/RequestId>/)?.[1],requestId=rawId&&/^[A-Za-z0-9+/_=-]{1,160}$/.test(rawId)?rawId:undefined;
   let hint="";if(url.startsWith("/"))try{const result=JSON.parse(text);if(typeof result.error==="string"&&result.error.length<=200&&/^[\u3400-\u9fff]/.test(result.error)&&!/[<>\r\n]|https?:/i.test(result.error))hint=result.error+" ";}catch{}
   fail(new PhotoTransferError(hint+"照片上传未完成（HTTP "+xhr.status+(code?"，"+code:"")+"），请重试。"+(requestId?" 请求编号："+requestId:""),"http",xhr.status,requestId));
  };
  xhr.onerror=()=>fail(new PhotoTransferError("照片上传连接未完成，请重试或换方式上传。","network"));
  xhr.ontimeout=()=>fail(new PhotoTransferError("照片上传超时，请重试或换方式上传。","timeout"));
  xhr.onabort=()=>fail(new PhotoTransferError("照片上传已取消，尚未发送到聊天。","abort"));
  signal?.addEventListener("abort",cancel,{once:true});resetIdle();
  try{xhr.send(body);}catch{fail(new PhotoTransferError("照片上传连接未建立，请重试。","network"));}
 });
}
