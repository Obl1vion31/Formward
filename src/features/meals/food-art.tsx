"use client";

import Image from "next/image";
import { useState } from "react";
import type { FoodDraft } from "./model";
import { foodArtCell, type FoodIllustration } from "./reference-art";
import type { ReferenceSnapshot } from "./reference-food";
import styles from "./reference-library.module.css";

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
  if (/米饭|白饭/.test(text)) return "cooked-rice";
  if (/鸡胸/.test(text)) return /生重|生鸡胸|生的/.test(text) ? "chicken-breast-raw" : "chicken-breast-cooked";
  if (/西兰花|绿花菜/.test(text)) return /蒸|煮|熟/.test(text) ? "broccoli-cooked" : "broccoli";
  if (/苹果/.test(text)) return "apple";
  if (/酸奶/.test(text)) return "yogurt";
  if (/牛奶|纯牛乳/.test(text)) return "milk";
  if (/水煮蛋|水煮鸡蛋|鸡蛋.*水煮/.test(text)) return "boiled-egg";
  if (/生鸡蛋|鸡蛋.*生重/.test(text)) return "raw-egg";
  if (/干面条/.test(text)) return "dry-noodles";
  if (/熟面条|熟意大利面/.test(text)) return "cooked-noodles";
  if (/鲷鱼|罗非鱼/.test(text) && /生|煮|煎|蒸/.test(text)) return /生/.test(text) ? "raw-fish" : "cooked-fish";
  return "generic";
}

export function FoodArt({ illustration = "generic", detail = false }: { illustration?: FoodIllustration; detail?: boolean }) {
  const [failed, setFailed] = useState<readonly string[]>([]);
  const requested = foodArtCell(illustration);
  const { src, width, height, columns, rows, index } = failed.includes(requested.src) ? foodArtCell("generic") : requested;
  return <span aria-hidden="true" className={styles.art} data-food-art={detail ? "detail" : "thumbnail"}>
    {!failed.includes(src) && <Image src={src} width={width} height={height} alt="" unoptimized
      onError={() => setFailed(previous => [...previous, src])}
      style={{
        width: columns * 100 + "%", height: rows * 100 + "%",
        transform: "translate(" + (-100 * (index % columns) / columns) + "%," + (-100 * Math.floor(index / columns) / rows) + "%)",
      }}/>}
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
