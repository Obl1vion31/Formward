import { readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const root = new URL('../', import.meta.url);
const guidance = JSON.parse(readFileSync(new URL('src/features/meals/ai-nutrition-guidance.json', root), 'utf8'));
const begin = '<!-- BEGIN:shared-meal-nutrition -->', end = '<!-- END:shared-meal-nutrition -->';
const block = [begin, '## 共用记餐营养规则', '', ...guidance.rules.flatMap(rule => ['- ' + rule, '']), end].join('\n');
const skillUrl = new URL('integrations/doubao/skill/SKILL.md', root);
const current = readFileSync(skillUrl, 'utf8');
let next;
if (current.includes(begin)) {
  assert(current.includes(end));
  const start = current.indexOf(begin), finish = current.indexOf(end) + end.length;
  next = current.slice(0, start) + block + current.slice(finish);
} else {
  assert(current.includes('## 意图识别与工具选择'));
  next = current.replace('## 意图识别与工具选择', block + '\n\n## 意图识别与工具选择');
}
const manifestUrl = new URL('integrations/doubao/manifest.yaml', root);
let manifest = readFileSync(manifestUrl, 'utf8');
for (const [tool, prefix] of Object.entries({preview_meal:'新增单餐待确认预览。',preview_meal_changes:'餐内局部修改，新增食物默认估算；保留其余内容。',submit_meal_operation:'食材维护或高级兼容预览。',submit_record_operation:'多领域统一待确认预览，饮食部分遵循共用规则。'})) {
  const pattern = new RegExp('(^  ' + tool + ':\n    description: )[^\n]*', 'm');
  assert(pattern.test(manifest), '缺少工具 ' + tool);
  manifest = manifest.replace(pattern, (_, lead) => lead + JSON.stringify(prefix + guidance.toolHint));
}
if (process.argv.includes('--check')) {
  assert.equal(current, next, '豆包Skill营养规则不同步，请运行node scripts/sync-ai-nutrition.mjs');
  assert.equal(readFileSync(manifestUrl, 'utf8'), manifest, '豆包Manifest营养规则不同步');
} else {
  writeFileSync(skillUrl, next);
  writeFileSync(manifestUrl, manifest);
}
console.info('GPT、HTTP与豆包营养规则同步检查通过');
