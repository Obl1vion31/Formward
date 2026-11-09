import assert from "node:assert/strict";
import { createServer, type RequestListener } from "node:http";
import { once } from "node:events";
import { Readable } from "node:stream";
import { gzipSync } from "node:zlib";
import { test } from "node:test";
import { regionalHttpFetch } from "./regional-http";
import { forwardRegionalRequest, verifyService } from "./regional-transport";

async function withOrigin(listener: RequestListener, work: (origin: string) => Promise<void>) {
  const previous = { ...process.env };
  const server = createServer(listener);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const origin = "http://127.0.0.1:" + address.port;
  Object.assign(process.env, { FORMWARD_ORIGIN_URL: origin, BETTER_AUTH_URL: "https://formward-ten.vercel.app", FORMWARD_GATEWAY_SECRET: "fictional-native-service-key-32-characters" });
  try { await work(origin); }
  finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    for (const key of Object.keys(process.env)) if (!(key in previous)) delete process.env[key];
    Object.assign(process.env, previous);
  }
}

test("原生回源流式提交完整正文，保留签名、Cookie、Bearer、多条Set-Cookie及解压响应", async () => {
  let calls = 0;
  await withOrigin(async (request, response) => {
    calls++;
    const headers = new Headers(Object.entries(request.headers).flatMap(([key, value]) => value === undefined ? [] : [[key, Array.isArray(value) ? value.join(",") : value]]));
    assert.ok(verifyService(headers, "POST", "/echo"));
    assert.equal(headers.get("authorization"), "Bearer fictional-access");
    assert.equal(headers.get("cookie"), "fictional-session=1");
    assert.equal(headers.get("x-formward-public-origin"), null);
    const chunks = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    response.writeHead(200, { "Content-Type": "text/plain", "Content-Encoding": "gzip", "Set-Cookie": ["one=1; Secure; HttpOnly", "two=2; Secure; HttpOnly"] });
    response.end(gzipSync(Buffer.concat(chunks)));
  }, async () => {
    const request = new Request("https://formward-ten.vercel.app/echo", { method: "POST", headers: { authorization: "Bearer fictional-access", cookie: "fictional-session=1", "x-formward-public-origin": "https://untrusted.example" }, body: Readable.toWeb(Readable.from([Buffer.from("fictional "), Buffer.from("streamed draft")])) as ReadableStream, duplex: "half" } as RequestInit);
    const response = await forwardRegionalRequest(request, regionalHttpFetch);
    assert.equal(response.status, 200);
    assert.equal(await response.text(), "fictional streamed draft");
    assert.equal(response.headers.getSetCookie().length, 2);
    assert.equal(response.headers.get("content-encoding"), null);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.equal(calls, 1);
  });
});

test("原生回源首段立即读取，取消响应关闭上游，不等待整段完成", async () => {
  let calls = 0;
  let closed!: () => void;
  const closedPromise = new Promise<void>(resolve => { closed = resolve; });
  await withOrigin((_request, response) => {
    calls++;
    response.writeHead(200, { "Content-Type": "text/event-stream" });
    response.write("data: fictional-first\n\n");
    response.once("close", closed);
  }, async origin => {
    const response = await regionalHttpFetch(origin + "/stream", { redirect: "manual" });
    const reader = response.body!.getReader();
    const first = await reader.read();
    assert.equal(new TextDecoder().decode(first.value), "data: fictional-first\n\n");
    await reader.cancel();
    await closedPromise;
    assert.equal(calls, 1);
  });
});

test("回源重定向不跟随、HEAD无正文、配置外地址拒绝且不发送请求", async () => {
  let calls = 0;
  await withOrigin((request, response) => {
    calls++;
    if (request.method === "HEAD") { response.writeHead(204); response.end(); }
    else { response.writeHead(302, { Location: "https://untrusted.example/private" }); response.end(); }
  }, async origin => {
    const response = await regionalHttpFetch(origin + "/redirect", { redirect: "manual" });
    assert.equal(response.status, 302);
    assert.equal(response.headers.get("location"), "https://untrusted.example/private");
    await response.text();
    const head = await regionalHttpFetch(origin + "/head", { method: "HEAD", redirect: "manual" });
    assert.equal(head.status, 204);
    assert.equal(head.body, null);
    await assert.rejects(regionalHttpFetch("https://untrusted.example/private"), /回源地址/);
    assert.equal(calls, 2);
  });
});

test("请求开始前和等待响应时取消均停止回源，失败不重放", async () => {
  let calls = 0;
  let received!: () => void;
  const receivedPromise = new Promise<void>(resolve => { received = resolve; });
  await withOrigin(() => { calls++; received(); }, async origin => {
    const before = new AbortController(); before.abort();
    await assert.rejects(regionalHttpFetch(origin + "/before", { signal: before.signal }), { name: "AbortError" });
    assert.equal(calls, 0);
    const controller = new AbortController();
    const request = regionalHttpFetch(origin + "/waiting", { signal: controller.signal });
    await receivedPromise;
    controller.abort();
    await assert.rejects(request, { name: "AbortError" });
    assert.equal(calls, 1);
  });
});
