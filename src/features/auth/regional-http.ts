import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createBrotliDecompress, createGunzip, createInflate } from "node:zlib";
import { regionConfig } from "./regions";

/** 网关只访问配置的上海回源；保留证书验证，不自动重试或跟随重定向。 */
export const regionalHttpFetch: typeof fetch = async (input, init) => {
  const request = new Request(input, init);
  const target = new URL(request.url);
  if (target.origin !== regionConfig().transport || target.username || target.password) {
    throw new Error("回源地址不在部署配置内。");
  }
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(110000)]);
  signal.throwIfAborted();
  return new Promise<Response>((resolve, reject) => {
    const outgoing = (target.protocol === "https:" ? httpsRequest : httpRequest)(target, {
      method: request.method,
      headers: Object.fromEntries(request.headers),
      signal,
    }, incoming => {
      incoming.once("error", reject);
      try {
        const headers = new Headers();
        for (let index = 0; index < incoming.rawHeaders.length; index += 2) {
          headers.append(incoming.rawHeaders[index], incoming.rawHeaders[index + 1]);
        }
        const status = incoming.statusCode ?? 502;
        if (request.method === "HEAD" || [204, 205, 304].includes(status)) {
          incoming.resume();
          resolve(new Response(null, { status, headers }));
          return;
        }
        const encoding = headers.get("content-encoding")?.trim().toLowerCase();
        const decoder = encoding === "gzip" ? createGunzip() : encoding === "br" ? createBrotliDecompress() : encoding === "deflate" ? createInflate() : null;
        if (encoding && encoding !== "identity" && !decoder) throw new Error("回源响应编码不受支持。");
        if (decoder) {
          headers.delete("content-encoding");
          headers.delete("content-length");
          void pipeline(incoming, decoder).catch(error => decoder.destroy(error));
        }
        const stream = decoder ?? incoming;
        resolve(new Response(Readable.toWeb(stream) as ReadableStream<Uint8Array>, { status, headers }));
      } catch (error) {
        incoming.destroy();
        reject(error);
      }
    });
    outgoing.once("error", reject);
    if (request.body) {
      void pipeline(Readable.fromWeb(request.body as never), outgoing).catch(reject);
    } else {
      outgoing.end();
    }
  });
};
