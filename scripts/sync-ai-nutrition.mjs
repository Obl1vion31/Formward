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
const catalog = JSON.parse(readFileSync(new URL('src/features/records/ai-tool-catalog.json',root),'utf8'));
const entityTools = new Set(['get_profile','query_measurements','query_meals','query_energy','query_training','search_foods','search_exercises']);
const toolRows = Object.entries(catalog).map(([name,purpose])=> '  '+name+':\n    description: '+JSON.stringify(purpose+(['preview_meals','preview_meal_changes','preview_record_bundle'].includes(name)?'。'+guidance.toolHint:''))+'\n    login_type: normal\n'+(name==='import_meal_images'?'    request_timeout: 120000\n':'')+'    output: '+(entityTools.has(name)?'{ kind: entities, entity_types: [formward_query_result] }':'{ kind: execution_result }')).join('\n');
manifest = manifest.replace(/^tools:\n[\s\S]*?\nentities:/m,'tools:\n'+toolRows+'\n\nentities:');
if (process.argv.includes('--check')) {
  assert.equal(current, next, '豆包Skill营养规则不同步，请运行node scripts/sync-ai-nutrition.mjs');
  assert.equal(readFileSync(manifestUrl, 'utf8'), manifest, '豆包Manifest营养规则不同步');
} else {
  writeFileSync(skillUrl, next);
  writeFileSync(manifestUrl, manifest);
}
console.info('GPT、HTTP与豆包营养规则同步检查通过');
