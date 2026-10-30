import assert from "node:assert/strict";
import {generateKeyPairSync,createSign,randomUUID,createHash,randomBytes} from "node:crypto";
import {eq,sql} from "drizzle-orm";
import {regionalFixture} from "./regional-fixture.mjs";
import {serviceHeaders} from "../src/features/auth/regional-transport";
import {oauthClient,oauthClientAssertion,oauthAccessToken,oauthRefreshToken} from "../src/db/schema";
import type {OAuthEnvelope} from "../src/features/auth/oauth-preflight";
const fixture=await regionalFixture({trustedOrigin:"https://example.com"}),checks:string[]=[];
try{
 const uri="https://example.com/formward-client-jwks.json";
 function key(kid:string){const pair=generateKeyPairSync("rsa",{modulusLength:2048});return {...pair,jwks:{keys:[{...pair.publicKey.export({format:"jwk"}),kid,alg:"RS256",use:"sig"}]},kid};}
 function assertion(clientId:string,keys:ReturnType<typeof key>,jti=randomUUID()){
  const head=Buffer.from(JSON.stringify({alg:"RS256",kid:keys.kid,typ:"JWT"})).toString("base64url"),payload=Buffer.from(JSON.stringify({iss:clientId,sub:clientId,aud:fixture.global+"/api/auth/oauth2/token",iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+120,jti})).toString("base64url"),message=head+"."+payload;
  return message+"."+createSign("RSA-SHA256").update(message).sign(keys.privateKey,"base64url");
 }
 function request(clientId:string,refresh:string,jwt:string):OAuthEnvelope{
  return {method:"POST",path:"/api/auth/oauth2/token",headers:{"content-type":"application/x-www-form-urlencoded"},body:Buffer.from(new URLSearchParams({grant_type:"refresh_token",client_id:clientId,client_assertion_type:"urn:ietf:params:oauth:client-assertion-type:jwt-bearer",client_assertion:jwt,refresh_token:refresh,resource:fixture.global+"/api/mcp"}).toString()).toString("base64"),materials:[]};
 }
 async function call(action:string,input:OAuthEnvelope){
  const path="/api/internal/oauth-"+action;return fetch(fixture.transport+path,{method:"POST",headers:{Host:new URL(fixture.transport).host,"Content-Type":"application/json",...serviceHeaders("POST",path,fixture.global)},body:JSON.stringify(input),redirect:"manual"});
 }
 const firstKey=key("first"),[client]=await fixture.db.select().from(oauthClient).where(eq(oauthClient.clientId,fixture.clientId));assert.ok(client);
 await fixture.db.update(oauthClient).set({tokenEndpointAuthMethod:"private_key_jwt",jwks:null,jwksUri:uri}).where(eq(oauthClient.clientId,fixture.clientId));
 async function counts(){return Promise.all([oauthClientAssertion,oauthAccessToken,oauthRefreshToken].map(table=>fixture.db.select({count:sql<number>`count(*)::int`}).from(table)));}
 const jwt=assertion(fixture.clientId,firstKey),input=request(fixture.clientId,fixture.oldTokens.refresh_token,jwt),before=await counts();
 const preflight=await call("preflight",input);assert.equal(preflight.status,200);assert.deepEqual(await preflight.json(),[{url:uri,maxBytes:65536}]);assert.deepEqual(await counts(),before);
 checks.push("真实Next production：OAuth预检仅返回存储客户端的公钥地址，不消费断言／刷新或签发令牌");
 const withKey=(envelope:OAuthEnvelope,keys:ReturnType<typeof key>,url=uri)=>({...envelope,materials:[{url,body:JSON.stringify(keys.jwks),contentType:"application/json"}]});
 const first=await call("execute",withKey(input,firstKey));assert.equal(first.status,200,await first.clone().text());let tokens=await first.json();
 const replay=await call("execute",withKey(request(fixture.clientId,tokens.refresh_token,jwt),firstKey));assert.ok(replay.status>=400);
 const wrong=assertion(fixture.clientId,key("unapproved"));
 const bad=await call("execute",withKey(request(fixture.clientId,tokens.refresh_token,wrong),firstKey));assert.ok(bad.status>=400);
 const rotated=key("rotated"),rotate=await call("execute",withKey(request(fixture.clientId,tokens.refresh_token,assertion(fixture.clientId,rotated)),rotated));assert.equal(rotate.status,200,await rotate.clone().text());tokens=await rotate.json();
 checks.push("非CIMD私钥断言经原SDK验证，错误签名与jti重放拒绝，公钥轮换可刷新旧连接");
 const secondId=randomUUID(),secondUri="https://example.com/other-client-jwks.json",secondKey=key("other");
 await fixture.db.insert(oauthClient).values({...client,id:randomUUID(),clientId:secondId,tokenEndpointAuthMethod:"private_key_jwt",jwks:null,jwksUri:secondUri});
 const [valid,invalidGrant]=await Promise.all([
  call("execute",withKey(request(fixture.clientId,tokens.refresh_token,assertion(fixture.clientId,rotated)),rotated)),
  call("execute",withKey(request(secondId,"fictional-invalid-refresh",assertion(secondId,secondKey)),secondKey,secondUri))
 ]);
 assert.equal(valid.status,200,await valid.clone().text());assert.ok(invalidGrant.status>=400);assert.equal((await invalidGrant.json()).error,"invalid_grant");
 checks.push("两个production请求并行使用不同客户端资料，材料和Response流互不串用");
 const docUrl="https://cimd.example.com/formward-client.json",jwksUrl="https://cimd.example.com/formward-cimd-jwks.json",verifier=randomBytes(32).toString("base64url");
 const query=new URLSearchParams({client_id:docUrl,redirect_uri:"https://example.com/cimd-callback",response_type:"code",scope:"openid profile offline_access measurements:read",state:randomUUID(),code_challenge:createHash("sha256").update(verifier).digest("base64url"),code_challenge_method:"S256",resource:fixture.global+"/api/mcp"});
 const envelope:OAuthEnvelope={method:"GET",path:"/api/auth/oauth2/authorize?"+query,headers:{accept:"text/html",cookie:fixture.oldCookie},body:"",materials:[]};
 const document={client_id:docUrl,client_name:"虚构CIMD客户端",redirect_uris:["https://example.com/cimd-callback"],token_endpoint_auth_method:"private_key_jwt",jwks_uri:jwksUrl,grant_types:["authorization_code","refresh_token"],response_types:["code"]};
 const docMaterial={url:docUrl,body:JSON.stringify(document),contentType:"application/json"};
 const pre1=await call("preflight",envelope);assert.deepEqual(await pre1.json(),[{url:docUrl,maxBytes:5120}]);
 const pre2=await call("preflight",{...envelope,materials:[docMaterial]});assert.deepEqual(await pre2.json(),[{url:docUrl,maxBytes:5120},{url:jwksUrl,maxBytes:65536}]);
 const authorized=await call("execute",{...envelope,materials:[docMaterial,{url:jwksUrl,body:JSON.stringify(firstKey.jwks),contentType:"application/json"}]});
 assert.ok([200,302].includes(authorized.status),await authorized.clone().text());
 const consentLocation=authorized.headers.get("location")??(await authorized.clone().json()).url;
 const materials=[docMaterial,{url:jwksUrl,body:JSON.stringify(firstKey.jwks),contentType:"application/json"}];
 const consentEnvelope:OAuthEnvelope={method:"POST",path:"/api/auth/oauth2/consent",headers:{"content-type":"application/json",origin:fixture.global,cookie:fixture.oldCookie},body:Buffer.from(JSON.stringify({accept:true,oauth_query:new URL(consentLocation,fixture.global).search.slice(1)})).toString("base64"),materials};
 const consentResponse=await call("execute",consentEnvelope);assert.equal(consentResponse.status,200,await consentResponse.clone().text());
 const code=new URL((await consentResponse.json()).url).searchParams.get("code")!;
 const params=new URLSearchParams({grant_type:"authorization_code",client_id:docUrl,code,code_verifier:verifier,redirect_uri:"https://example.com/cimd-callback",resource:fixture.global+"/api/mcp",client_assertion_type:"urn:ietf:params:oauth:client-assertion-type:jwt-bearer",client_assertion:assertion(docUrl,firstKey)});
 const tokenEnvelope:OAuthEnvelope={method:"POST",path:"/api/auth/oauth2/token",headers:{"content-type":"application/x-www-form-urlencoded"},body:Buffer.from(params.toString()).toString("base64"),materials};
 const cimdToken=await call("execute",tokenEnvelope);assert.equal(cimdToken.status,200,await cimdToken.clone().text());const cimdTokens=await cimdToken.json();
 const cimdRotated=key("cimd-rotated"),refreshEnvelope=request(docUrl,cimdTokens.refresh_token,assertion(docUrl,cimdRotated));
 refreshEnvelope.materials=[docMaterial,{url:jwksUrl,body:JSON.stringify(cimdRotated.jwks),contentType:"application/json"}];
 const cimdRefresh=await call("execute",refreshEnvelope);assert.equal(cimdRefresh.status,200,await cimdRefresh.clone().text());
 checks.push("CIMD官方钩子完成production授权、同意、私钥断言兑换与公钥轮换刷新；不扩展网页登录可信来源");

 const spoofed=await call("execute",{...input,materials:[{url:"https://evil.example/keys",body:'{"keys":[]}',contentType:"application/json"}]});assert.equal(spoofed.status,503);
 console.log(JSON.stringify({checks},null,2));
}finally{await fixture.close();}
