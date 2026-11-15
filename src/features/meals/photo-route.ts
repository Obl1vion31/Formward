"use client";
export type PhotoRegion = "cn" | "global";
export type PhotoRoute = { region: PhotoRegion; elapsedMs: number | null };
type Routes = { defaultRegion: PhotoRegion; routes: { region: PhotoRegion; url: string }[] };
const allowedProbe = (url: string) => url === "https://blob.vercel-storage.com/" || /^https:\/\/[a-z0-9-]+\.cos\.ap-shanghai\.myqcloud\.com\/$/.test(url);
/** 每批只探测无健康内容的受控入口，不上传照片、不保存地理位置或永久选路结果。 */
export async function choosePhotoRoute(options: { region?: PhotoRegion; fetcher?: typeof fetch; timeoutMs?: number } = {}): Promise<PhotoRoute> {
  if (options.region) return { region: options.region, elapsedMs: null };
  const request = options.fetcher ?? fetch;
  const response = await request("/api/meal-images/upload", { credentials: "same-origin", cache: "no-store", signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error("上传通道暂时无法读取，请重试。");
  const routes = await response.json() as Routes;
  if (!["cn", "global"].includes(routes.defaultRegion) || !Array.isArray(routes.routes)) throw new Error("上传通道响应无效，请重试。");
  const controller=new AbortController();
  try {
    return await Promise.any(routes.routes.filter(route => ["cn", "global"].includes(route.region) && allowedProbe(route.url)).map(async route => {
      const started=performance.now();
      // 首个可达探测立即接管；no-cors 必须使用 follow（Safari 拒绝 redirect:error）。
      // 地址仅来自上述受控根地址，探测不携带凭据或用户内容。
      await request(route.url, { method: "HEAD", mode: "no-cors", credentials: "omit", cache: "no-store", signal: AbortSignal.any([controller.signal,AbortSignal.timeout(options.timeoutMs ?? 2500)]) });
      return {region:route.region,elapsedMs:performance.now()-started};
    }));
  } catch { return {region:routes.defaultRegion,elapsedMs:null}; }
  finally {controller.abort();}
}
