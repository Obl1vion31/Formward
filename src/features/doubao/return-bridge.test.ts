import assert from "node:assert/strict";
import { test } from "node:test";
import { DoubaoReturnError, notifyDoubao } from "./return-bridge";

test("回传成功只发送原始消息，缺少 SDK、回传失败与无响应分别处理", async () => {
  const data = { type: "formward.authorization", requestId: "fictional-request", refused: true };
  const received: unknown[] = [];
  await notifyDoubao({ postMessage: async payload => { received.push(payload); } }, data);
  assert.deepEqual(received, [{ data }]);
  await assert.rejects(notifyDoubao(undefined, data), error => error instanceof DoubaoReturnError && error.kind === "sdk");
  await assert.rejects(notifyDoubao({ postMessage: async () => { throw new Error("private SDK details"); } }, data), error => error instanceof DoubaoReturnError && error.kind === "bridge" && !error.message.includes("private"));
  let finish: (() => void) | undefined;
  const pending = notifyDoubao({ postMessage: () => new Promise<void>(resolve => { finish = resolve; }) }, data, 20);
  await assert.rejects(pending, error => error instanceof DoubaoReturnError && error.kind === "timeout");
  finish!();
});
