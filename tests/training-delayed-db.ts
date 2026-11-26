import { createServer as createTcpServer, connect, type Socket } from 'node:net';
import { createServer as createHttpServer } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
/** 只用于隔离浏览器 fixture：延迟健康查询，不向应用加入测试等待或生产开关。 */
export async function delayedTrainingDatabase(upstream: string, tables = /\b(training_sessions|training_templates|training_plans|energy_days|activities|meal_items|measurements)\b/i) {
  const endpoint = new URL('tcp://' + upstream), sockets = new Set<Socket>(); let delayMs = 0, delayedQueries = 0, failQueries = false;
  const proxy = createTcpServer(front => {
    const back = connect({ host: endpoint.hostname, port: Number(endpoint.port) }); sockets.add(front); sockets.add(back); let queue = Promise.resolve();
    // postgres.js复用已准备语句时只发送Bind，不再重复SQL；按协议跟踪，避免热读漏掉故障注入。
    let wire = Buffer.alloc(0), startup = true;
    const prepared = new Map<string, boolean>();
    function healthRequest(chunk: Buffer) {
      wire = Buffer.concat([wire, chunk]); let health = false;
      while(wire.length >= (startup ? 4 : 5)) {
        const length = wire.readInt32BE(startup ? 0 : 1), size = length + (startup ? 0 : 1);
        if(length < 4 || size > 24 * 1024 * 1024) { wire = Buffer.alloc(0); break; }
        if(wire.length < size)break;
        const message = wire.subarray(0, size); wire = wire.subarray(size);
        if(startup) { if(length !== 8)startup = false; continue; }
        const type = String.fromCharCode(message[0]), body = message.subarray(5);
        const first = body.indexOf(0), name = body.subarray(0, first).toString();
        if(type === 'P') {
          const end = body.indexOf(0, first + 1);
          prepared.set(name, tables.test(body.subarray(first + 1, end).toString()));
        } else if(type === 'B') {
          const end = body.indexOf(0, first + 1), statement = body.subarray(first + 1, end).toString();
          health ||= prepared.get(statement) === true;
        } else if(type === 'Q')health ||= tables.test(name);
        else if(type === 'C' && body[0] === 83)prepared.delete(body.subarray(1, body.indexOf(0, 1)).toString());
      }
      return health;
    }
    front.on('data', chunk => { const healthQuery = healthRequest(chunk); if(healthQuery && failQueries){back.destroy();front.destroy();return;} const wait = healthQuery ? delayMs : 0; queue = queue.then(async () => { if(wait) {delayedQueries++; await delay(wait);} if(!back.destroyed)back.write(chunk); }).catch(() => { front.destroy(); }); });
    back.on('data', chunk => { if(!front.destroyed)front.write(chunk); });
    front.on('error', () => back.destroy()); back.on('error', () => front.destroy()); front.on('close', () => { back.destroy(); sockets.delete(front); }); back.on('close', () => { front.destroy(); sockets.delete(back); });
  });
  await new Promise<void>(resolve => proxy.listen(0, '127.0.0.1', resolve));
  const control = createHttpServer(async (request, response) => {
    if(request.method !== 'POST' || request.url !== '/delay') {response.writeHead(404).end(); return;}
    const chunks: Buffer[] = []; for await (const chunk of request) chunks.push(Buffer.from(chunk));
    try {const value = JSON.parse(Buffer.concat(chunks).toString()); if(!Number.isInteger(value.delayMs) || value.delayMs<0 || value.delayMs>2000 || value.failQueries!==undefined && typeof value.failQueries!=='boolean')throw new Error(); delayMs=value.delayMs;failQueries=value.failQueries===true;response.writeHead(200, {'Content-Type':'application/json'}).end(JSON.stringify({delayMs,delayedQueries,failQueries}));} catch {response.writeHead(400).end();}
  });
  await new Promise<void>(resolve => control.listen(0, '127.0.0.1', resolve));
  const proxyPort = (proxy.address() as {port:number}).port, controlPort = (control.address() as {port:number}).port;
  return { connection:'127.0.0.1:'+proxyPort, controlURL:'http://127.0.0.1:'+controlPort+'/delay', close:async()=>{for(const socket of sockets)socket.destroy(); await Promise.all([new Promise<void>(resolve=>proxy.close(()=>resolve())),new Promise<void>(resolve=>control.close(()=>resolve()))]);} };
}
