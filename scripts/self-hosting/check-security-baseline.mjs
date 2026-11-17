import {readFile,stat,realpath} from "node:fs/promises";
import {join,resolve} from "node:path";

/** 正式主应用与worker的ExecStartPre。防止操作回退时重新启用缺少门禁的历史包。 */
const directory=resolve(process.argv[2]??process.cwd());
const version=value=>typeof value==="string"&&/^\d+\.\d+\.\d+$/.test(value)?value.split(".").map(Number):null;
const atLeast=(value,minimum)=>{const parts=version(value);if(!parts)return false;for(let i=0;i<3;i++){if(parts[i]!==minimum[i])return parts[i]>minimum[i];}return true;};
try{
 const root=await realpath(directory),pkg=JSON.parse(await readFile(join(root,"package.json"),"utf8")),manifest=JSON.parse(await readFile(join(root,"release-manifest.json"),"utf8"));
 const actions=JSON.parse(await readFile(join(root,".next/security-actions.json"),"utf8"));
 const packages=["better-auth","@better-auth/core","@better-auth/cimd","@better-auth/drizzle-adapter","@better-auth/mcp","@better-auth/oauth-provider"];
 if(!atLeast(pkg.dependencies?.next,[16,4,5])||packages.some(name=>!atLeast(pkg.dependencies?.[name],[1,7,25]))||new Set(packages.map(name=>pkg.dependencies[name])).size!==1)throw Error("dependency_baseline");
 if(!/^\d{4}_/.test(manifest.schema)||Number(manifest.schema.slice(0,4))<44||!Array.isArray(actions)||!actions.length||actions.some(id=>typeof id!=="string"||!/^[a-f0-9]{40,64}$/i.test(id)))throw Error("security_baseline");
 if(!(await stat(join(root,".next/server/app/account/security/page.js"))).isFile())throw Error("mfa_page_missing");
 if(root.startsWith("/srv/formward-primary/releases/")&&(await stat(root)).uid!==0)throw Error("untrusted_release_owner");
}catch{
 process.stderr.write("Formward安全基线未通过，已阻止启动。请使用保留MFA、预算与新动作门禁的兼容运行包；不要回退数据库。\n");process.exitCode=1;
}
