import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { basename, join, resolve } from 'node:path';

// Parse with the installed official DevEco SDK; never log signing configuration.
const [source, destination, parser, mode] = process.argv.slice(2);
if (!source || !destination || !parser || resolve(source) === resolve(destination)) throw Error('Invalid workspace paths');
const JSON5 = createRequire(import.meta.url)(parser);
const fixtureUrl = process.env.FORMWARD_HARMONY_FIXTURE_URL;
if (fixtureUrl) {
  const target = new URL(fixtureUrl);
  if (mode !== 'debug' || basename(destination) !== 'FormwardHarmonyFixture' || target.protocol !== 'http:' ||
      target.hostname !== '127.0.0.1' || !target.port || target.pathname !== '/' || target.username || target.password || target.search || target.hash) {
    throw Error('隔离入口只能用于专用的本机 debug 工作区');
  }
}
const load = path => {
  try { return JSON5.parse(readFileSync(path, 'utf8')); }
  catch { throw Error('项目配置读取失败，请在 DevEco 中检查本机 JSON5 配置。'); }
};
const canonical = load(join(source, 'build-profile.json5'));
const previousPath = join(destination, 'build-profile.json5');
const privatePath = join(destination, 'build-profile.local.json5');
const previous = existsSync(privatePath) ? load(privatePath) : existsSync(previousPath) ? load(previousPath) : undefined;
if (previous?.app?.signingConfigs?.length) {
  canonical.app.signingConfigs = previous.app.signingConfigs;
  for (const product of canonical.app.products) {
    const local = previous.app.products?.find(value => value.name === product.name);
    if (local?.signingConfig) product.signingConfig = local.signingConfig;
  }
} else {
  for (const product of canonical.app.products) delete product.signingConfig;
}
writeFileSync(previousPath, JSON.stringify(canonical, null, 2) + '\n');
if (fixtureUrl) {
  const scope = join(destination, 'AppScope/app.json5');
  const app = load(scope);
  app.app.bundleName = 'top.formward.app.fixture';
  writeFileSync(scope, JSON.stringify(app, null, 2) + '\n');
  const path = join(destination, 'entry/src/main/ets/host/HostPolicy.ets');
  const policy = readFileSync(path, 'utf8');
  if (!policy.includes("export const ORIGIN: string = 'https://formward.top';") || !policy.includes('export const IS_FIXTURE: boolean = false;')) throw Error('隔离入口标记与源码不一致');
  writeFileSync(path, policy.replace("export const ORIGIN: string = 'https://formward.top';", "export const ORIGIN: string = '" + new URL(fixtureUrl).origin + "';")
    .replace('export const IS_FIXTURE: boolean = false;', 'export const IS_FIXTURE: boolean = true;')
    .replace(/export const PRIVACY_VERSION: string = '[^']+';/, "export const PRIVACY_VERSION: string = 'fixture-" + Date.now() + "';"));
  for (const folder of ['AppScope/resources/base/element', 'entry/src/main/resources/base/element']) {
    const path = join(destination, folder, 'string.json');
    const strings = load(path);
    for (const value of strings.string) if (value.name === 'app_name' || value.name === 'EntryAbility_label') value.value = 'Formward 测试';
    writeFileSync(path, JSON.stringify(strings, null, 2) + '\n');
  }
  console.log('隔离构建：独立包名、测试标识、本机入口。');
}
console.log('项目配置已同步；私有签名不写入源码。');
