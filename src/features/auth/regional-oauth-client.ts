import { fetchClientMetadataResource } from "@better-auth/cimd/node";
import { cleanForwardHeaders, serviceHeaders, regionalResponse } from "./regional-transport";
import { regionConfig } from "./regions";
import type { OAuthEnvelope } from "./oauth-preflight";
import { readBoundedBody } from "./request-body";
export async function gatewayOAuthRequest(request:Request,fetcher:typeof fetch=fetch) {
  const config=regionConfig(),url=new URL(request.url);
  let body: Buffer;
  const tooLarge = new Error("请求过大。");
  try {
    body = request.body ? await readBoundedBody(request.body, 131072, () => tooLarge) : Buffer.alloc(0);
  } catch (error) {
    if (error === tooLarge) return new Response(null,{status:413});
    throw error;
  }
  const envelope:OAuthEnvelope={method:request.method as "GET"|"POST",path:url.pathname+url.search,headers:Object.fromEntries(cleanForwardHeaders(request.headers)),body:body.toString("base64"),materials:[]};
  async function call(path:string) {
    const target=new URL(path,config.transport);
    return fetcher(target,{method:"POST",headers:{"Content-Type":"application/json",...serviceHeaders("POST",path,url.origin,request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim()??"")},body:JSON.stringify(envelope),redirect:"manual",cache:"no-store",signal:AbortSignal.any([request.signal,AbortSignal.timeout(20000)])});
  }
  for(let round=0;round<(url.pathname.includes("/oauth2/")?2:0);round++){
    const response=await call("/api/internal/oauth-preflight");
    if(!response.ok)return regionalResponse(response);
    const needed=await response.json() as {url:string;maxBytes:number}[];
    for(const item of needed){
      if(envelope.materials.some(m=>m.url===item.url))continue;
      const resource=await fetchClientMetadataResource(item.url,{method:"GET",redirect:"manual",signal:AbortSignal.timeout(5000),headers:{Accept:"application/json"}});
      if(resource.status!==200||!resource.body)throw new Error("客户端资料暂不可读取。");
      const bytes = await readBoundedBody(resource.body, Math.min(item.maxBytes,65536), () => new Error("客户端资料过大。"));
      envelope.materials.push({url:item.url,body:new TextDecoder("utf-8",{fatal:true,ignoreBOM:true}).decode(bytes),contentType:resource.headers.get("content-type")??"application/json"});
    }
  }
  const response=await call("/api/internal/oauth-execute");
  return regionalResponse(response);
}
