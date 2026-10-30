import { getDatabase } from "@/db/client";
import { oauthEnvelopeSchema, oauthPreflight } from "@/features/auth/oauth-preflight";
export async function POST(request:Request){
  if(request.headers.get("x-formward-region")!=="global")return new Response(null,{status:403});
  try{if(Number(request.headers.get("content-length"))>300000)return new Response(null,{status:413});
    const input=oauthEnvelopeSchema.parse(await request.json());
    return Response.json(await oauthPreflight(getDatabase(),input),{headers:{"Cache-Control":"no-store"}});
  }catch{return Response.json({error:"认证资料预检失败。"},{status:400,headers:{"Cache-Control":"no-store"}});}
}
