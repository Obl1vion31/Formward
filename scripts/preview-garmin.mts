import path from "node:path";
import { fileURLToPath } from "node:url";
import { capturePersonal, GarminError, sevenDays } from "../src/features/garmin/client";
import { demoCapture, makeReport } from "../src/features/garmin/model";
import { defaultConfigPath, readPrivateConfig, servePrivateReport, writePrivateReport } from "../src/features/garmin/private-files";

const args = process.argv.slice(2);
if (args.includes("--help")) {
  console.log("用法：pnpm garmin:preview [--serve] [--demo] [--config 私有文件路径]\n默认配置：" + defaultConfigPath() + "\n只读最近七天；不连接 Formward 数据库。--serve 仅在 127.0.0.1 提供本次脱敏快照。--demo 使用明确标注的虚构数据。");
} else {
  try {
    for (let i = 0; i < args.length; i++) { if (["--serve", "--demo"].includes(args[i])) continue; if (args[i] === "--config" && args[i + 1]) { i++; continue; } throw new GarminError("arguments", "参数无效，请运行 pnpm garmin:preview --help。"); }
    const configAt = args.indexOf("--config");
    const config = args.includes("--demo") ? null : await readPrivateConfig(configAt >= 0 ? args[configAt + 1] : undefined);
    const capture = config ? await capturePersonal(config) : demoCapture(sevenDays());
    const report = makeReport(capture), root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
    const result = await writePrivateReport(root, capture, report);
    console.log(capture.mode === "demo" ? "已生成虚构演示，不是你的佳明数据。" : "最近七天已完成读取尝试，正式记录未写入。");
    console.log("只读页面：" + result.htmlPath + "\n字段与观察：" + result.reportPath + "\n脱敏样本：" + result.samplePath + "\n原始响应（私有，勿分享）：" + result.rawPath);
    if (report.issues.length) console.log(`有 ${report.issues.length} 项需核对，请查看预览；部分接口失败不会伪装成没有记录。`);
    if (args.includes("--serve")) {
      const server = await servePrivateReport(result.html); console.log("本机临时预览：" + server.url + "\n按 Ctrl+C 关闭。浏览器刷新不会再次请求佳明。");
      const stop = () => { void server.close().then(() => process.exit(0)); }; process.once("SIGINT", stop); process.once("SIGTERM", stop);
    } else if (report.issues.length) process.exitCode = 2;
  } catch (error) {
    console.error(error instanceof GarminError ? error.message : "只读预览未完成，请检查私有目录权限与本机环境后重试。");
    process.exitCode = 1;
  }
}
