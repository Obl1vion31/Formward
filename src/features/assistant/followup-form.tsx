"use client";
import { useRef, useState } from "react";
import { TaskGuide } from "@/components/task-guide";
import { useOrderedArrival } from "@/components/use-ordered-arrival";
import type { Followup } from "./chat-model";
import { followupQuestions, resolveSupplement, type FollowupSubmission } from "./followup";
import styles from "./chat.module.css";

type Answer = FollowupSubmission["answers"][number];
const hasAnswer = (answer?: Answer) => !!(answer?.outcome || answer?.optionIds?.length || answer?.text?.trim());

export function FollowupForm({task,busy,submit,mealGuide=false}: {
  task: Followup; busy: boolean; mealGuide?:boolean; submit: (value: FollowupSubmission) => Promise<void | boolean>;
}) {
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [index, setIndex] = useState(0);
  const questionScene = useOrderedArrival<HTMLFieldSetElement>(index, { distance: 12 });
  const [failure, setFailure] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const sending = useRef(false), heading = useRef<HTMLLegendElement>(null);
  const questions = followupQuestions(task), question = questions[index];
  const answer = answers[question.id], last = index === questions.length - 1;

  function showQuestion(next: number) {
    setIndex(next);
    setFailure("");
    requestAnimationFrame(() => heading.current?.focus({preventScroll:true}));
  }
  function choose(patch: Omit<Answer,"questionId">) {
    setFailure("");
    setAnswers(previous => ({...previous,[question.id]:{questionId:question.id,...patch}}));
  }
  async function advance(outcome?: "skipped", all = false) {
    if (busy || sending.current) return;
    const next = outcome ? {...answers,[question.id]:{questionId:question.id,outcome}} : answers;
    if (!all && !hasAnswer(next[question.id])) return;
    if (!all && !last) {
      setAnswers(next);
      showQuestion(index + 1);
      return;
    }
    const complete = questions.map(item =>
      hasAnswer(next[item.id]) ? next[item.id] : {questionId:item.id,outcome:"skipped" as const});
    const value: FollowupSubmission = {messageId:task.messageId,answers:complete,...(all?{stopFollowups:true}:{})};
    try {
      resolveSupplement(task, value);
    } catch (error) {
      setFailure(error instanceof Error ? error.message : "请核对补充内容。");
      return;
    }
    setAnswers(Object.fromEntries(complete.map(item => [item.questionId,item])));
    sending.current = true;
    setSubmitting(true);
    setFailure("");
    try {
      if (await submit(value) === false) setFailure("补充未提交。已填写的内容仍保留，可以重试。");
    } catch {
      setFailure("补充未提交。已填写的内容仍保留，可以重试。");
    } finally {
      sending.current = false;
      setSubmitting(false);
    }
  }

  const manual = !answer?.outcome && (question.multiple || !answer?.optionIds?.length);
  const options = question.options ?? [];
  const twoColumns = options.length > 1 && options.every(option => [...option.label].length <= 10);
  const canSkipAll = !last && questions.slice(index).filter(item => !hasAnswer(answers[item.id])).length +
    (hasAnswer(answer) ? 1 : 0) > 1;
  return <form className={styles.followup} data-guide-scope aria-label={"补充"+task.subject}
    onSubmit={event => {event.preventDefault(); void advance();}}>
    <fieldset disabled={busy || submitting}>
      <div className={styles.followupNavigation}>
        {index ? <button type="button" onClick={() => showQuestion(index - 1)}>‹ 上一题</button> : <span>补充信息</span>}
        {questions.length > 1 && <span>{index + 1} / {questions.length}</span>}
        {mealGuide&&<TaskGuide task="meal" video="photo" auto={!busy} steps={[
          {target:"meal-submit-answer",text:last?"点「继续」，助手会用补充的信息更新本餐。":"点「下一题」继续补充本餐。"},
          {target:"meal-answer",text:"补充这道问题。想不起来可以选「不知道」或跳过。"},
        ]}/>}
      </div>
      <fieldset ref={questionScene} data-guide-target="meal-answer" data-guide-flow>
        <legend ref={heading} tabIndex={-1}>{question.prompt}</legend>
        {options.length > 0 && <div className={styles.followupOptions} data-paired={twoColumns || undefined}>
          {options.map(option => {
            const selected = answer?.optionIds?.includes(option.id) ?? false;
            return <button key={option.id} type="button" aria-pressed={selected} onClick={() => {
              const values = answer?.optionIds ?? [];
              choose({optionIds:question.multiple
                ? selected ? values.filter(id => id !== option.id) : [...values,option.id]
                : [option.id], ...(question.multiple ? {text:answer?.text} : {})});
            }}><span className={styles.followupCheck} aria-hidden="true"/><span>{option.label}</span></button>;
          })}
        </div>}
        {question.allowText !== false && <input aria-label={question.prompt+" · 手动填写"}
          maxLength={question.binding ? 300 : 2000}
          placeholder={question.binding ? "其他设备或应用名称" : options.length ? "其他，请填写…" : "填写你的回答"}
          value={manual ? drafts[question.id] ?? answer?.text ?? "" : ""}
          onChange={event => {
            const text = event.target.value;
            setDrafts(previous => ({...previous,[question.id]:text}));
            choose({text,...(question.multiple ? {optionIds:answer?.optionIds} : {})});
          }}/>}
        <div className={styles.followupChoices}>
          <button type="button" aria-pressed={answer?.outcome === "unknown"} onClick={() => choose({outcome:"unknown"})}>
            <span className={styles.followupCheck} aria-hidden="true"/>不知道
          </button>
          <button type="button" onClick={() => void advance("skipped")}>跳过本题 <span aria-hidden="true">›</span></button>
        </div>
        {answer?.outcome === "skipped" && <p className={styles.followupSkipped}>本题已跳过</p>}
      </fieldset>
      {failure && <p role="alert">{failure}</p>}
      <div className={styles.followupActions} data-entry-footer>
        {canSkipAll && <button type="button" onClick={() => void advance(undefined,true)}>跳过全部</button>}
        <button type="submit" data-guide-target="meal-submit-answer" disabled={!hasAnswer(answer)}>
          {submitting ? "正在提交…" : last ? "继续" : "下一题"}
          {!submitting && <span aria-hidden="true"> →</span>}
        </button>
      </div>
    </fieldset>
  </form>;
}
