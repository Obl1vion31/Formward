import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import COS from "cos-nodejs-sdk-v5";

test("COS SDK 的上传签名、私有读取地址、列表解析与删除兼容现有存储调用", async () => {
  const requests: { method: string; url: string; type?: string; authorization?: string; body: Buffer }[] = [];
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    requests.push({ method: request.method!, url: request.url!, type: request.headers["content-type"], authorization: request.headers.authorization, body: Buffer.concat(chunks) });
    if (request.method === "GET") {
      response.setHeader("Content-Type", "application/xml");
      response.end('<ListBucketResult><IsTruncated>false</IsTruncated><Contents><Key>meal-tmp-v2/fictional/中文.png</Key><LastModified>2026-11-25T00:00:00Z</LastModified></Contents></ListBucketResult>');
    } else if (request.method === "PUT") {
      response.setHeader("ETag", '"fictional-etag"'); response.end();
    } else { response.statusCode = 204; response.end(); }
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const domain = `127.0.0.1:${address.port}`;
    const cos = new COS({ SecretId: "fictional-id", SecretKey: "fictional-key", Protocol: "http:", Domain: domain, Timeout: 2000 });
    const location = { Bucket: "fictional-1250000000", Region: "ap-shanghai" };
    const Key = "meal-tmp-v2/fictional/中文.png";
    const bytes = Buffer.from("fictional image bytes");
    await cos.putObject({ ...location, Key, Body: bytes, ContentType: "image/png" });
    const signed = new URL(cos.getObjectUrl({ ...location, Key, Sign: true, Expires: 60 }));
    assert.equal(signed.host, domain);
    assert.equal(decodeURIComponent(signed.pathname), "/" + Key);
    assert.equal(signed.searchParams.get("q-sign-algorithm"), "sha1");
    const page = await cos.getBucket({ ...location, Prefix: "meal-tmp-v2/fictional/", MaxKeys: 1000 });
    assert.equal(page.IsTruncated, "false");
    assert.equal(page.Contents[0].Key, Key);
    assert.equal(page.Contents[0].LastModified, "2026-11-25T00:00:00Z");
    await cos.deleteObject({ ...location, Key });
    assert.deepEqual(requests.map(request => request.method), ["PUT", "GET", "DELETE"]);
    assert.deepEqual(requests[0].body, bytes);
    assert.equal(requests[0].type, "image/png");
    assert.ok(requests.every(request => request.authorization?.includes("q-sign-algorithm=sha1")));
    assert.match(requests[0].authorization!, /q-header-list=[^&]*content-type/);
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
