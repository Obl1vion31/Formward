export type LoginResultPayload = { result: boolean; code?: string };

/** 原生回调、网页回传和页面销毁共享一次结果，成功之后不补发失败。 */
export function createLoginReporter(post: (value: LoginResultPayload) => Promise<unknown>) {
  let ended: "success" | "failure" | undefined;
  let posting: Promise<void> | undefined;
  async function failure() {
    if (ended) return;
    if (posting) { await posting.catch(() => {}); if (ended) return; }
    ended = "failure";
    await post({ result: false });
  }
  async function success(code: string) {
    if (ended || posting) return false;
    posting = post({ result: true, code }).then(() => { ended = "success"; }).catch(async error => {
      posting = undefined;
      await failure().catch(() => {});
      throw error;
    });
    try { await posting; return true; }
    finally { posting = undefined; }
  }
  return { success, failure };
}
