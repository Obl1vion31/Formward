import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash } from "node:crypto";
import { uploadPrivateMealPhoto } from "./photo-upload";

test("临时File在申请凭据后不可读时，仍上传读取并校验过的同一份字节", async () => {
  const previous = globalThis.fetch, calls: unknown[] = [], progress: string[] = [];
  const bytes = new Uint8Array([1, 3, 5, 7]), file = new File([bytes], "虚构照片.png", { type: "image/png" });
  try {
    globalThis.fetch = async (url, options) => {
      if (url === "https://fictional.test/upload") {
        const uploaded = (options!.body as FormData).get("file") as File;
        assert.notEqual(uploaded, file);
        assert.equal(uploaded.name, file.name);
        assert.equal(uploaded.type, file.type);
        assert.deepEqual(new Uint8Array(await uploaded.arrayBuffer()), bytes);
        return new Response(null, { status: 204 });
      }
      const body = JSON.parse(String(options!.body)); calls.push(body);
      if (body.step === "prepare") {
        assert.equal(body.file.sha256, createHash("sha256").update(bytes).digest("hex"));
        Object.defineProperty(file, "arrayBuffer", { value: async () => { throw new DOMException("File no longer available", "NotReadableError"); } });
        return Response.json({ provider: "cos", pathname: "fictional", ticket: "fixture-ticket" });
      }
      if (body.step === "complete") return Response.json({ id: "fictional-image" });
      return Response.json({ url: "https://fictional.test/upload", fields: { key: "fictional" } });
    };
    assert.deepEqual(await uploadPrivateMealPhoto(file, label => progress.push(label)), { id: "fictional-image", notice: undefined });
    assert.equal(calls.length, 3);
    assert.deepEqual(progress, ["正在读取照片…", "正在申请上传凭据…", "正在上传照片…", "正在核对并保存原图…"]);
  } finally { globalThis.fetch = previous; }
});

test("COS拒绝保留状态、错误码和请求号，不暴露XML中的签名或对象路径，不登记失败附件", async () => {
  const previous = globalThis.fetch; let completed = false;
  try {
    globalThis.fetch = async (url, options) => {
      if (url === "https://fictional.test/upload") return new Response("<Error><Code>EntityTooSmall</Code><Message>secret-signature-and-private-path</Message><RequestId>fictional-request-id</RequestId></Error>", { status: 400 });
      const body = JSON.parse(String(options!.body));
      if (body.step === "complete") completed = true;
      return Response.json(body.step === "prepare" ? { provider: "cos", pathname: "fictional", ticket: "fixture" } : { url: "https://fictional.test/upload", fields: {} });
    };
    await assert.rejects(uploadPrivateMealPhoto(new File(["fictional"], "fixture.jpg", { type: "image/jpeg" })), error => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /HTTP 400，EntityTooSmall/);
      assert.match(error.message, /fictional-request-id/);
      assert.doesNotMatch(error.message, /secret-signature|private-path/);
      return true;
    });
    assert.equal(completed, false);
  } finally { globalThis.fetch = previous; }
});

test("文件未完整读取时不申请凭据、不上传，不把空内容当成成功", async () => {
  const previous = globalThis.fetch; let calls = 0;
  try {
    globalThis.fetch = async () => { calls++; throw Error("unexpected"); };
    const file = new File(["fixture"], "fixture.png", { type: "image/png" });
    Object.defineProperty(file, "arrayBuffer", { value: async () => new ArrayBuffer(0) });
    await assert.rejects(uploadPrivateMealPhoto(file), /照片内容未完整读取/);
    assert.equal(calls, 0);
  } finally { globalThis.fetch = previous; }
});

test("上传网络失败与服务端拒绝分别表达，不重发或complete", async () => {
  const previous = globalThis.fetch; let completed = false;
  try {
    globalThis.fetch = async (url, options) => {
      if (url === "https://fictional.test/upload") throw new DOMException("timeout", "TimeoutError");
      const body = JSON.parse(String(options!.body));
      if (body.step === "complete") completed = true;
      return Response.json(body.step === "prepare" ? { provider: "cos", pathname: "fictional", ticket: "fixture" } : { url: "https://fictional.test/upload", fields: {} });
    };
    await assert.rejects(uploadPrivateMealPhoto(new File(["fixture"], "fixture.webp", { type: "image/webp" })), /照片上传连接未完成或超时/);
    assert.equal(completed, false);
  } finally { globalThis.fetch = previous; }
});
