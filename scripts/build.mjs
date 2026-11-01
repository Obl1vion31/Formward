import {spawn} from "node:child_process";
import {randomUUID} from "node:crypto";
import {createRequire} from "node:module";
const require=createRequire(import.meta.url);
// 一次构建一个标识，浏览器与接口内联相同值；重启不重新生成。
const version=process.env.FORMWARD_BUILD_VERSION||randomUUID();
if(!/^[a-zA-Z0-9._-]{1,120}$/.test(version))throw new Error("Invalid build version");
const child=spawn(process.execPath,[require.resolve("next/dist/bin/next"),"build","--webpack"],{stdio:"inherit",env:{...process.env,FORMWARD_BUILD_VERSION:version}});
child.on("error",error=>{console.error(error);process.exitCode=1;});
child.on("exit",(code,signal)=>{if(signal)process.kill(process.pid,signal);else process.exitCode=code??1;});
