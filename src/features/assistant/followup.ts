import { z } from "zod";
import { ApiError } from "../auth/ai-identity";
import type { Followup } from "./chat-model";
import { validateDeviceLabel } from "../measurements/source-label";

export const followupQuestionSchema = z.object({
  id: z.string().regex(/^[a-zA-Z0-9_-]{1,40}$/), prompt: z.string().trim().min(1).max(300),
  options: z.array(z.object({ id: z.string().regex(/^[a-zA-Z0-9_-]{1,40}$/), label: z.string().trim().min(1).max(300) }).strict()).max(8).optional(),
  binding: z.object({ kind: z.literal("measurement_source"), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), period: z.enum(["daytime", "evening"]) }).strict().optional(),
  allowText: z.boolean().optional(), optional: z.boolean().optional(), multiple: z.boolean().optional(),
}).strict();
export type FollowupQuestion = z.infer<typeof followupQuestionSchema>;
export const followupQuestionsSchema = z.array(followupQuestionSchema).min(1).max(4).superRefine((questions,ctx)=>{
  if(new Set(questions.map(q=>q.id)).size!==questions.length)ctx.addIssue({code:"custom",message:"问题编号不能重复。"});
  for(const q of questions){if(!q.optional&&q.allowText===false&&!q.options?.length)ctx.addIssue({code:"custom",message:"必填问题必须提供选项或自由填写。"});}
  for(const q of questions)if(q.options&&new Set(q.options.map(o=>o.id)).size!==q.options.length)ctx.addIssue({code:"custom",message:"选项编号不能重复。"});
});
export const followupSubmissionSchema = z.object({
  messageId: z.string().uuid(),
  answers: z.array(z.object({ questionId:z.string().max(40), optionIds:z.array(z.string().max(40)).max(8).optional(), text:z.string().trim().max(2000).optional(), skipped:z.boolean().optional() }).strict()).min(1).max(4),
}).strict();
export type FollowupSubmission = z.infer<typeof followupSubmissionSchema>;
export type ResolvedSupplement = { taskMessageId: string; answers: { questionId: string; prompt: string; optionIds: string[]; text: string; value: string | null; skipped: boolean; binding?: FollowupQuestion["binding"] }[] };
export function resolveSupplement(followup: Followup | null, submission: FollowupSubmission): ResolvedSupplement {
  followupText(followup, submission);
  return { taskMessageId: submission.messageId, answers: followupQuestions(followup!).map(question => {
    const answer = submission.answers.find(answer => answer.questionId === question.id)!;
    const labels = (answer.optionIds ?? []).map(id => question.options!.find(option => option.id === id)!.label);
    const text = answer.text?.trim() ?? "", value = answer.skipped ? null : [...labels, ...(text ? [text] : [])].join("；");
    if (question.binding && value !== null) validateDeviceLabel(value);
    return { questionId: question.id, prompt: question.prompt, optionIds: answer.optionIds ?? [], text, value, skipped: !!answer.skipped, ...(question.binding ? { binding: question.binding } : {}) };
  }) };
}
export function followupQuestions(followup:Followup):FollowupQuestion[]{
  return followup.questions?.length?followup.questions:[{id:"answer",prompt:followup.question,allowText:true}];
}
/** 补充须在服务器当前任务下解析，不接受客户端自带的问题或选项文案。 */
export function followupText(followup:Followup|null,submission:FollowupSubmission):string{
  const invalid=()=>new ApiError(409,"followup_changed","补充任务已变化，请重新读取后再提交。已填写的内容仍保留。");
  if(!followup||followup.messageId!==submission.messageId)throw invalid();
  const questions=followupQuestions(followup),answers=new Map(submission.answers.map(a=>[a.questionId,a]));
  if(answers.size!==submission.answers.length||submission.answers.some(a=>!questions.some(q=>q.id===a.questionId)))throw invalid();
  return "补充「"+followup.subject+"」：\n"+questions.map(q=>{
    const a=answers.get(q.id);if(!a)throw invalid();
    const ids=a.optionIds??[],text=a.text?.trim()??"";
    if(a.skipped){if(!q.optional||ids.length||text)throw invalid();return q.prompt+"：暂不填写";}
    if(new Set(ids).size!==ids.length||!q.multiple&&ids.length>1||ids.some(id=>!q.options?.some(o=>o.id===id))||text&&q.allowText===false||!q.multiple&&ids.length>0&&!!text)throw invalid();
    const values=[...ids.map(id=>q.options!.find(o=>o.id===id)!.label),...(text?[text]:[])];
    if(!values.length)throw new ApiError(400,"followup_required","请回答「"+q.prompt+"」"+(q.optional?"，或选择暂不填写。":"。"));
    return q.prompt+"："+values.join("；");
  }).join("\n");
}

/** 同一补充链保留已确认字段；新话题没有前驱，不继承旧任务答案。 */
export function mergeSupplements(previous:ResolvedSupplement|null|undefined,current:ResolvedSupplement):ResolvedSupplement{
 if(!previous)return current;
 const key=(answer:ResolvedSupplement["answers"][number])=>answer.binding?JSON.stringify(answer.binding):"question:"+answer.questionId;
 const replacements=new Set(current.answers.map(key));
 return {taskMessageId:previous.taskMessageId,answers:[...previous.answers.filter(answer=>!replacements.has(key(answer))),...current.answers]};
}
