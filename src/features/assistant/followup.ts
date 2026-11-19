import { z } from "zod";
import { ApiError } from "../auth/ai-identity";
import type { Followup } from "./chat-model";
import { validateDeviceLabel } from "../measurements/source-label";

export const followupQuestionSchema = z.object({
  id: z.string().regex(/^[a-zA-Z0-9_-]{1,40}$/), prompt: z.string().trim().min(1).max(300),
  fieldKey: z.string().trim().min(1).max(80).optional(),
  options: z.array(z.object({ id: z.string().regex(/^[a-zA-Z0-9_-]{1,40}$/), label: z.string().trim().min(1).max(300) }).strict()).max(8).optional(),
  binding: z.object({ kind: z.literal("measurement_source"), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), period: z.enum(["daytime", "evening"]) }).strict().optional(),
  allowText: z.boolean().optional(), optional: z.boolean().optional(), multiple: z.boolean().optional(),
}).strict();
export type FollowupQuestion = z.infer<typeof followupQuestionSchema>;

export const followupQuestionsSchema = z.array(followupQuestionSchema).min(1).max(4).superRefine((questions, ctx) => {
  if (new Set(questions.map(q => q.id)).size !== questions.length) ctx.addIssue({code:"custom",message:"问题编号不能重复。"});
  for (const q of questions) {
    if (!q.optional && q.allowText === false && !q.options?.length) ctx.addIssue({code:"custom",message:"请提供选项或自由填写。"});
    if (q.options && new Set(q.options.map(o => o.id)).size !== q.options.length) ctx.addIssue({code:"custom",message:"选项编号不能重复。"});
  }
});

const outcomeSchema = z.enum(["skipped", "unknown"]);
export const followupSubmissionSchema = z.object({
  messageId: z.string().uuid(),
  stopFollowups: z.boolean().optional(),
  answers: z.array(z.object({
    questionId: z.string().max(40), optionIds: z.array(z.string().max(40)).max(8).optional(),
    text: z.string().trim().max(2000).optional(), skipped: z.boolean().optional(), outcome: outcomeSchema.optional(),
  }).strict()).min(1).max(4),
}).strict();
export type FollowupSubmission = z.infer<typeof followupSubmissionSchema>;
export type ResolvedAnswer = {
  questionId: string; prompt: string; optionIds: string[]; text: string; value: string | null;
  skipped: boolean; outcome?: z.infer<typeof outcomeSchema>; fieldKey?: string; binding?: FollowupQuestion["binding"];
};
export type ResolvedSupplement = {
  taskMessageId: string;
  sourceAssistantMessageId?: string;
  stopFollowups?: boolean;
  answers: ResolvedAnswer[];
};

export function followupQuestions(followup: Followup): FollowupQuestion[] {
  return followup.questions?.length ? followup.questions : [{id:"answer",prompt:followup.question,allowText:true}];
}

const normalized = (value: string) => value.normalize("NFKC").replace(/[\s\p{P}]/gu, "").toLowerCase();
function scopedField(fieldKey: string | undefined, prompt: string) {
  if (fieldKey) return normalized(fieldKey);
  if (/^(?:哪[一]?餐|什么餐次|餐次|这餐是哪个餐次)[？?]*$/.test(prompt)) return "mealtype";
  if (/^(?:哪[一]?天|什么日期|日期|这餐是哪天)[？?]*$/.test(prompt)) return "mealdate";
  return "";
}

export function sameFollowupField(answer: ResolvedAnswer, next: FollowupQuestion) {
  if (answer.binding || next.binding) {
    return !!answer.binding && !!next.binding && answer.binding.kind === next.binding.kind &&
      answer.binding.date === next.binding.date && answer.binding.period === next.binding.period;
  }
  const before = scopedField(answer.fieldKey, answer.prompt), after = scopedField(next.fieldKey, next.prompt);
  if (before && after) return before === after;
  return normalized(answer.prompt) === normalized(next.prompt) || (answer.questionId !== "answer" && next.id === answer.questionId);
}
export function isUnknownFollowupText(value: string) {
  return /^(?:我)?(?:不知道|不太知道|不清楚|不太清楚|记不清|记不清楚)(?:了)?$/.test(normalized(value));
}

/** 问题和候选取服务器当前任务，客户端只提供选中的编号或原文。 */
export function resolveSupplement(followup: Followup | null, submission: FollowupSubmission): ResolvedSupplement {
  const invalid = () => new ApiError(409,"followup_changed","补充任务已变化，请重新读取后再提交。已填写的内容仍保留。");
  if (!followup || followup.messageId !== submission.messageId) throw invalid();
  const questions = followupQuestions(followup), answers = new Map(submission.answers.map(a => [a.questionId,a]));
  if (answers.size !== submission.answers.length || answers.size !== questions.length) throw invalid();
  return {
    taskMessageId: submission.messageId,
    ...(followup.assistantMessageId ? {sourceAssistantMessageId:followup.assistantMessageId} : {}),
    ...(submission.stopFollowups ? {stopFollowups:true} : {}),
    answers: questions.map(question => {
      const answer = answers.get(question.id);
      if (!answer) throw invalid();
      const optionIds = answer.optionIds ?? [], text = answer.text?.trim() ?? "";
      if (answer.skipped && (!question.optional || answer.outcome) || (answer.outcome || answer.skipped) && (optionIds.length || text)) throw invalid();
      if (new Set(optionIds).size !== optionIds.length || !question.multiple && optionIds.length > 1 ||
          optionIds.some(id => !question.options?.some(option => option.id === id)) ||
          text && question.allowText === false || !question.multiple && optionIds.length > 0 && text) throw invalid();
      const outcome = answer.outcome ?? (answer.skipped ? "skipped" : !optionIds.length && isUnknownFollowupText(text) ? "unknown" : undefined);
      const labels = optionIds.map(id => question.options!.find(option => option.id === id)!.label);
      const value = outcome ? null : [...labels, ...(text ? [text] : [])].join("；");
      if (value === "") throw new ApiError(400,"followup_required","请回答「"+question.prompt+"」，或选择跳过。");
      if (question.binding && value !== null) validateDeviceLabel(value);
      return {questionId:question.id,prompt:question.prompt,optionIds,text,value,skipped:!!outcome,
        ...(outcome && !answer.skipped ? {outcome} : {}), ...(question.fieldKey ? {fieldKey:question.fieldKey} : {}),
        ...(question.binding ? {binding:question.binding} : {})};
    }),
  };
}

export function followupText(followup: Followup | null, submission: FollowupSubmission) {
  const {answers} = resolveSupplement(followup, submission);
  return "补充「"+followup!.subject+"」：\n"+answers.map(answer =>
    answer.prompt+"："+(answer.outcome === "unknown" ? "不知道" : answer.skipped ? "暂不填写" : answer.value)).join("\n");
}

export function mergeSupplements(previous: ResolvedSupplement | null | undefined, current: ResolvedSupplement): ResolvedSupplement {
  if (!previous) return current;
  return {
    ...current,
    taskMessageId: previous.taskMessageId,
    sourceAssistantMessageId: previous.sourceAssistantMessageId ?? current.sourceAssistantMessageId,
    stopFollowups: previous.stopFollowups || current.stopFollowups,
    answers: [...previous.answers.filter(answer => !current.answers.some(next => sameFollowupField(answer, {
      id:next.questionId, prompt:next.prompt, fieldKey:next.fieldKey, binding:next.binding,
    }))), ...current.answers],
  };
}

/** 明确留空的餐次定位不能由模型代填，有对应食物的未知份量可按稿件的缺测规则提交。 */
export function applyUnansweredMealFields(name: string, args: Record<string,unknown>, supplement: ResolvedSupplement | null, mealTask?: boolean) {
  if (name !== "preview_meals" || !supplement) return args;
  const missing = supplement.answers.filter(answer => answer.skipped);
  if (!mealTask && missing.some(answer => ["mealdate","mealtype"].includes(scopedField(answer.fieldKey,answer.prompt)))) {
    throw new ApiError(400,"meal_location_unknown","日期或餐次未提供，先说明已有结果，等待用户主动补充后再生成待保存记录。");
  }
  const foods = new Set(missing.flatMap(answer => {
    const key = answer.fieldKey?.match(/^food\.amount:(.+)$/i);
    return key ? [normalized(key[1])] : [];
  }));
  if (!foods.size || !Array.isArray(args.meals)) return args;
  return {...args,meals:args.meals.map(meal => {
    if (!Array.isArray(meal?.foods)) return meal;
    return {...meal,foods:meal.foods.map((food: Record<string,unknown>) => {
      if (typeof food?.name !== "string" || !foods.has(normalized(food.name))) return food;
      const unknown = {...food,amountDecision:"unknown_accepted",sourceKind:"unknown"} as Record<string,unknown>;
      for (const key of ["quantity","unit","foodId","foodVersion","nutritionBasis","referenceQuantity",
        "caloriesKcal","caloriesKj","proteinG","carbsG","fatG","basis","evidenceUrl"]) delete unknown[key];
      return unknown;
    })};
  })};
}
