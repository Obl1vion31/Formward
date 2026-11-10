import { defineAppConfig } from '@doubao-dev/framework/config';
import { readFileSync } from 'node:fs';

// 配置在构建时读取唯一的 AppID，客户端仍从宿主运行时取得 appId。
const appId = /^app_key:\s*([A-Za-z0-9_-]+)\s*$/m.exec(readFileSync(new URL('../manifest.yaml', import.meta.url), 'utf8'))?.[1];
if (!appId) throw new Error('manifest.yaml 缺少有效 app_key。');

export default defineAppConfig({
  appId,
  name: 'Formward',
  darkMode: true,
  pages: ['pages/home/index'],
  widgets: []
});
