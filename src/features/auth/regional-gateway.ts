import { forwardRegionalRequest,verifyService } from "./regional-transport";
import { gatewayOAuthRequest } from "./regional-oauth-client";
import { regionConfig } from "./regions";
import { regionalHttpFetch } from "./regional-http";
import { runImageWorker } from "../meals/image-worker";
import { readWorkerImage } from "../meals/image-read";
import { singleWebRedirect } from "./web-entry";

export async function handleGatewayRequest(request:Request) {
 try{
  const config=regionConfig(),url=new URL(request.url);
  if(![config.canonical,config.global].includes(url.origin))return new Response(null,{status:421});
  const webRedirect=singleWebRedirect(request);if(webRedirect)return webRedirect;
  if(url.pathname==="/api/internal/image-worker"){
   if(request.method!=="POST"||!verifyService(request.headers,"POST",url.pathname))return new Response(null,{status:403});
   if(Number(request.headers.get("content-length"))>20000)return new Response(null,{status:413});
   const input=await request.clone().json();
   if(input.command==="read")return readWorkerImage(input.ticket);
   return await runImageWorker(request);
  }
  if(url.pathname.startsWith("/api/internal/"))return new Response(null,{status:404});
  if(url.pathname.startsWith("/api/auth/")||url.pathname.startsWith("/.well-known/")){
    if(!["GET","POST"].includes(request.method))return new Response(null,{status:405});
    return await gatewayOAuthRequest(request,regionalHttpFetch);
  }
  const response=await forwardRegionalRequest(request,regionalHttpFetch);
  if(response.headers.get("x-image-worker")==="1" && response.ok) {
   const data=await response.json();return await readWorkerImage(data.ticket);
  }
  return response;
 }catch(error){
  const failure=error as {name?:unknown;code?:unknown;cause?:{code?:unknown}};
  const code=String(failure?.code??failure?.cause?.code??"unknown");
  console.warn(JSON.stringify({event:"gateway_transport_failure",code:/^E[A-Z0-9_]{2,60}$/.test(code)?code:"unknown",kind:failure?.name==="AbortError"?"aborted":"failed"}));
  return Response.json({error:"访问暂时中断，请稍后重试。当前操作不会自动重新提交。"},{status:503,headers:{"Cache-Control":"private, no-store"}});
 }
}
