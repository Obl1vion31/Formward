import type { ProcessingRegion } from "../auth/regions";
import { regionConfig } from "../auth/regions";
import { cosProbeOrigin } from "./image-storage";

/** 地址只能来自服务端部署配置；探测不读取或创建照片。 */
export function imageUploadRoutes(defaultRegion: ProcessingRegion) {
  const routes: { region: ProcessingRegion; url: string }[] = [];
  try { routes.push({ region: "cn", url: cosProbeOrigin() }); } catch { /* 当前未配置的通道不列出。 */ }
  if (regionConfig().enabled || process.env.BLOB_READ_WRITE_TOKEN) routes.push({ region: "global", url: "https://vercel.com/api/blob" });
  return { defaultRegion, routes };
}
