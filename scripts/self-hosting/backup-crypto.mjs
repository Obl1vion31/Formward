import {createCipheriv,createDecipheriv,randomBytes,createHash} from "node:crypto";
import {readFile,open,stat,lstat,appendFile,link,unlink,realpath,mkdtemp,rmdir} from "node:fs/promises";
import {createReadStream,createWriteStream} from "node:fs";
import {pipeline} from "node:stream/promises";
import {dirname,resolve,join} from "node:path";
const [mode,input,output]=process.argv.slice(2),root=await realpath(process.env.FORMWARD_BACKUP_ROOT??"/var/backups/formward-primary");
if(!["encrypt","decrypt"].includes(mode)||!input||!output)throw new Error("Expected encrypt|decrypt and private paths");
for(const file of [input,output])if(await realpath(dirname(resolve(file)))!==root)throw new Error("Backup paths must remain private");
const inputInfo=await lstat(input);if(!inputInfo.isFile()||inputInfo.isSymbolicLink())throw new Error("Expected a regular private backup");
const keyPath=process.env.FORMWARD_BACKUP_KEY_FILE??"/etc/formward/backup-key",keyInfo=await stat(keyPath);
if(keyInfo.uid!==0||(keyInfo.mode&0o077)!==0)throw new Error("Backup key permission invalid");
const raw=(await readFile(keyPath,"utf8")).trim();if(!/^[a-f0-9]{64}$/i.test(raw))throw new Error("Backup key invalid");
const key=Buffer.from(raw,"hex"),magic=Buffer.from("FWDBAK01"),size=inputInfo.size;
const temp=await mkdtemp(join(root,".crypto-")),pending=join(temp,"payload");
try{
 if(mode==="encrypt"){
  const nonce=randomBytes(12),cipher=createCipheriv("aes-256-gcm",key,nonce);cipher.setAAD(magic);
  const target=createWriteStream(pending,{flags:"wx",mode:0o600});target.write(Buffer.concat([magic,nonce]));
  await pipeline(createReadStream(input),cipher,target);await appendFile(pending,cipher.getAuthTag());
 }else{
  if(size<36)throw new Error("Encrypted archive truncated");
  const file=await open(input,"r"),header=Buffer.alloc(20),tag=Buffer.alloc(16);await file.read(header,0,20,0);await file.read(tag,0,16,size-16);await file.close();
  if(!header.subarray(0,8).equals(magic))throw new Error("Encrypted archive format mismatch");
  const cipher=createDecipheriv("aes-256-gcm",key,header.subarray(8,20));cipher.setAAD(magic);cipher.setAuthTag(tag);
  await pipeline(createReadStream(input,{start:20,end:size-17}),cipher,createWriteStream(pending,{flags:"wx",mode:0o600}));
 }
 await link(pending,output);
 const hash=createHash("sha256");for await(const bytes of createReadStream(output))hash.update(bytes);
 console.log(JSON.stringify({mode,format:"FWDBAK01",algorithm:"AES-256-GCM",bytes:(await stat(output)).size,sha256:hash.digest("hex")}));
}finally{await unlink(pending).catch(()=>{});await rmdir(temp).catch(()=>{});}
