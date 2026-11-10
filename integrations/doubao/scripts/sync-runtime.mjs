import {readFileSync,writeFileSync} from 'node:fs';
const root=new URL('../',import.meta.url), manifest=readFileSync(new URL('manifest.yaml',root),'utf8');
const appId=/^app_key:\s*([A-Za-z0-9_-]+)\s*$/m.exec(manifest)?.[1];
const endpoint=/^  end_point:\s*(https?:\/\/\S+)\s*$/m.exec(manifest)?.[1];
if(!appId||!endpoint)throw new Error('Manifest 缺少 AppID 或 MCP 地址。');
const url=new URL(endpoint),local=['127.0.0.1','localhost'].includes(url.hostname);
if((url.protocol!=='https:'&&!(local&&url.protocol==='http:'))||url.username||url.password||url.search||url.hash)throw new Error('业务入口必须为安全的已配置地址。');
const output='// 由 scripts/sync-runtime.mjs 从 Manifest 生成，请勿手工修改。\nexport const runtimeConfig = '+JSON.stringify({appId,apiBaseUrl:url.origin},null,2)+' as const;\n';
writeFileSync(new URL('src/config/runtime.ts',root),output);
