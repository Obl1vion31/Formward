import { constants, promises as fs } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { parseEnv } from "node:util";
import { randomBytes, randomUUID } from "node:crypto";
import { createServer } from "node:http";
import type { Capture, Region } from "./client";
import { GarminError, sevenDays } from "./client";
import type { Report } from "./model";
import { renderReport } from "./report";

export const defaultConfigPath = () => path.join(homedir(), ".config", "formward", "garmin-personal.env");

export async function readPrivateConfig(file = defaultConfigPath()) {
  let handle;
  try {
    handle = await fs.open(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > 32768) throw new GarminError("config", "私有配置不是有效的小型文件。");
    if (process.platform !== "win32" && ((stat.mode & 0o077) !== 0 || stat.uid !== process.getuid?.())) throw new GarminError("config_permissions", "配置文件须归当前用户所有且权限为 600；请修正权限后重试。");
    const env = parseEnv(await handle.readFile("utf8"));
    const apiKey = env.GARMIN_PERSONAL_API_KEY?.trim() ?? "", timeZone = env.GARMIN_PREVIEW_TIMEZONE?.trim() || "Asia/Shanghai", region = env.GARMIN_PERSONAL_REGION?.trim() || "global";
    if (!apiKey || apiKey === "your-personal-api-key" || /[\r\n]/.test(apiKey)) throw new GarminError("missing_key", "请在私有配置文件的 GARMIN_PERSONAL_API_KEY 引号中填入密钥并保存。");
    if (region !== "global" && region !== "china") throw new GarminError("region", "GARMIN_PERSONAL_REGION 只能填写 global 或 china。");
    sevenDays(new Date(), timeZone);
    return { apiKey, timeZone, region: region as Region };
  } catch (error) {
    if (error instanceof GarminError) throw error;
    throw new GarminError("config", "无法读取私有配置文件，请确认文件存在、格式正确且当前用户可读。");
  } finally { await handle?.close(); }
}

async function privateDirectory(root: string, directory: string) {
  const base = await fs.realpath(root), target = path.resolve(base, directory);
  await fs.mkdir(target, { recursive: true, mode: 0o700 });
  const resolved = await fs.realpath(target);
  if (resolved !== target || !resolved.startsWith(base + path.sep)) throw new GarminError("output_path", "私有输出目录不可指向项目之外或通过符号链接公开。");
  return target;
}

export async function writePrivateReport(root: string, capture: Capture, report: Report) {
  const imports = await privateDirectory(root, "data/imports"), exports = await privateDirectory(root, "data/exports");
  const name = `garmin-personal-${capture.mode}-${capture.fetchedAt.replace(/[^0-9TZ]/g, "")}-${randomUUID().slice(0, 8)}`;
  const rawPath = path.join(imports, name + ".raw.json"), reportPath = path.join(exports, name + ".report.json"), samplePath = path.join(exports, name + ".sample.json"), htmlPath = path.join(exports, name + ".html");
  const html = renderReport(report);
  // 每次使用新文件；保留来源响应原文。token 认证响应从未进入 Capture。
  for (const [file, body] of [[rawPath, JSON.stringify(capture, null, 2)], [reportPath, JSON.stringify(report, null, 2)], [samplePath, JSON.stringify(report.sample, null, 2)], [htmlPath, html]]) await fs.writeFile(file, body + "\n", { flag: "wx", mode: 0o600 });
  return { rawPath, reportPath, samplePath, htmlPath, html };
}

/** 只服务这份已生成的脱敏报告，不服务目录，不访问 API；浏览器刷新不会再次读取佳明。 */
export async function servePrivateReport(html: string, port = 0) {
  const route = "/" + randomBytes(24).toString("hex") + "/";
  const server = createServer((request, response) => {
    const address = server.address(), expectedHost = typeof address === "object" && address ? `127.0.0.1:${address.port}` : "";
    if (request.headers.host !== expectedHost || request.url !== route || (request.method !== "GET" && request.method !== "HEAD")) { response.writeHead(404, { "Cache-Control": "no-store" }); response.end(); return; }
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store, private", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff", "X-Frame-Options": "DENY", "Cross-Origin-Resource-Policy": "same-origin", "Content-Security-Policy": "frame-ancestors 'none'" });
    response.end(request.method === "HEAD" ? undefined : html);
  });
  await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(port, "127.0.0.1", () => { server.off("error", reject); resolve(); }); });
  const address = server.address(); if (!address || typeof address !== "object") throw new GarminError("server", "本机预览启动失败。");
  return { url: `http://127.0.0.1:${address.port}${route}`, close: () => new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve())) };
}
