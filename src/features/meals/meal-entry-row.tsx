import { useId, type KeyboardEvent } from "react";
import { DecimalInput } from "@/components/decimal-input";
import { MealItemDetails } from "./meal-item-details";
import { FoodArt, RecipeArt, SavedRecipeParts } from "./food-art";
import type { RecipePart, ReferenceFood } from "./reference-food";
import { editorUnit, MealEntryReadings, MealInfoIcon, MealNutrientValue, nutrientUnit } from "./meal-entry-readings";
import { editorDecimal, updateEditorNutrition, type EditorItem } from "./meal-editor-state";
import { emptyNutrition, metricLabels, metrics, scaled, sourceLabels, type FoodDraft, type ItemDraft, type Nutrition } from "./model";
import styles from "./meal-editor.module.css";

type Props = {
  item: EditorItem;
  index: number;
  food: FoodDraft | undefined;
  reference?: ReferenceFood;
  recipeParts: readonly RecipePart[];
  adjustRecipe: () => void;
  nutrition: Nutrition;
  nutritionHint: string;
  blank: boolean;
  guided?: boolean;
  nutritionOpen: boolean;
  update: (next: EditorItem) => void;
  toggleNutrition: () => void;
  remove: () => void;
  replace: () => void;
};

function finishField(event: KeyboardEvent<HTMLInputElement>) {
  if (event.key !== "Enter") return;
  event.preventDefault();
  event.currentTarget.blur();
}

function NutritionTrigger() {
  return <span>营养<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor"
    strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg></span>;
}

export function MealEntryRow({
  item, index, food, reference, recipeParts, adjustRecipe, nutrition, nutritionHint, blank, guided, nutritionOpen, update, toggleNutrition, remove, replace,
}: Props) {
  const id = useId(), number = index + 1;
  const name = food?.name ?? (item.name.trim() || "第 " + number + " 项食物");
  const unit = item.unit ?? food?.unit ?? "";
  const isRecipe = Boolean(reference?.recipe);
  const packageUnits = !isRecipe && food?.servingQuantity && food.servingUnit ? [food.servingUnit, food.unit] : [];
  const raw = item.nutrition ?? emptyNutrition();
  const chosenSource = ["label", "composition_table"].includes(item.sourceKind) ? "reference" : item.sourceKind;
  const choices: [ItemDraft["sourceKind"], string][] = [["reference", sourceLabels.reference], ["estimated", "直接预估"]];
  if (item.sourceKind === "unknown") choices.push(["unknown", "未知（原记录）"]);

  function toggleManualNutrition() {
    toggleNutrition();
    if (nutritionOpen) return;
    requestAnimationFrame(() => {
      document.getElementById(id + "-nutrients")?.scrollIntoView({
        block: "nearest", inline: "nearest", behavior: "instant",
      });
    });
  }

  function changePackageUnit(next: string) {
    if (!food?.servingQuantity || unit === next) return;
    const amount = item.quantity
      ? next === food.unit ? scaled(item.quantity, food.servingQuantity, "1") : scaled(item.quantity, "1", food.servingQuantity)
      : null;
    const portion = reference?.portions.find(entry => entry.unit === next);
    update({
      ...item, unit: next, quantity: amount === null ? null : editorDecimal(amount),
      ...(item.referenceFood ? { referenceFood: { ...item.referenceFood, portionId: portion?.id } } : {}),
    });
  }

  return <li className={styles.entryRow} data-meal-row data-meal-row-key={item.editor.key} data-blank-row={blank || undefined}
    data-nutrition-basis={food ? "food_library" : "consumed_total"} data-nutrition-collapsed={!nutritionOpen || undefined}>
    <div className={food ? styles.rowName : styles.rowName + " " + styles.compactField}>
      {food ? <strong>{food.name}</strong> : <input data-meal-name data-guide-target={guided?"meal-manual-name":undefined} value={item.name}
        aria-label={blank ? "自由填写食物名称" : "食物名称 " + number} placeholder="食物名称" maxLength={200}
        onKeyDown={finishField} onChange={event => update({ ...item, name: event.target.value })}/>}
      {!blank && !item.name.trim() && <small role="status" className={styles.fieldIssue}>请填写食物名称</small>}
    </div>
    <div className={styles.quantity + (isRecipe ? "" : " " + styles.compactField)}>
      {isRecipe ? <span>{item.quantity ? Number(item.quantity) : "—"}</span> : <DecimalInput data-guide-target={guided?"meal-manual-amount":undefined} value={item.quantity ?? ""} aria-label={"数量 " + number} aria-describedby={!food ? nutritionHint : undefined}
        min={0} max={1000000} precision={2} trimTrailingZeros placeholder="数量" title={item.quantity ?? undefined} onKeyDown={finishField}
        onValue={quantity => update({ ...item, quantity: quantity || null, amountDecision: quantity ? "provided" : undefined })}/>}
    </div>
    <div className={food && !packageUnits.length ? styles.unit : styles.unit + " " + styles.compactField}>
      {food
        ? packageUnits.length ? <>
          <select aria-label={"单位 " + number} title={editorUnit(unit)} data-wide-unit={editorUnit(unit).length > 1 || undefined}
            value={unit} onChange={event => changePackageUnit(event.target.value)}>
            {packageUnits.map(value => <option key={value} value={value}>{editorUnit(value)}</option>)}
          </select>
          <svg className={styles.unitArrow} width="8" height="8" viewBox="0 0 12 12" fill="none" stroke="currentColor"
            strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m2 4 4 4 4-4"/></svg>
        </> : <span title={editorUnit(unit)}>{editorUnit(unit)}</span>
        : <input aria-label={"单位 " + number} list="meal-portion-units" placeholder="单位" maxLength={30}
          value={unit} onKeyDown={finishField} onChange={event => update({ ...item, unit: event.target.value || null })}/>}
    </div>
    <div className={styles.mobileInfo}>
      {food ? <MealItemDetails id={id + "-facts"} label={name + "的本次营养"} trigger={<NutritionTrigger/>}
        className={styles.nutritionButton} variant="attached">
        <MealEntryReadings nutrition={nutrition}/>
      </MealItemDetails> : <button type="button" className={styles.nutritionButton}
        aria-expanded={nutritionOpen} aria-controls={id + "-nutrients"}
        aria-label={(nutritionOpen ? "收起" : "展开") + name + "的营养"} onClick={toggleManualNutrition}><NutritionTrigger/></button>}
    </div>
    {!blank && (food ? <MealItemDetails id={id + "-more"} label={name + "的更多操作"}
      trigger={<><strong className={styles.menuName}>{food.name}</strong><MealInfoIcon/></>} className={styles.rowMenu}>
      {reference && (isRecipe ? <RecipeArt food={reference}/> : <FoodArt illustration={reference.illustration} detail/>)}
      <h3>{name}</h3>
      {isRecipe ? <p>{item.referenceFood?.parts ? "拆开记" : "按整份记"} · 配方估算</p>
        : <p>每 {Number(food.baseQuantity)} {editorUnit(food.unit)} · {sourceLabels[food.sourceKind]}</p>}
      {isRecipe && recipeParts.length > 0 && <details><summary>查看{reference?.recipe?.kind === "dish" ? "菜品" : "整餐"}组成</summary><SavedRecipeParts parts={recipeParts}/></details>}
      {food.basis && <p>{food.basis}</p>}
      {!item.quantity && <label className={styles.unknownAmount}>
        <input type="checkbox" checked={item.amountDecision === "unknown_accepted"}
          onChange={event => update({ ...item, amountDecision: event.target.checked ? "unknown_accepted" : undefined })}/>保留未知数量
      </label>}
      <div className={styles.sourceActions}>
        {isRecipe && <button type="button" onClick={event => {
          event.currentTarget.closest<HTMLElement>("[popover]")?.hidePopover();
          adjustRecipe();
        }}>调整{reference?.recipe?.kind === "dish" ? "菜品" : "整餐"}</button>}
        <button type="button" onClick={event => {
          event.currentTarget.closest<HTMLElement>("[popover]")?.hidePopover();
          replace();
        }}>更换食材</button>
        {food.evidenceUrl && <a href={food.evidenceUrl} target="_blank" rel="noreferrer">查看来源 ↗</a>}
      </div>
    </MealItemDetails> : <MealItemDetails id={id + "-more"} label={name + "的营养依据"}
      trigger={<><span className={styles.sourceLabel}>依据</span><MealInfoIcon/></>}
      className={styles.rowMenu} variant="choices">
      <div className={styles.sourceChoices} role="group" aria-label={"营养依据 " + number}>
        {choices.map(([value, label]) => <button key={value} type="button" aria-pressed={chosenSource === value} onClick={() => {
          if (chosenSource !== value) update({ ...item, sourceKind: value });
        }}>
          {label}
          {chosenSource === value && <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor"
            strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m3.5 8 3 3 6-6"/></svg>}
        </button>)}
      </div>
    </MealItemDetails>)}
    <button type="button" className={styles.removeButton} aria-label={"移除 " + name} title={"移除 " + name}
      onClick={remove}>
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor"
        strokeWidth="1.5" strokeLinecap="round" aria-hidden="true"><path d="m4 4 8 8m0-8-8 8"/></svg>
    </button>
    <div className={styles.rowNutrients} id={id + "-nutrients"}>
      {metrics.map(metric => <div className={styles.nutrientCell} key={metric} data-meal-nutrient={metric}>
        {food ? <>
          <span className={styles.nutrientLabel}>{metricLabels[metric]}</span>
          <MealNutrientValue value={nutrition[metric]} metric={metric}/>
        </> : <label>
          <span className={styles.nutrientLabel}>{metricLabels[metric]} <small>{nutrientUnit(metric)}</small></span>
          <span className={styles.compactField}>
            <DecimalInput value={raw[metric] ?? ""} placeholder="—" aria-label={"本次" + metricLabels[metric] + " " + number}
              aria-describedby={nutritionHint} min={0} max={1000000}
              precision={metric === "caloriesKcal" ? 0 : 1} onKeyDown={finishField}
              onValue={value => update(updateEditorNutrition(item, metric, value))}/>
          </span>
        </label>}
      </div>)}
    </div>
  </li>;
}
