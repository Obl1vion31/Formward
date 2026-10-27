import {headers} from "next/headers";
import {currentUser} from "@/features/auth/server";
import {getDatabase} from "@/db/client";
import {recordStamps} from "@/features/records/changes";
export async function GET(request:Request){
 const user=await currentUser(await headers());
 if(!user)return Response.json({error:"请先登录。"},{status:401,headers:{"Cache-Control":"no-store"}});
 const keys=new URL(request.url).searchParams.get("keys");if(keys&&keys.length>12000)return Response.json({error:"请求范围过大"},{status:400});
 const records=await recordStamps(getDatabase(),user.id,!!keys);
 return Response.json({records:keys?records.filter(row=>keys.split("|").includes(row.key)):records},{headers:{"Cache-Control":"private, no-store"}});
}
