import { z } from 'zod';
import { templateSchema, type TrainingInput, type TrainingPlan, type TrainingTemplate } from './model';
const id = z.string().uuid(), version = z.number().int().positive();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => value >= '2000-01-01' && value <= '2100-12-31' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value, '日期不正确');
export const trainingActionSchemas = [
  z.object({ kind: z.literal('save_training_template'), id: id.optional(), version: version.optional(), template: templateSchema }).strict(),
  z.object({ kind: z.literal('schedule_training'), id: id.optional(), version: version.optional(), date, templateId: id.optional(), templateRef: z.string().regex(/^[a-zA-Z0-9_-]{1,120}$/).optional() }).strict(),
] as const;
export type TrainingPlanAction = z.infer<typeof trainingActionSchemas[number]>;
export const isTraining = (action: { kind: string }): action is TrainingPlanAction => action.kind === 'save_training_template' || action.kind === 'schedule_training';
export type TrainingPreview = { before?: TrainingTemplate | TrainingPlan; after?: TrainingTemplate | TrainingPlan; input?: TrainingInput; error?: string; unchanged?: boolean };
export const trainingAiInstructions = '训练排期使用 search_exercises 查询动作库，query_training 查询本账号现有模板、计划及已完成训练。新增或修改模板使用 save_training_template，排期使用 schedule_training；新模板可以在同批以 templateRef 引用其 key。修改必须携带查询返回的 id 和 version；日期使用明确的 YYYY-MM-DD，需要时先确认用户时区和训练安排。区分模板目标和实际完成情况，未知目标为 null，不假定每个动作都按次数记录。提交只生成待网页确认预览，必须完整提供 confirmationUrl，不能声称计划已同步保存，也不能代替用户确认。confirmed 后计划才出现在同一训练日历；不把计划当作已完成训练或热量消耗。';
