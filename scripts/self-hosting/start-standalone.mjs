// formward-self-hosting-managed-v1
import http from "node:http";
import {syncBuiltinESMExports} from "node:module";
import {resolve,dirname} from "node:path";
import {fileURLToPath,pathToFileURL} from "node:url";

const target=resolve(process.argv[2]??resolve(dirname(fileURLToPath(import.meta.url)),"server.js"));
const raw=process.env.FORMWARD_UPLOAD_PORT;
if(raw){
 const uploadPort=Number(raw),mainPort=Number(process.env.PORT??3000);
 if(!/^\d+$/.test(raw)||!Number.isInteger(uploadPort)||uploadPort<1||uploadPort>65535||uploadPort===mainPort)throw Error("上传监听端口须为独立的有效回环端口。");
 const original=http.createServer;
 let captured=false;
 http.createServer=function(...args){
  const main=Reflect.apply(original,http,args);
  main.once("listening",()=>{
   const address=main.address();
   if(captured||!address||typeof address!=="object"||address.port!==mainPort)return;
   captured=true;http.createServer=original;syncBuiltinESMExports();
   const upload=original({requestTimeout:660000,headersTimeout:60000},(request,response)=>{
    if(request.url?.split("?")[0]!=="/api/meal-images/upload"){response.writeHead(404).end();return;}
    if(!["GET","POST"].includes(request.method)){response.writeHead(405,{Allow:"GET, POST"}).end();return;}
    main.emit("request",request,response);
   });
   upload.keepAliveTimeout=main.keepAliveTimeout;
   upload.on("error",error=>{console.error(JSON.stringify({event:"private_upload_listener_failed",code:error.code??"unknown"}));process.exit(1);});
   main.once("close",()=>{upload.closeAllConnections();upload.close();});
   upload.listen(uploadPort,"127.0.0.1",()=>console.info(JSON.stringify({event:"private_upload_listener_ready",port:uploadPort,requestTimeoutMs:upload.requestTimeout})));
  });
  return main;
 };
 syncBuiltinESMExports();
}
process.argv=[process.argv[0],target,...process.argv.slice(3)];
await import(pathToFileURL(target).href);
