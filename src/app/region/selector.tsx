"use client";
import { useSyncExternalStore } from "react";
const subscribe=(notify:()=>void)=>{window.addEventListener("storage",notify);return ()=>window.removeEventListener("storage",notify);};
const snapshot=()=>{try{const value=localStorage.getItem("formward-region");return value==="cn"||value==="global"?value:"";}catch{return "";}};
import styles from "./selector.module.css";
export function RegionSelector({cn,global}:{cn:string;global:string}) {
  const recent=useSyncExternalStore(subscribe,snapshot,()=>"");
  function choose(value:string){try {localStorage.setItem("formward-region",value);}catch{}}
  return <main className={styles.page}><div className={styles.content}>
    <p className={styles.brand}>FORMWARD</p><h1>选择访问地区</h1>
    <p className={styles.description}>使用同一个账号，查看同一份记录。<br/>各地区需要分别登录。</p>
    <div className={styles.choices}>{([{key:"cn",label:"国内",detail:"适合中国大陆网络",href:cn},{key:"global",label:"国际",detail:"适合海外网络",href:global}]).map(item=><a key={item.key} href={item.href} onClick={()=>choose(item.key)} className={recent===item.key?styles.recent:undefined}><span className={styles.label}>{item.label}<span aria-hidden="true">↗</span></span><span>{item.detail}</span>{recent===item.key&&<small>上次选择</small>}</a>)}</div>
    <p className={styles.note}>照片能否读取取决于照片所在地区的网络连接。</p>
  </div></main>;
}
