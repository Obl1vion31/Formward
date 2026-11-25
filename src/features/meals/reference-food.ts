import { emptyNutrition, metrics, scaled, type Nutrition } from "./model";

export type FoodIllustration = "stewed-skinless" | "stewed-skin" | "grilled-skinless" | "grilled-skin" | "fried-drumstick" | "raw-chicken"
  | "raw-rice" | "cooked-rice" | "raw-egg" | "boiled-egg" | "dry-noodles" | "cooked-noodles" | "raw-fish" | "cooked-fish" | "generic";

export const referenceSections = [
  { id: "meat", label: "肉禽", branch: "鸡肉", families: [{ id: "chicken-leg", label: "鸡腿" }] },
  { id: "fish", label: "水产", branch: null, families: [{ id: "tilapia", label: "鲷鱼片" }] },
  { id: "staple", label: "米面主食", branch: null, families: [{ id: "rice", label: "米饭与大米" }, { id: "noodles", label: "面条" }] },
  { id: "eggs", label: "蛋奶豆", branch: null, families: [{ id: "egg", label: "鸡蛋" }] },
] as const;
export type ReferenceFamily = (typeof referenceSections)[number]["families"][number]["id"];

export type ReferenceSource = {
  dataset: string;
  recordId: string;
  title: string;
  url: string;
};
export type ReferencePortion = {
  id: string;
  unit: "只" | "个" | "杯";
  edibleGrams: string;
  label: string;
  source: ReferenceSource;
};
export type ReferenceFood = {
  id: string;
  version: number;
  family: ReferenceFamily;
  name: string;
  aliases: readonly string[];
  state: "raw" | "cooked";
  method: "生" | "炖" | "烤" | "炸" | "煮" | "蒸" | "煎" | "干";
  skin?: "吃皮" | "去皮";
  preparation: string;
  illustration: FoodIllustration;
  nutrition: Nutrition;
  source: ReferenceSource;
  portions: readonly ReferencePortion[];
};

export type ReferenceFoodLink = { id: string; version: number; portionId?: string };
export type ReferenceSnapshot = {
  food: ReferenceFood;
  portionId?: string;
  edibleGrams: string | null;
};
export type ReferenceCatalogResult = { total: number; matches: number; referenceFoods: ReferenceFood[] };

export function referenceNutrition(food: ReferenceFood, quantity: string | null, portionId?: string) {
  const portion = food.portions.find(entry => entry.id === portionId);
  const edibleGrams = quantity && portion ? scaled(quantity, portion.edibleGrams, "1") : quantity;
  const nutrition = edibleGrams
    ? Object.fromEntries(metrics.map(key => [key, food.nutrition[key] === null ? null : scaled(food.nutrition[key], edibleGrams, "100")])) as Nutrition
    : emptyNutrition();
  return { edibleGrams, nutrition };
}

export function referenceFoodName(food: ReferenceFood) {
  return food.id === "chicken-leg-raw-skinless" ? food.name + "（去皮去骨）" : food.name;
}

export function referencePortionName(quantity: string | null | undefined, unit: string | null | undefined) {
  if (quantity == null) return "份量未知";
  if (Number(quantity) === 0.5 && /^(只|个|杯)$/.test(unit ?? "")) return "半" + unit;
  return Number(quantity) + (unit === "g" ? " g" : unit ?? "");
}
