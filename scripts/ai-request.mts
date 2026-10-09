import { readFile } from "node:fs/promises";
import { systemMeasurementTimezone } from "../src/features/measurements/timezone";
try { process.loadEnvFile(".env.ai.local"); } catch { throw new Error("请先在终端运行 pnpm ai:setup 配置接入。"); }
const [method, path, filename] = process.argv.slice(2), token = process.env.FORMWARD_AI_TOKEN, base = process.env.FORMWARD_AI_BASE_URL;
if (!base || !token || !/^fw_ai_[A-Za-z0-9_-]{43}$/.test(token)) throw new Error("AI 配置不完整。");
if (!["GET", "POST"].includes(method) || !path?.startsWith("/") || path.startsWith("//") || (method === "POST" && !filename)) throw new Error("用法：pnpm ai:request GET /measurements，或 POST /measurement-operations 私有请求.json。");
const baseURL = new URL(`${base.replace(/\/$/, "")}/api/v1/`), url = new URL(`.${path}`, baseURL);
if (baseURL.username || baseURL.password || (baseURL.protocol !== "https:" && !(baseURL.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(baseURL.hostname))) || url.origin !== baseURL.origin || !url.pathname.startsWith(baseURL.pathname)) throw new Error("API 地址无效。");
const body = filename ? await readFile(filename, "utf8") : undefined;
const response = await fetch(url, { method, redirect: "error", signal: AbortSignal.timeout(30000), headers: { Authorization: `Bearer ${token}`, "X-Formward-Timezone": systemMeasurementTimezone(), ...(body ? { "Content-Type": "application/json" } : {}) }, body });
console.log(JSON.stringify(await response.json(), null, 2));
if (!response.ok) process.exitCode = 1;
