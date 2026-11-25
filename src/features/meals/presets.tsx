"use client";
import {RecordRowAction} from "@/components/daily-records";
import {Fragment,useId,useState,type DragEventHandler} from "react";
import { foodSpecification, formatNutrition, metricLabels, metrics, sourceLabels, type FoodDraft, type FoodView } from "./model";
import { ImageGallery } from "./photos";
import { FoodArt, personalFoodIllustration } from "./food-art";
import styles from "./meals.module.css";
import picker from "./meal-editor.module.css";
import { MealItemDetails } from "./meal-item-details";
import { editorUnit, MealEntryReadings, MealInfoIcon, nutrientUnit } from "./meal-entry-readings";

function foodPortion(food: FoodDraft) {
  const unit = editorUnit(food.unit);
  const reference = `${Number(food.baseQuantity)} ${unit}`;
  const serving = food.servingQuantity && food.servingUnit ? `1 ${editorUnit(food.servingUnit)}` : null;
  const usesServing = serving !== null && Number(food.servingQuantity) === Number(food.baseQuantity);
  return {
    basis: usesServing ? `每 ${serving}，${reference}` : `每 ${reference}`,
    conversion: serving && !usesServing ? `${serving} = ${Number(food.servingQuantity)} ${unit}` : null,
  };
}

export function FoodTable({ foods, edit }: { foods: FoodView[]; edit: (food: FoodView) => void }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const prefix = useId();
  return <div className={styles.foodTableViewport}>
    <table className={styles.foodTable}>
      <thead>
        <tr>
          <th scope="col">食材</th>
          <th scope="col" className={styles.amountHeading}>营养基准</th>
          {metrics.map(metric => <th scope="col" key={metric}>{metricLabels[metric]}（{nutrientUnit(metric)}）</th>)}
          <th scope="col" className={styles.actionHeading}>操作</th>
        </tr>
      </thead>
      <tbody>
        {foods.map(food => {
          const open = expanded === food.id;
          const detailsId = prefix + "-" + food.id;
          const { basis } = foodPortion(food);
          return <Fragment key={food.id}>
            <tr data-food-expanded={open || undefined}>
              <th scope="row" className={styles.rowName}>
                <div className={styles.rowTitle}>
                  <span className={styles.personalThumb}><FoodArt illustration={personalFoodIllustration(food)}/></span>
                  <strong>{food.name}</strong>
                  <small className={styles.mobileBasis}>（{basis}）</small>
                </div>
              </th>
              <td className={styles.rowAmount}>{basis}</td>
              {metrics.map(metric => {
                const value = food.nutrition[metric];
                const reading = formatNutrition(value, metric);
                const unit = nutrientUnit(metric);
                const isEnergy = metric === "caloriesKcal";
                return <td key={metric} data-food-metric={metric}
                  aria-label={`${metricLabels[metric]} ${value === null ? "未知" : reading + " " + unit}`}>
                  {!isEnergy && <small className={styles.rowMetricLabel}>
                    {metric === "proteinG" ? "蛋白" : metricLabels[metric]}{" "}
                  </small>}
                  {reading}
                  {value !== null && <small className={styles.rowMetricUnit}>{isEnergy && " "}{unit}</small>}
                </td>;
              })}
              <td className={styles.rowActions}>
                <div className={styles.foodRowActions}>
                  <RecordRowAction intent="edit" onClick={() => edit(food)}>编辑</RecordRowAction>
                  <RecordRowAction intent="view" aria-label={food.name + "详情"} aria-expanded={open}
                    aria-controls={detailsId} onClick={() => setExpanded(open ? null : food.id)}>
                    详情<DetailsChevron open={open}/>
                  </RecordRowAction>
                </div>
              </td>
            </tr>
            {open && <tr className={styles.foodExpanded} id={detailsId}>
              <td colSpan={metrics.length + 3}><FoodDetails food={food}/></td>
            </tr>}
          </Fragment>;
        })}
      </tbody>
    </table>
  </div>;
}

function FoodDetails({ food }: { food: FoodDraft }) {
  const { basis, conversion } = foodPortion(food);
  const description = [food.brand, foodSpecification(food.preparation)].filter(Boolean).join(" · ");
  return <section className={styles.foodInformation} aria-label="食材详情">
    <div className={styles.personalDetail}>
      <FoodArt illustration={personalFoodIllustration(food)} detail/>
      <div><h3>{food.name}</h3>{description && <p>{description}</p>}</div>
    </div>
    <p>{[basis, conversion, sourceLabels[food.sourceKind]].filter(Boolean).join(" · ")}</p>
    <MealEntryReadings nutrition={food.nutrition}/>
    {food.basis && <p>{food.basis}</p>}
    {food.evidenceUrl && <a href={food.evidenceUrl} target="_blank" rel="noreferrer">查看来源 ↗</a>}
    <ImageGallery ids={food.imageIds}/>
  </section>;
}

function DetailsChevron({open=false}:{open?:boolean}){return <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" style={{transform:open?"rotate(180deg)":undefined}}><path d="m4 6 4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5"/></svg>;}

export function FoodPickerCard({
  food, chosen, choose, toggle, replacing, disabled, onDragStart,
}: {
  food: FoodView;
  chosen: boolean;
  choose: () => void;
  toggle: () => void;
  replacing: boolean;
  disabled: boolean;
  onDragStart: DragEventHandler<HTMLDivElement>;
}) {
  const id = useId();
  const base = "每 " + Number(food.baseQuantity) + " " + editorUnit(food.unit);
  const calories = food.nutrition.caloriesKcal;
  const selectionLabel = (replacing ? "替换为 " : "选择 ") + food.name;

  return <div className={picker.pickerRow} data-picked={chosen || undefined} draggable={!disabled} onDragStart={onDragStart}>
    <label className={picker.pickerChoice}>
      <input className={picker.pickerCheck} type="checkbox" disabled={disabled}
        checked={chosen} aria-label={selectionLabel} onChange={replacing ? choose : toggle} />
      <span className={styles.personalThumb}><FoodArt illustration={personalFoodIllustration(food)}/></span>
      <span className={picker.pickerSummary}>
        <strong>{food.name}</strong>
        <small>{calories === null ? "热量未知" : formatNutrition(calories, "caloriesKcal") + " 千卡"}<span> · {base}</span></small>
      </span>
    </label>
    <MealItemDetails id={id} label={food.name + "规格与营养"} trigger={<MealInfoIcon/>} className={picker.iconButton}>
      <div className={styles.personalDetail}>
        <FoodArt illustration={personalFoodIllustration(food)} detail/>
        <div><h3>{food.name}</h3><p>{base}</p></div>
      </div>
      {(food.brand || food.preparation) && <p>{[food.brand, foodSpecification(food.preparation)].filter(Boolean).join(" · ")}</p>}
      <MealEntryReadings nutrition={food.nutrition}/>
    </MealItemDetails>
    <button type="button" className={picker.pickerAdd} disabled={disabled}
      aria-label={(replacing ? "替换为 " : "添加 ") + food.name} onClick={choose}>
      <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M10 3v14M3 10h14"/></svg>
    </button>
  </div>;
}
