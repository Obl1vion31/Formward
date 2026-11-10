export type WebViewSdk = { postMessage: (value: { data: unknown }) => Promise<unknown> };
export class DoubaoReturnError extends Error {
  constructor(public kind: "sdk" | "timeout" | "bridge") { super(kind); }
}

/** 等待宿主回传确认；迟到的完成不会改变已经报告的超时。 */
export async function notifyDoubao(sdk: WebViewSdk | undefined, data: unknown, timeoutMs = 8000) {
  if (!sdk || typeof sdk.postMessage !== "function") throw new DoubaoReturnError("sdk");
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      Promise.resolve().then(() => sdk.postMessage({ data })),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new DoubaoReturnError("timeout")), timeoutMs); }),
    ]);
  } catch (error) {
    throw error instanceof DoubaoReturnError ? error : new DoubaoReturnError("bridge");
  } finally { if (timer) clearTimeout(timer); }
}
