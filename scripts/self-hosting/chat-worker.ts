import {createDatabase} from "../../src/db/client";
import {runChatWorker} from "../../src/features/assistant/chat-jobs";
const controller=new AbortController();
for(const signal of ["SIGTERM","SIGINT"] as const)process.once(signal,()=>controller.abort());
const {db,close}=createDatabase(process.env.DATABASE_URL!);
try{await runChatWorker(db,controller.signal);}catch{console.error("Formward chat worker stopped unexpectedly; pending tasks retained.");process.exitCode=1;}finally{await close();}
