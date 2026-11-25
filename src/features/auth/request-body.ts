/** 在拼接正文之前限制实际读取的字节数，不依赖客户端提供的 Content-Length。 */
export async function readBoundedBody(
  body: ReadableStream<Uint8Array>,
  maximum: number,
  overflow: () => Error,
): Promise<Buffer> {
  if (!Number.isSafeInteger(maximum) || maximum < 0) throw new RangeError("正文上限必须是非负整数。");
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  let complete = false;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        complete = true;
        return Buffer.concat(chunks, size);
      }
      if (value.byteLength > maximum - size) throw overflow();
      size += value.byteLength;
      chunks.push(value);
    }
  } finally {
    // 失败后的取消仅用于回收资源；底层取消失败或不结束都不能盖掉原错误。
    if (!complete) void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
