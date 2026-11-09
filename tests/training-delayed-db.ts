import { createServer as createTcpServer, connect, type Socket } from 'node:net';
import { createServer as createHttpServer } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
/** 只用于隔离浏览器 fixture：延迟健康查询，不向应用加入测试等待或生产开关。 */
export async function delayedTrainingDatabase(upstream: string, tables = /\b(training_sessions|training_templates|training_plans|energy_days|activities|meal_items|measurements)\b/i) {
  const endpoint = new URL('tcp://' + upstream), sockets = new Set<Socket>(); let delayMs = 0, delayedQueries = 0;
  const proxy = createTcpServer(front => {
    const back = connect({ host: endpoint.hostname, port: Number(endpoint.port) }); sockets.add(front); sockets.add(back); let queue = Promise.resolve();
    front.on('data', chunk => { const wait = tables.test(chunk.toString('utf8')) ? delayMs : 0; queue = queue.then(async () => { if(wait) {delayedQueries++; await delay(wait);} if(!back.destroyed)back.write(chunk); }).catch(() => { front.destroy(); }); });
    back.on('data', chunk => { if(!front.destroyed)front.write(chunk); });
    front.on('error', () => back.destroy()); back.on('error', () => front.destroy()); front.on('close', () => { back.destroy(); sockets.delete(front); }); back.on('close', () => { front.destroy(); sockets.delete(back); });
  });
  await new Promise<void>(resolve => proxy.listen(0, '127.0.0.1', resolve));
  const control = createHttpServer(async (request, response) => {
    if(request.method !== 'POST' || request.url !== '/delay') {response.writeHead(404).end(); return;}
    const chunks: Buffer[] = []; for await (const chunk of request) chunks.push(Buffer.from(chunk));
    try {const value = JSON.parse(Buffer.concat(chunks).toString()); if(!Number.isInteger(value.delayMs) || value.delayMs<0 || value.delayMs>2000)throw new Error(); delayMs=value.delayMs; response.writeHead(200, {'Content-Type':'application/json'}).end(JSON.stringify({delayMs,delayedQueries}));} catch {response.writeHead(400).end();}
  });
  await new Promise<void>(resolve => control.listen(0, '127.0.0.1', resolve));
  const proxyPort = (proxy.address() as {port:number}).port, controlPort = (control.address() as {port:number}).port;
  return { connection:'127.0.0.1:'+proxyPort, controlURL:'http://127.0.0.1:'+controlPort+'/delay', close:async()=>{for(const socket of sockets)socket.destroy(); await Promise.all([new Promise<void>(resolve=>proxy.close(()=>resolve())),new Promise<void>(resolve=>control.close(()=>resolve()))]);} };
}
