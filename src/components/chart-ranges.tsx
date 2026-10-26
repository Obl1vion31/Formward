"use client";
import styles from "./chart-ranges.module.css";
import type {ReactNode} from "react";
const defaults=[["7","7D"],["30","30D"],["90","90D"],["all","全部"],["custom","自定义"]];
export function ChartRanges({value,change,className,items=defaults,children}:{value:string;change:(value:string)=>void;className?:string;items?:string[][];children?:ReactNode}){return <div className={styles.ranges+" "+(className??"")} data-chart-controls aria-label="日期视角">{items.map(([key,label])=><button type="button" key={key} aria-pressed={value===key} onClick={()=>change(key)}>{label}</button>)}{children}</div>;}
