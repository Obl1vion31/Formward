import {spawn} from "node:child_process";
import {randomUUID} from "node:crypto";
import {createRequire} from "node:module";
import {readFile,writeFile,copyFile} from "node:fs/promises";
const require=createRequire(import.meta.url);
// 一次构建一个标识，浏览器与接口内联相同值；重启不重新生成。
const version=process.env.FORMWARD_BUILD_VERSION||randomUUID();
if(!/^[a-zA-Z0-9._-]{1,120}$/.test(version))throw new Error("Invalid build version");
const child=spawn(process.execPath,[require.resolve("next/dist/bin/next"),"build","--webpack"],{stdio:"inherit",env:{...process.env,FORMWARD_BUILD_VERSION:version}});
child.on("error",error=>{console.error(error);process.exitCode=1;});
child.on("exit",async(code,signal)=>{
 if(signal){process.kill(process.pid,signal);return;}
 if(code){process.exitCode=code;return;}
 try {
  const manifest=JSON.parse(await readFile(".next/server/server-reference-manifest.json","utf8"));
  const ids=[...new Set([...Object.keys(manifest.node??{}),...Object.keys(manifest.edge??{})])];
  await writeFile(".next/security-actions.json",JSON.stringify(ids));
  if(process.env.FORMWARD_STANDALONE==="1")await copyFile(".next/security-actions.json",".next/standalone/.next/security-actions.json");
 }catch{process.stderr.write("Security action manifest could not be generated.\n");process.exitCode=1;return;}
 const worker=spawn(process.execPath,["scripts/build-chat-worker.mjs"],{stdio:"inherit",env:process.env});
 worker.on("error",()=>{process.exitCode=1;});worker.on("exit",code=>{process.exitCode=code??1;});
});
