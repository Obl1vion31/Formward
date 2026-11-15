"use client";
import {memo,useMemo,type ComponentPropsWithoutRef} from "react";
import Markdown,{type Components,type ExtraProps} from "react-markdown";
import remarkGfm from "remark-gfm";
import {LoadingLink} from "../../components/loading-link";
import styles from "./chat.module.css";

function AnswerTable({node,children,...props}:ComponentPropsWithoutRef<"table">&ExtraProps){
  const head=node?.children.find(child=>child.type==="element"&&child.tagName==="thead");
  const row=head?.type==="element"?head.children.find(child=>child.type==="element"&&child.tagName==="tr"):undefined;
  const wide=row?.type==="element"&&row.children.filter(child=>child.type==="element"&&child.tagName==="th").length>3;
  return <div className={styles.tableFrame} data-wide={wide||undefined}><div className={styles.tableScroll} tabIndex={0} role="region" aria-label="回答中的表格"><table {...props}>{children}</table></div>{wide&&<span className={styles.tableHint}>左右滑动查看完整表格</span>}</div>;
}
/** 原图由鉴权附件展示；回答不会自行加载模型给出的远程图片或HTML。 */
export const ChatText=memo(function ChatText({value,navigate}:{value:string;navigate?:()=>Promise<boolean>}){
  const components=useMemo<Components>(()=>({
    table:AnswerTable,
    a:({href,children})=>!href?<span>{children}</span>:href.startsWith("/dashboard")?<LoadingLink href={href} beforeNavigate={navigate}>{children}</LoadingLink>:<a href={href} target="_blank" rel="noreferrer">{children}</a>,
  }),[navigate]);
  return <div className={styles.text}><Markdown remarkPlugins={[remarkGfm]} components={components} skipHtml disallowedElements={["img"]}>{value}</Markdown></div>;
});
