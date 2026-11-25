import { emptyNutrition, metrics, scaled, type Nutrition } from "./model";
import type { FoodIllustration } from "./reference-art";
export type { FoodIllustration } from "./reference-art";

function family<const Id extends string>(id: Id, label: string, branch?: string) {
  return { id, label, branch };
}

export const referenceSections = [
  { id: "meat", label: "肉禽", families: [
    family("chicken-leg", "鸡腿", "鸡肉"), family("chicken-breast", "鸡胸肉", "鸡肉"), family("chicken-wing", "鸡翅", "鸡肉"),
    family("poached-chicken", "白切鸡与烧鸡", "鸡肉"),
    family("beef-steak", "牛排", "牛肉"), family("beef-shank", "牛腱", "牛肉"), family("beef-brisket", "牛腩与牛肉块", "牛肉"),
    family("pork-loin", "猪里脊", "猪肉"), family("pork-belly", "猪五花肉", "猪肉"),
    family("duck", "鸭肉", "其他禽肉"), family("lamb", "羊排", "羊肉"),
  ] },
  { id: "fish", label: "水产", families: [
    family("tilapia", "鲷鱼片", "鱼类"), family("salmon", "三文鱼", "鱼类"),
    family("tuna", "金枪鱼", "鱼类"), family("shrimp", "虾", "虾类"), family("fish-side", "小鱼干", "鱼类"),
  ] },
  { id: "staple", label: "米面主食", families: [
    family("rice", "米饭与大米", "米面"), family("congee", "白粥", "米面"), family("noodles", "面条与米粉", "米面"),
    family("mantou", "馒头", "面点"), family("toast", "吐司面包", "面点"),
    family("oats", "燕麦", "杂粮与薯类"), family("corn", "玉米", "杂粮与薯类"),
    family("potato", "土豆", "杂粮与薯类"), family("sweet-potato", "红薯", "杂粮与薯类"),
  ] },
  { id: "eggs", label: "蛋奶豆", families: [
    family("egg", "鸡蛋", "蛋类"),
    family("milk", "牛奶", "奶类"), family("yogurt", "酸奶", "奶类"), family("cheese", "奶酪", "奶类"),
    family("tofu", "豆腐", "豆制品"), family("soy-milk", "豆浆", "豆制品"), family("edamame", "毛豆", "豆制品"),
  ] },
  { id: "vegetable", label: "蔬菜菌菇", families: [
    family("spinach", "菠菜", "叶菜与花菜"), family("bok-choy", "小油菜", "叶菜与花菜"), family("lettuce", "生菜", "叶菜与花菜"),
    family("broccoli", "西兰花", "叶菜与花菜"), family("cabbage", "大白菜", "叶菜与花菜"),
    family("tomato", "番茄", "瓜茄与根茎"), family("cucumber", "黄瓜", "瓜茄与根茎"),
    family("carrot", "胡萝卜", "瓜茄与根茎"), family("pumpkin", "南瓜", "瓜茄与根茎"), family("mushroom", "菌菇", "菌菇"),
  ] },
  { id: "fruit", label: "水果", families: [
    family("apple", "苹果"), family("banana", "香蕉"), family("orange", "柑橘"),
    family("pear", "梨"), family("grape", "葡萄"), family("berries", "浆果"), family("kiwi", "猕猴桃"),
  ] },
  { id: "nut", label: "坚果种子", families: [
    family("peanut", "花生"), family("almond", "巴旦木"), family("cashew", "腰果"),
    family("walnut", "核桃"), family("sesame", "芝麻"),
  ] },
  { id: "seasoning", label: "油脂调味", families: [
    family("oil", "食用油"), family("sauce", "酱汁与酱油"), family("sugar", "糖"), family("seasoning", "盐与香辛料"),
  ] },
  { id: "drink", label: "饮品", families: [
    family("tea", "茶"), family("coffee", "咖啡"), family("juice", "果汁"), family("cola", "可乐"), family("water", "水"),
  ] },
  { id: "snack", label: "零食甜点", families: [
    family("cracker", "饼干"), family("chocolate", "巧克力"), family("chips", "薯片"), family("cake", "蛋糕"),
  ] },
  { id: "dish", label: "家常菜与外食", families: [
    family("fried-rice", "炒饭", "米面餐食"), family("dumplings", "水饺", "米面餐食"), family("wonton", "馄饨汤", "米面餐食"),
    family("beef-dish", "牛肉菜", "常见单菜"), family("tofu-dish", "豆腐菜", "常见单菜"),
    family("egg-dish", "鸡蛋菜", "常见单菜"), family("pork-dish", "猪肉菜", "常见单菜"),
    family("chicken-dish", "鸡肉菜", "常见单菜"), family("curry", "咖喱鸡", "常见单菜"),
    family("western-sides", "西式酱料", "常见单菜"),
    family("singapore-meal", "新加坡面食", "米面餐食"), family("chinese-meal", "中式盖饭与搭配", "整餐"),
  ] },
] as const;

export type ReferenceFamily = (typeof referenceSections)[number]["families"][number]["id"];

export type ReferenceSource = { dataset: string; recordId: string; title: string; url: string };
export type ReferencePortion = {
  id: string;
  unit: "只" | "个" | "杯" | "块" | "片" | "条" | "份";
  edibleGrams: string;
  label: string;
  source: ReferenceSource;
};
export type ReferenceRecipeIngredient = {
  name: string;
  edibleGrams: string;
  nutritionGrams?: string;
  source: ReferenceSource;
};
export type ReferenceFood = {
  id: string;
  version: number;
  family: ReferenceFamily;
  name: string;
  aliases: readonly string[];
  state: "raw" | "cooked" | "ready";
  method: "生" | "炖" | "烤" | "空气炸" | "炸" | "煮" | "蒸" | "蒸煮" | "煎" | "干" | "炒" | "熟制" | "即食";
  skin?: "吃皮" | "去皮";
  preparation: string;
  illustration: FoodIllustration;
  nutrition: Nutrition;
  source: ReferenceSource;
  portions: readonly ReferencePortion[];
  basisUnit?: "mL";
  sourceKind?: "composition_table" | "label" | "estimated";
  recipeIngredients?: readonly ReferenceRecipeIngredient[];
  components?: readonly ReferenceComponent[];
  recipe?: {
    note: string;
    links: readonly { name: string; url: string }[];
    suggestedFoods: readonly ReferenceFood[];
    sourceAmounts: Readonly<Record<string, string>>;
  };
};
export type ReferenceComponent = {
  food: ReferenceFood;
  role: "主菜" | "主食" | "配菜" | "酱料";
  label?: string;
  amountBasis?: string;
  grams: string;
};
export type ReferenceMealLink = Pick<ReferenceFood, "id" | "version" | "name">;
export type ReferenceCatalogFood = ReferenceFood & { relatedMeals?: readonly ReferenceMealLink[] };

export type RecipePartInput = { id: string; version: number; grams: string; estimated?: boolean };
export type ReferenceFoodLink = { id: string; version: number; portionId?: string; parts?: RecipePartInput[] };
export type RecipePart = Pick<ReferenceComponent, "food" | "label" | "amountBasis" | "grams"> & { estimated: boolean };
export type ReferenceSnapshot = {
  food: ReferenceFood;
  portionId?: string;
  edibleGrams: string | null;
  volumeMl?: string | null;
  recipeMode?: "whole" | "split";
  recipeParts?: readonly RecipePart[];
};

export type ReferenceFamilySummary = { count: number; illustration: FoodIllustration };
export type ReferenceCatalogResult = {
  total: number;
  matches: number;
  referenceFoods: ReferenceCatalogFood[];
  nextOffset?: number;
  families?: Partial<Record<ReferenceFamily, ReferenceFamilySummary>>;
};
export const referenceStateLabel = { cooked: "熟食", ready: "食用态", raw: "生重原料" } as const;

export function referenceNutrition(food: ReferenceFood, quantity: string | null, portionId?: string) {
  const portion = food.portions.find(entry => entry.id === portionId);
  const perUnit = portion?.edibleGrams ?? "1";
  const nutrition = quantity
    ? Object.fromEntries(metrics.map(key => [key, food.nutrition[key] === null ? null : scaled(food.nutrition[key], quantity, "100", perUnit)])) as Nutrition
    : emptyNutrition();
  if (food.basisUnit === "mL") return { edibleGrams: null, volumeMl: quantity, nutrition };
  const edibleGrams = quantity && portion ? scaled(quantity, perUnit, "1") : quantity;
  return { edibleGrams, nutrition };
}

export function referenceFoodName(food: ReferenceFood) {
  return food.id === "chicken-leg-raw-skinless" ? food.name + "（去皮去骨）" : food.name;
}

export function referencePortionName(quantity: string | null | undefined, unit: string | null | undefined) {
  if (quantity == null) return "份量未知";
  if (Number(quantity) === 0.5 && /^(只|个|杯|块|片|条|份)$/.test(unit ?? "")) return "半" + unit;
  return Number(quantity) + (unit === "g" || unit === "mL" ? " " + unit : unit ?? "");
}
