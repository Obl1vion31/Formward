"use client";
import { searchFoodPresets } from "./food-presets";
import type { FoodDraft, FoodView } from "./model";
import styles from "./meals.module.css";
export function FoodPresets({query,foods,adopt}:{query:string;foods:FoodView[];adopt:(draft:FoodDraft)=>void}) {
 const rows=searchFoodPresets(query).filter(p=>!foods.some(f=>!f.deletedAt&&f.name===p.name&&f.preparation===p.preparation));
 return rows.length?<section className={styles.presetList}><h2>基础食材</h2><p className={styles.hint}>参考成分表，不含额外油酱。核对部位与生熟状态后加入自己的食材库。</p>{rows.map(f=><div className={styles.foodRow} key={f.name}><div><strong>{f.name}</strong><p>{f.preparation} · 每100g</p><a href={f.evidenceUrl??undefined} target="_blank" rel="noreferrer">USDA 来源 ↗</a></div><button onClick={()=>adopt(f)}>采用</button></div>)}</section>:null;
}
