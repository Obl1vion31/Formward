// 仅由隔离 worker 显式导入。真实请求走独立固定试验账本。
import assert from "node:assert/strict";
import { open, readFile, rename, stat, writeFile } from "node:fs/promises";
import { unlinkSync } from "node:fs";
import { parseEnv } from "node:util";

const endpoint = "https://maas.qianwenaiapi.com/compatible-mode/v1/chat/completions";
const limitCny = 1;
// 按 100 万最大输入 token、8192+10 最大输出 token 和核实的按量单价向上取整。
const maximumCny = 0.83;

export async function budgetedQwen(fixture, fetcher) {
  assert.ok(fixture.account.email.endsWith("@example.test") && fixture.isolatedFixture &&
    new URL(fixture.baseURL).hostname === "127.0.0.1" && process.env.FORMWARD_ENVIRONMENT === "isolated-chat-browser");
  const keyFile = process.env.FORMWARD_CHAT_LIVE_KEY_FILE;
  assert.equal((await stat(keyFile)).mode & 0o777,0o600);
  const settings = parseEnv(await readFile(keyFile,"utf8"));
  assert.ok(settings.QWEN_API_KEY && settings.QWEN_BASE_URL?.replace(/\/$/,"") + "/chat/completions" === endpoint);
  const file = process.env.FORMWARD_CHAT_LIVE_LEDGER;
  assert.ok(file);
  const lock = file + ".lock";
  const handle = await open(lock,"wx",0o600);
  await handle.close();
  process.on("exit",()=>unlinkSync(lock));
  const save = async value => {
    const temporary = file + ".tmp";
    await writeFile(temporary,JSON.stringify(value,null,2),{mode:0o600});
    await rename(temporary,file);
  };
  const ledger = await readFile(file,"utf8").then(JSON.parse,error=>{
    if (error.code !== "ENOENT") throw error;
    return {limitCny,maximumCny,settledCny:0,inFlight:null,stopped:false,requests:[]};
  });
  assert.equal(ledger.limitCny,limitCny);
  assert.equal(ledger.maximumCny,maximumCny);
  await save(ledger);

  return async function send(url,init) {
    const request = JSON.parse(String(init?.body));
    assert.ok(url.href === endpoint && request.model === "qwen3.8-flash" && request.stream === true &&
      request.max_completion_tokens === 8192 && request.stream_options?.include_usage === true);
    if (ledger.stopped || ledger.inFlight || ledger.settledCny + maximumCny > limitCny + 1e-8) {
      return Response.json({error:{code:"insufficient_quota",message:"隔离试验预算不足"}},{status:429});
    }
    const images = request.messages.reduce((sum,message)=>sum+
      (Array.isArray(message.content)?message.content.filter(part=>part.type==="image_url").length:0),0);
    ledger.inFlight = {number:ledger.requests.length+1,images,reservedCny:maximumCny,startedAt:new Date().toISOString()};
    await save(ledger);
    const headers = new Headers(init.headers);
    headers.set("Authorization","Bearer "+settings.QWEN_API_KEY);
    let response, raw, usage;
    try {
      response = await fetcher(endpoint,{...init,headers,redirect:"error"});
      raw = await response.text();
      if (response.ok) {
        for (const line of raw.split(/\r?\n/)) {
          if (line.startsWith("data: ") && line !== "data: [DONE]") usage = JSON.parse(line.slice(6)).usage ?? usage;
        }
      }
    } catch {
      ledger.stopped = true;
    }
    const input = usage?.prompt_tokens, output = usage?.completion_tokens;
    const cached = usage?.prompt_tokens_details?.cached_tokens ?? usage?.prompt_cache_hit_tokens ?? 0;
    const valid = [input,output,cached].every(value=>Number.isSafeInteger(value)&&value>=0) && cached<=input;
    const costCny = valid ? ((input-cached)*.8 + cached*.1 + output*2.7)/1e6 : null;
    ledger.requests.push({...ledger.inFlight,status:response?.status??null,input,output,cached,costCny});
    if (costCny === null) ledger.stopped = true;
    else {
      ledger.settledCny += costCny;
      ledger.inFlight = null;
      if (costCny > maximumCny) ledger.stopped = true;
    }
    await save(ledger);
    if (raw === undefined || !response) throw Error("隔离千问请求未结算");
    return new Response(raw,{status:response.status,headers:response.headers});
  };
}
