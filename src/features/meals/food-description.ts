import promptRules from "../records/ai-prompt-rules.json";
import type { FoodDraft } from "./model";

export const foodLibraryRules = "食材库描述独立于餐次，只记录食物本身。名称和规格写食品身份、组成、营养基准数量与单位。估算依据按组成与分量、数据来源与计算、汇总结果说明，保留各成分的估计克数／范围、可核实的换算与具体不确定项；不能用一句笼统估算代替已有分析，也不能只重复营养表四项数字。只有标签或成分表时说明来源标识、采用条目与基准即可。缺少分项数据时保持未知，不倒推或编造精确克数、热量和计算过程。禁止写用户何时吃过、何时上传、要求入库、纠错对话等个人背景；不写熟重不可直接套用、必须调整等泛化提醒或未提及食物的排除清单。实际食用日期、食量、油酱和个人备注放餐次。" + promptRules.verbatimConflictRule;

type Description = Pick<FoodDraft, "name" | "brand" | "preparation" | "basis">;
const personalContext = /(?:用户|本人|你|您)(?:在|于)?(?:20\d{2}|今天|昨天|前天|本次|这次|当时|当天)|(?:用户|本人|你|您)[^。；\n]{0,30}(?:吃了|吃过|食用过|摄入了|上传了|上传于|上传时间|喜欢吃|偏好)|(?:早前|之前|上次|今天|昨天|前天)[^。；\n]{0,8}(?:用户|你|您)|(?:本次|这次|当时|今天|昨天|前天)(?:实际)?(?:吃了|吃过|食用|摄入|上传)|(?:用户|你|您)[^。；\n]{0,16}(?:要求|希望|请求|让)[^。；\n]{0,12}(?:入库|加入食材库|添加到食材库|纠正|修改)|(?:要求|请求)(?:加入|添加到)?食材库/;
const genericReminder = /不可直接套用|不能直接套用|必须调整|必须区分|须核对|不得重复计算/;
/** 来源转录中的“用户”合法；逐字段检查真正的个人背景，不删除或改写原文。 */
export function foodDescriptionIssues(food: Description): { path: string; message: string }[] {
  return (["name", "brand", "preparation", "basis"] as const).flatMap(path => {
    const text = food[path];
    if (!text) return [];
    const reason = personalContext.test(text) ? "个人餐次或对话背景" : genericReminder.test(text) ? "泛化提醒" : null;
    return reason ? [{ path, message: `食材${path}含${reason}；请仅保留食物组成、分量、来源、计算及具体不确定项，个人食用情况放餐次备注。若用户要求原文，先说明冲突并等待选择，不擅自删改后重试。` }] : [];
  });
}
export function foodDescriptionProblem(food: Description): string | null {
  const issues = foodDescriptionIssues(food);
  return issues.length ? issues.map(issue => issue.message).join(" ") : null;
}
