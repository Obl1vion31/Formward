import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { IncomingMessage,ServerResponse } from "node:http";
import { handleGatewayRequest } from "../../src/features/auth/regional-gateway";
export default async function handler(req:IncomingMessage,res:ServerResponse){
 const abort=new AbortController();req.once("aborted",()=>abort.abort());res.once("close",()=>{if(!res.writableEnded)abort.abort();});
 try{
  const headers=new Headers();for(let i=0;i<req.rawHeaders.length;i+=2)headers.append(req.rawHeaders[i],req.rawHeaders[i+1]);
  if(process.env.VERCEL!=="1")headers.set("x-vercel-forwarded-for",req.socket.remoteAddress??"");
  const url=(process.env.FORMWARD_GATEWAY_SCHEME??"https")+"://"+headers.get("host")+(req.url??"/");
  const request=new Request(url,{method:req.method,headers,signal:abort.signal,...(!["GET","HEAD"].includes(req.method??"GET")?{body:Readable.toWeb(req),duplex:"half"}:{})} as RequestInit);
  const response=await handleGatewayRequest(request);
  res.statusCode=response.status;for(const [name,value]of response.headers)if(name!=="set-cookie"&&name!=="content-encoding"&&name!=="content-length")res.setHeader(name,value);
  const cookies=response.headers.getSetCookie();if(cookies.length)res.setHeader("Set-Cookie",cookies);
  if(response.body&&req.method!=="HEAD")await pipeline(Readable.fromWeb(response.body as never),res);else res.end();
 }catch{if(!res.headersSent){res.statusCode=503;res.setHeader("Cache-Control","no-store");res.end("访问暂时中断，请稍后重试。");}else res.destroy();}
}
