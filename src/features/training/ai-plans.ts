import { createHash } from 'node:crypto';
import { isTraining, type TrainingPlanAction, type TrainingPreview } from './ai-model';
import type { TrainingSnapshot, TrainingTemplate } from './model';
export function trainingRequestId(reviewId: string, key: string) { const hash = createHash('sha256').update(reviewId + ':' + key).digest('hex'); return hash.slice(0,8) + '-' + hash.slice(8,12) + '-4' + hash.slice(13,16) + '-a' + hash.slice(17,20) + '-' + hash.slice(20,32); }
type Item = { key: string; action: { kind: string }; excluded: boolean; persisted?: boolean; trainingSaved?: TrainingPreview };
/** 只投影本账号快照；模板先于引用它的排期，预览不写训练事实。 */
export function planTrainingItems(snapshot: TrainingSnapshot, items: Item[], reviewId: string): Record<string, TrainingPreview> {
  const state = structuredClone(snapshot), previews: Record<string, TrainingPreview> = {}, refs = new Map<string, TrainingTemplate>();
  const entries = items.filter((item): item is Item & { action: TrainingPlanAction } => isTraining(item.action));
  const targets = entries.filter(item => !item.excluded && !item.persisted && item.action.id).map(item => item.action.kind + ':' + item.action.id);
  for (const item of [...entries.filter(item => item.action.kind === 'save_training_template'), ...entries.filter(item => item.action.kind === 'schedule_training')]) {
    const action = item.action, preview: TrainingPreview = {}; previews[item.key] = preview;
    if (item.persisted && item.trainingSaved) { previews[item.key] = item.trainingSaved; const saved = item.trainingSaved.after; if(saved && 'exercises' in saved) refs.set(item.key, saved); continue; }
    if (Boolean(action.id) !== Boolean(action.version)) { preview.error = '修改已有模板或计划必须同时提供id和version。'; continue; }
    if (action.id && targets.filter(target => target === action.kind + ':' + action.id).length > 1) { preview.error = '本批次重复修改同一训练项目，请取消其中一项。'; continue; }
    const operationId = trainingRequestId(reviewId, item.key + ':write'), newId = trainingRequestId(reviewId, item.key);
    if (action.kind === 'save_training_template') {
      const before = action.id ? state.templates.find(t => t.id === action.id) : undefined;
      if (action.id && !before) { preview.error = '训练模板不存在或不属于当前账号。'; continue; }
      preview.before = before;
      preview.after = { ...action.template, id: before?.id ?? newId, version: before ? before.version + 1 : 1 };
      if (!item.persisted && before && before.version !== action.version) { preview.error = '模板已变化，请查询最新版本后修改。'; continue; }
      preview.input = before ? { kind: 'update_template', id: before.id, version: action.version!, template: action.template, operationId } : { kind: 'template', id: newId, template: action.template, operationId };
      if (!item.excluded) { refs.set(item.key, preview.after); state.templates = [...state.templates.filter(t => t.id !== preview.after!.id), preview.after]; }
    } else {
      if (Boolean(action.templateId) === Boolean(action.templateRef)) { preview.error = '请选择templateId或同批新模板templateRef，不能同时填写。'; continue; }
      const template = action.templateRef ? refs.get(action.templateRef) : state.templates.find(t => t.id === action.templateId);
      if (!template) { preview.error = '训练模板无效，或引用的同批模板已取消或需要修改。'; continue; }
      const before = action.id ? state.plans.find(p => p.id === action.id) : undefined;
      if (action.id && !before) { preview.error = '训练计划不存在或不属于当前账号。'; continue; }
      preview.before = before;
      preview.after = { id: before?.id ?? newId, templateId: template.id, date: action.date, content: { name: template.name, exercises: template.exercises }, status: 'planned', version: before ? before.version + 1 : 1 };
      if (!item.persisted && before && (before.status !== 'planned' || before.version !== action.version)) { preview.error = '计划已变化或已经完成，请查询最新版本后修改。'; continue; }
      if (!item.persisted && before && state.sessions.some(s => s.planId === before.id && (s.status === 'active' || s.status === 'paused'))) { preview.error = '这项计划正在训练中，请先完成当前训练。'; continue; }
      const duplicate = state.plans.find(p => p.status === 'planned' && p.templateId === template.id && p.date === action.date && p.id !== before?.id);
      if (duplicate) { if (before) { preview.error = '目标日期已有相同模板的计划。'; continue; } preview.after = duplicate; preview.unchanged = true; }
      preview.input = before ? { kind: 'reschedule', id: before.id, version: action.version!, templateId: template.id, date: action.date, operationId } : { kind: 'schedule', id: newId, templateId: template.id, date: action.date, operationId };
      if (!item.excluded) state.plans = [...state.plans.filter(p => p.id !== preview.after!.id), preview.after];
    }
  }
  return previews;
}
