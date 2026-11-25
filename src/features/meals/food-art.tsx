"use client";

import Image from "next/image";
import { useState } from "react";
import type { FoodDraft } from "./model";
import type { FoodIllustration, ReferenceSnapshot } from "./reference-food";
import styles from "./reference-library.module.css";

const chicken = ["stewed-skinless", "stewed-skin", "grilled-skinless", "grilled-skin", "fried-drumstick", "raw-chicken"];
const staples = ["raw-rice", "cooked-rice", "raw-egg", "boiled-egg", "dry-noodles", "cooked-noodles", "raw-fish", "cooked-fish", "generic"];

export function personalFoodIllustration(food: FoodDraft): FoodIllustration {
  const text = food.name + " " + (food.preparation ?? "");
  if (/鸡腿|鸡小腿|棒棒腿/.test(text)) {
    if (/生重|生鸡|生的/.test(text)) return "raw-chicken";
    if (/裹粉|炸/.test(text)) return "fried-drumstick";
    if (/去皮|无皮/.test(text) && /炖/.test(text)) return "stewed-skinless";
    if (/去皮|无皮/.test(text) && /烤/.test(text)) return "grilled-skinless";
    if (/带皮|吃皮/.test(text) && /炖/.test(text)) return "stewed-skin";
    if (/带皮|吃皮/.test(text) && /烤/.test(text)) return "grilled-skin";
  }
  if (/生米|生白米|大米.*生重/.test(text)) return "raw-rice";
  if (/白米饭|白饭|熟米饭/.test(text)) return "cooked-rice";
  if (/水煮蛋|水煮鸡蛋|鸡蛋.*水煮/.test(text)) return "boiled-egg";
  if (/生鸡蛋|鸡蛋.*生重/.test(text)) return "raw-egg";
  if (/干面条/.test(text)) return "dry-noodles";
  if (/熟面条|熟意大利面/.test(text)) return "cooked-noodles";
  if (/鲷鱼|罗非鱼/.test(text) && /生|煮|煎|蒸/.test(text)) return /生/.test(text) ? "raw-fish" : "cooked-fish";
  return "generic";
}

export function FoodArt({ illustration = "generic", detail = false }: { illustration?: FoodIllustration; detail?: boolean }) {
  const [failed, setFailed] = useState<string | null>(null);
  const chickenIndex = chicken.indexOf(illustration);
  const requested = chickenIndex >= 0 ? "/images/reference-chicken.webp" : "/images/reference-staples.webp";
  const src = requested === failed ? "/images/reference-staples.webp" : requested;
  const isChicken = src.endsWith("chicken.webp");
  const rows = isChicken ? 2 : 3;
  const index = isChicken ? chickenIndex : requested === failed ? 8 : staples.indexOf(illustration);
  return <span aria-hidden="true" className={styles.art} data-food-art={detail ? "detail" : "thumbnail"}>
    {src !== failed && <Image src={src} width={isChicken ? 1536 : 1254} height={isChicken ? 1024 : 1254}
      alt="" unoptimized
      onError={() => setFailed(src)}
      style={{ width: "300%", height: rows * 100 + "%", transform: "translate(" + (-100 * (index % 3) / 3) + "%," + (-100 * Math.floor(index / 3) / rows) + "%)" }}/>}
  </span>;
}

export function ReferenceReading({ snapshot, estimated }: { snapshot: ReferenceSnapshot; estimated: boolean }) {
  const { food, portionId, edibleGrams } = snapshot;
  const portion = food.portions.find(entry => entry.id === portionId);
  return <div className={styles.savedEvidence} data-reference-evidence>
    <FoodArt illustration={food.illustration} detail/>
    <div className={styles.referenceNotes}>
      <p>{food.preparation}</p>
      {edibleGrams && <p>可食部{portion || estimated ? "约 " : " "}{portion ? Math.round(Number(edibleGrams)) : Number(edibleGrams)} g</p>}
      {portion && <p>参考份量 · {portion.label} · 1{portion.unit}约 {Number(portion.edibleGrams)} g</p>}
      <p>{food.source.dataset} · {food.source.recordId}</p>
      <a href={food.source.url} target="_blank" rel="noreferrer">查看来源</a>
    </div>
  </div>;
}
