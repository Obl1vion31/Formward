import assert from "node:assert/strict";
import { test } from "node:test";
import { ApiError } from "./ai-identity";
import { boundedSecurityJson } from "./http-security";
import { gatewayOAuthRequest } from "./regional-oauth-client";
import { readChatJson } from "../assistant/chat-request";
import { readAiJson } from "../measurements/ai-api";
import { limitedJson } from "../doubao/http";

function streamedRequest(chunks: Uint8Array[], cancel?: () => void | Promise<void>) {
  let reads = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      const chunk = chunks[reads++];
      if (chunk) controller.enqueue(chunk);
      else controller.close();
    },
    cancel,
  });
  const request = new Request("https://global.formward.top/api/auth/oauth2/token", {
    method: "POST", headers: { "Content-Type": "application/json" }, body, duplex: "half",
  } as RequestInit & { duplex: "half" });
  return { request, reads: () => reads };
}

const readers = [
  { name: "聊天", read: (request: Request) => readChatJson(request, 32), limit: 32, code: "request_too_large" },
  { name: "安全接口", read: (request: Request) => boundedSecurityJson(request, 32), limit: 32, code: "request_too_large" },
  { name: "AI 接口", read: readAiJson, limit: 65536, code: "invalid_input" },
  { name: "豆包接口", read: (request: Request) => limitedJson(request, 32), limit: 32, code: "request_too_large" },
];

for (const reader of readers) {
  test(`${reader.name}：恰好达到字节上限的分块 JSON 可读，读取后释放锁`, async () => {
    const json = '{"text":"中文"}';
    const bytes = new TextEncoder().encode(json + " ".repeat(reader.limit - Buffer.byteLength(json)));
    const input = streamedRequest([bytes.subarray(0, 10), bytes.subarray(10)]);
    assert.deepEqual(await reader.read(input.request), { text: "中文" });
    assert.equal(input.request.body?.locked, false);
  });

  test(`${reader.name}：取消流失败不覆盖超限错误，停止读取并释放锁`, async () => {
    const input = streamedRequest(
      Array.from({ length: 12 }, () => new Uint8Array(reader.limit)),
      () => Promise.reject(new Error("fictional cancellation failure")),
    );
    await assert.rejects(reader.read(input.request), (error: unknown) => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.status, 413);
      assert.equal(error.code, reader.code);
      return true;
    });
    assert.ok(input.reads() < 12);
    assert.equal(input.request.body?.locked, false);
  });

  test(`${reader.name}：底层读取失败保留原错误并释放锁`, async () => {
    const failure = new Error("fictional read failure");
    const request = new Request("https://fictional.example", {
      method: "POST", headers: { "Content-Type": "application/json" }, duplex: "half",
      body: new ReadableStream({ start(controller) { controller.error(failure); } }),
    } as RequestInit & { duplex: "half" });
    await assert.rejects(reader.read(request), error => error === failure);
    assert.equal(request.body?.locked, false);
  });

  test(`${reader.name}：底层取消不结束时仍立即返回超限错误`, { timeout: 1000 }, async () => {
    const input = streamedRequest([new Uint8Array(reader.limit + 1)], () => new Promise(() => {}));
    await assert.rejects(reader.read(input.request), (error: unknown) => error instanceof ApiError && error.status === 413);
    assert.equal(input.request.body?.locked, false);
  });
}

test("OAuth 网关在读取过程中拒绝超限正文，不联系回源且取消失败不覆盖 413", async () => {
  const input = streamedRequest(Array.from({ length: 12 }, () => new Uint8Array(65536)),
    () => Promise.reject(new Error("fictional cancellation failure")));
  let calls = 0;
  const response = await gatewayOAuthRequest(input.request, async () => {
    calls++;
    throw new Error("Oversized input must not be forwarded");
  });
  assert.equal(response.status, 413);
  assert.equal(calls, 0);
  assert.ok(input.reads() < 12);
  assert.equal(input.request.body?.locked, false);
});

test("JSON 入口保留空请求、无效格式与媒体类型的错误约定", async () => {
  const empty = () => new Request("https://fictional.example", { method: "POST", headers: { "Content-Type": "application/json" } });
  for (const reader of readers) {
    await assert.rejects(reader.read(empty()), (error: unknown) => error instanceof ApiError && error.status === 400);
    const invalid = streamedRequest([new TextEncoder().encode("{")]);
    await assert.rejects(reader.read(invalid.request), (error: unknown) => error instanceof ApiError && error.status === 400);
    assert.equal(invalid.request.body?.locked, false);
  }
  await assert.rejects(readAiJson(new Request("https://fictional.example", { method: "POST", body: "{}" })),
    (error: unknown) => error instanceof ApiError && error.status === 415);
});
