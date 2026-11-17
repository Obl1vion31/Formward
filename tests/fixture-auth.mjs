import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {writeFile} from 'node:fs/promises';

function totp(secret){
 const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567',bits=[...secret.toUpperCase().replace(/=/g,'')].map(c=>alphabet.indexOf(c).toString(2).padStart(5,'0')).join('');
 const key=Buffer.from(bits.match(/.{8}/g).map(value=>parseInt(value,2))),counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));
 const hash=createHmac('sha1',key).update(counter).digest(),offset=hash[19]&15;
 return String((hash.readUInt32BE(offset)&0x7fffffff)%1e6).padStart(6,'0');
}

/** 隔离账号也走真实密码与MFA端点，不关闭正式身份验证要求。 */
export async function authenticateFixture(request,config,path){
 const account=config.account??{email:config.email,password:config.password};
 assert.equal(new URL(config.baseURL).hostname,'127.0.0.1');assert.ok(config.isolatedFixture&&account.email.endsWith('@example.test'));
 const post=(route,data)=>request.post(config.baseURL+'/api/auth/'+route,{headers:{Origin:config.baseURL},data});
 const login=await post('sign-in/email',account);assert.equal(login.status(),200);
 const result=await login.json();
 if(result.twoFactorRedirect){assert.ok(config.mfaSecret,'隔离验证器必须来自本账号的首次真实绑定');assert.equal((await post('two-factor/verify-totp',{code:totp(config.mfaSecret),trustDevice:false})).status(),200);}
 else if(result.user?.role==='owner'&&!result.user.twoFactorEnabled){
  const setup=await post('two-factor/enable',{password:account.password,issuer:'Formward'});assert.equal(setup.status(),200);
  config.mfaSecret=new URL((await setup.json()).totpURI).searchParams.get('secret');assert.ok(config.mfaSecret);
  assert.equal((await post('two-factor/verify-totp',{code:totp(config.mfaSecret),trustDevice:false})).status(),200);
  await writeFile(path,JSON.stringify(config),{mode:0o600});
 }
 return config;
}
