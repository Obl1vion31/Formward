import { verifyService } from "@/features/auth/regional-transport";
import { getDatabase } from "@/db/client";
import { getAuth } from "@/features/auth/server";
import { regionConfig, publicRequestOrigin } from "@/features/auth/regions";
import { cleanForwardHeaders } from "@/features/auth/regional-transport";
import { oauthEnvelopeSchema,validateOAuthMaterials } from "@/features/auth/oauth-preflight";
import { withOAuthMaterials } from "@/features/auth/oauth-network";
export async function POST(request:Request){
 if(!verifyService(request.headers,request.method,new URL(request.url).pathname+new URL(request.url).search))return new Response(null,{status:403});
 try{
  if(Number(request.headers.get("content-length"))>300000)return new Response(null,{status:413});
  const input=oauthEnvelopeSchema.parse(await request.json());await validateOAuthMaterials(getDatabase(),input);
  const headers=cleanForwardHeaders(new Headers(input.headers)),origin=publicRequestOrigin(request.headers);
  headers.set("x-formward-public-origin",origin);headers.set("x-formward-region","global");headers.set("x-forwarded-for",request.headers.get("x-forwarded-for")??"");
  const target=new URL(input.path,regionConfig().canonical);headers.set("host",target.host);
  const original=new Request(target,{method:input.method,headers,...(input.method==="POST"?{body:Buffer.from(input.body,"base64")}:{})});
  const response=await withOAuthMaterials(input.materials,()=>getAuth().handler(original));
  response.headers.set("Cache-Control","private, no-store");return response;
 }catch{return Response.json({error:"认证服务暂时不可用，请重试。"},{status:503,headers:{"Cache-Control":"no-store"}});}
}
