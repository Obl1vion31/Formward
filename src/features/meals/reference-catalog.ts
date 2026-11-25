import expansion from "./reference-expansion.json";
import { ApiError } from "../auth/ai-identity";
import type { Nutrition } from "./model";
import { buildReferenceMeals, regionalFoods } from "./reference-regional";
import type { FoodIllustration, ReferenceCatalogFood, ReferenceCatalogResult, ReferenceFamily, ReferenceFood, ReferenceFoodLink, ReferenceMealLink, ReferencePortion, ReferenceSnapshot, ReferenceSource } from "./reference-food";

const fnddsUrl = "https://www.ars.usda.gov/northeast-area/beltsville-md-bhnrc/beltsville-human-nutrition-research-center/food-surveys-research-group/docs/fndds-download-databases/";
const tfdaUrl = "https://data.gov.tw/dataset/8543";
const fndds = (recordId: string, title: string): ReferenceSource => ({ dataset: "USDA FNDDS 2021–2023", recordId, title, url: fnddsUrl });
const tfda = (recordId: string, title: string): ReferenceSource => ({ dataset: "台湾食药署食品营养成分资料集 · 2026-10-05", recordId, title, url: tfdaUrl });
const values = (caloriesKcal: string, proteinG: string, carbsG: string, fatG: string): Nutrition => ({ caloriesKcal, proteinG, carbsG, fatG });
const portion = (source: ReferenceSource, sequence: number, unit: ReferencePortion["unit"], grams: string, label: string, original: string): ReferencePortion => ({
  id: source.recordId + "-" + sequence, unit, edibleGrams: grams, label,
  source: { ...source, recordId: source.recordId + " · " + sequence, title: original },
});

function drumstick(id: string, name: string, method: "炖" | "烤" | "炸", skin: "吃皮" | "去皮",
  illustration: FoodIllustration, source: ReferenceSource, nutrition: Nutrition, grams: string): ReferenceFood {
  const preparation = method === "烤" ? "烤制 · 无酱" : method === "炸" ? "由生肉裹粉炸制 · 外层计入" : "炖制";
  return {
    id, version: 1, family: "chicken-leg", name, aliases: ["鸡腿", "鸡小腿", "棒棒腿", "drumstick"],
    state: "cooked", method, skin, preparation: preparation + " · " + skin + " · 可食部去骨",
    illustration, nutrition, source, portions: [portion(source, 3, "只", grams, "中等鸡小腿，可食部", "1 medium drumstick")],
  };
}

const riceSource = fndds("56205008", "Rice, white, cooked, no added fat");
const eggSource = fndds("31103010", "Egg, whole, boiled or poached");
const noodlesSource = fndds("56112000", "Noodles, cooked");
const pastaSource = fndds("56130000", "Pasta, cooked");

const initialFoods: readonly ReferenceFood[] = [
  drumstick("drumstick-stewed-skinless", "去皮炖鸡小腿", "炖", "去皮", "stewed-skinless", fndds("24143220", "Chicken drumstick, stewed, skin not eaten"), values("148", "23.71", "0", "5.9"), "55"),
  drumstick("drumstick-stewed-skin", "带皮炖鸡小腿", "炖", "吃皮", "stewed-skin", fndds("24143210", "Chicken drumstick, stewed, skin eaten"), values("186", "22.54", "0", "10.64"), "65"),
  drumstick("drumstick-grilled-skinless", "去皮烤鸡小腿", "烤", "去皮", "grilled-skinless", fndds("24142501", "Chicken drumstick, grilled without sauce, skin not eaten"), values("169", "23.57", "0", "7.53"), "50"),
  drumstick("drumstick-grilled-skin", "带皮烤鸡小腿", "烤", "吃皮", "grilled-skin", fndds("24142500", "Chicken drumstick, grilled without sauce, skin eaten"), values("204", "22.7", "0", "11.85"), "60"),
  drumstick("drumstick-fried-coated", "裹粉炸鸡小腿", "炸", "吃皮", "fried-drumstick", fndds("24147300", "Chicken drumstick, fried, coated, skin / coating eaten, from raw"), values("241", "19.08", "5.98", "15.07"), "85"),
  {
    id: "chicken-leg-raw-skinless", version: 1, family: "chicken-leg", name: "生鸡腿肉", aliases: ["鸡腿", "鸡腿肉", "鸡小腿", "棒棒腿", "chicken leg meat"],
    state: "raw", method: "生", skin: "去皮", preparation: "肉鸡腿肉 · 去皮去骨",
    illustration: "raw-chicken", source: tfda("I0404501", "去皮去骨雞腿(肉雞)"), nutrition: values("165", "19.8", "0", "8.9"), portions: [],
  },
  {
    id: "white-rice-cooked", version: 2, family: "rice", name: "白米饭", aliases: ["熟白米饭", "米饭", "白饭", "饭", "white rice", "cooked rice"],
    state: "cooked", method: "煮", preparation: "煮熟 · 未加油脂",
    illustration: "cooked-rice", source: riceSource, nutrition: values("129", "2.67", "27.99", "0.28"),
    portions: [portion(riceSource, 1, "杯", "158", "美制量杯，熟饭", "1 cup, cooked")],
  },
  {
    id: "white-rice-raw", version: 1, family: "rice", name: "生白米（籼米）", aliases: ["生米", "大米", "白米", "籼米", "indica rice"],
    state: "raw", method: "生", preparation: "生白籼米 · 样品平均值",
    illustration: "raw-rice", source: tfda("A05001", "秈米平均值"), nutrition: values("357", "7.8", "77.4", "0.9"), portions: [],
  },
  {
    id: "egg-boiled", version: 1, family: "egg", name: "水煮鸡蛋", aliases: ["鸡蛋", "煮蛋", "白煮蛋", "boiled egg"],
    state: "cooked", method: "煮", preparation: "水煮或汆煮全蛋 · 去壳",
    illustration: "boiled-egg", source: eggSource, nutrition: values("143", "12.4", "0.96", "9.96"),
    portions: [portion(eggSource, 1, "个", "50", "去壳全蛋", "1 egg")],
  },
  {
    id: "egg-raw", version: 1, family: "egg", name: "生鸡蛋", aliases: ["鸡蛋", "全蛋", "raw egg"],
    state: "raw", method: "生", preparation: "去壳全蛋 · 样品平均值",
    illustration: "raw-egg", source: tfda("K01001", "雞蛋平均值"), nutrition: values("135", "12.7", "1.6", "8.9"), portions: [],
  },
  {
    id: "noodles-cooked", version: 1, family: "noodles", name: "熟面条", aliases: ["面条", "面", "noodles"],
    state: "cooked", method: "煮", preparation: "熟面条通用样本 · 具体面种或配料会有差异",
    illustration: "cooked-noodles", source: noodlesSource, nutrition: values("137", "4.51", "25.01", "2.06"),
    portions: [portion(noodlesSource, 1, "杯", "160", "美制量杯，熟面条", "1 cup, cooked")],
  },
  {
    id: "pasta-cooked", version: 1, family: "noodles", name: "熟意大利面", aliases: ["意大利面", "意面", "面条", "pasta", "spaghetti"],
    state: "cooked", method: "煮", preparation: "熟意大利面 · 通用样本",
    illustration: "cooked-noodles", source: pastaSource, nutrition: values("157", "5.76", "30.68", "0.92"),
    portions: [portion(pastaSource, 1, "杯", "140", "美制量杯，熟意面", "1 cup, cooked")],
  },
  {
    id: "noodles-dry", version: 1, family: "noodles", name: "干面条", aliases: ["面条", "干面", "生面", "dry noodles"],
    state: "raw", method: "干", preparation: "干面条 · 小麦粉、盐和食用淀粉等",
    illustration: "dry-noodles", source: tfda("R2000101", "乾麵條"), nutrition: values("350", "11.6", "72.5", "1.5"), portions: [],
  },
  {
    id: "tilapia-boiled", version: 1, family: "tilapia", name: "水煮鲷鱼片", aliases: ["鱼", "鲷鱼", "罗非鱼", "台湾鲷鱼片", "tilapia"],
    state: "cooked", method: "煮", preparation: "台湾鲷鱼片 · 水煮后沥干",
    illustration: "cooked-fish", source: tfda("J0412101", "台灣鯛魚片(水煮)"), nutrition: values("130", "23.4", "1.3", "3.3"), portions: [],
  },
  {
    id: "tilapia-steamed", version: 1, family: "tilapia", name: "清蒸鲷鱼片", aliases: ["鱼", "鲷鱼", "罗非鱼", "台湾鲷鱼片", "tilapia"],
    state: "cooked", method: "蒸", preparation: "台湾鲷鱼片 · 蒸制样品含蒸汁",
    illustration: "cooked-fish", source: tfda("J0412107", "台灣鯛魚片(清蒸)"), nutrition: values("112", "19.3", "2.2", "3.3"), portions: [],
  },
  {
    id: "tilapia-pan-fried", version: 1, family: "tilapia", name: "油煎鲷鱼片", aliases: ["鱼", "鲷鱼", "罗非鱼", "台湾鲷鱼片", "tilapia"],
    state: "cooked", method: "煎", preparation: "台湾鲷鱼片 · 葵花油煎制样品",
    illustration: "cooked-fish", source: tfda("J0412102", "台灣鯛魚片(油煎)"), nutrition: values("162", "23.1", "1.9", "6.9"), portions: [],
  },
  {
    id: "tilapia-raw", version: 1, family: "tilapia", name: "生鲷鱼片", aliases: ["鱼", "鲷鱼", "罗非鱼", "台湾鲷鱼片", "tilapia"],
    state: "raw", method: "生", preparation: "台湾鲷鱼片 · 生的冷冻样品",
    illustration: "raw-fish", source: tfda("J0412002", "台灣鯛魚片(生)"), nutrition: values("110", "18.2", "2.5", "3.6"), portions: [],
  },
];

const ingredients = [...initialFoods, ...expansion as ReferenceFood[], ...regionalFoods];
const meals = buildReferenceMeals(ingredients);
const foods = [...ingredients, ...meals];
const foodsById = new Map(foods.map(food => [food.id, food]));
const mealsByIngredient = new Map<string, ReferenceMealLink[]>();
for (const meal of meals) {
  const link = { id: meal.id, version: meal.version, name: meal.name };
  for (const { food } of meal.components ?? []) {
    const links = mealsByIngredient.get(food.id) ?? [];
    links.push(link);
    mealsByIngredient.set(food.id, links);
  }
}

function catalogFood(food: ReferenceFood): ReferenceCatalogFood {
  const relatedMeals = mealsByIngredient.get(food.id);
  return relatedMeals ? { ...food, relatedMeals } : food;
}

export function referenceCatalogDetail(id: string): ReferenceCatalogResult | null {
  const food = foodsById.get(id);
  return food ? { total: foods.length, matches: 1, referenceFoods: [catalogFood(food)] } : null;
}
const retiredVersions = new Map([["drumstick-raw-edible", 1]]);
const normalize = (value: string) => value.normalize("NFKC").toLowerCase().replace(/[\s·、，,()]+/g, "");
const indexed = foods.map(food => ({
  food,
  name: normalize(food.name),
  aliases: food.aliases.map(normalize),
}));
const ingredientTerms = new Set(indexed.flatMap(({ name, aliases }) => [name, ...aliases]));
const familySummaries: NonNullable<ReferenceCatalogResult["families"]> = {};
for (const item of foods) {
  const entry = familySummaries[item.family];
  if (entry) entry.count += 1;
  else familySummaries[item.family] = {
    count: 1,
    illustration: foods.find(food => food.family === item.family && food.state !== "raw")?.illustration ?? item.illustration,
  };
}

export function referenceCatalogOverview(): ReferenceCatalogResult {
  return { total: foods.length, matches: foods.length, referenceFoods: [], families: familySummaries };
}

const methods: readonly [RegExp, ReferenceFood["method"]][] = [
  [/空气炸锅|空气炸|气炸/g, "空气炸"], [/裹粉炸|油炸|炸/g, "炸"], [/水煮|白灼|白煮|汆煮|煮/g, "煮"], [/清蒸|蒸/g, "蒸"],
  [/油煎|煎/g, "煎"], [/炖/g, "炖"], [/炙烤|烤/g, "烤"], [/油炒|炒/g, "炒"],
];

export function searchReferenceFoods(query = "", family?: ReferenceFamily, mode: "browse" | "search" = query.trim() ? "search" : "browse", offset = 0): ReferenceCatalogResult {
  if (query.length > 200) throw new ApiError(400, "invalid_input", "搜索文字过长。");
  const q = normalize(query).replace(/^(?:我)?(?:今天|昨天)?(?:刚)?(?:吃了|喝了)/, "");
  const skin = /去皮|不吃皮|无皮/.test(q) ? "去皮" : /带皮|有皮|吃皮/.test(q) ? "吃皮" : undefined;
  const withBone = /带骨|有骨|未去骨/.test(q);
  const boneless = /去骨|无骨/.test(q);
  const withoutQualifiers = q.replace(/去皮|不吃皮|无皮|带皮|有皮|吃皮|去骨|无骨/g, "");
  const weighedRaw = /生重/.test(withoutQualifiers) || withoutQualifiers.startsWith("生") && ingredientTerms.has(withoutQualifiers.slice(1)) ||
    withoutQualifiers.endsWith("生") && ingredientTerms.has(withoutQualifiers.slice(0, -1));
  const state = weighedRaw ? "raw" : /^熟|熟制|熟重|熟$/.test(withoutQualifiers) ? "cooked" : undefined;
  const allowRawChicken = state === "raw" || (!q && mode === "browse");
  const selectedMethod = methods.find(([pattern]) => withoutQualifiers.search(pattern) >= 0);
  const method = selectedMethod?.[1];
  const base = state === "raw" ? withoutQualifiers.replace(/生重|^生|生$/g, "") :
    state === "cooked" ? withoutQualifiers.replace(/熟制|熟重|^熟|熟$/g, "") : withoutQualifiers;
  const rest = selectedMethod ? base.replace(selectedMethod[0], "") : base;
  const matches = indexed.flatMap(({ food, name, aliases }) => {
    if (family && food.family !== family || withBone ||
      (food.family === "chicken-leg" && food.state === "raw" && !allowRawChicken)) return [];
    const priority = food.state === "raw" ? 0 : 1;
    if (!q) return [{ food, score: mode === "browse" ? 0 : priority }];
    // 完整名称与别名先识别，例如「生菜」和「生抽」中的字是品名的一部分。
    if (q === name) return [{ food, score: 60 + priority }];
    if (aliases.includes(q)) return [{ food, score: 50 + priority }];

    const matchesMethod = !method || food.method === method ||
      (food.method === "蒸煮" && (method === "蒸" || method === "煮"));
    if (skin && skin !== food.skin || state && state !== food.state || !matchesMethod ||
      boneless && !/去骨/.test(food.preparation)) return [];
    const names = [name, ...aliases];
    if (!rest || names.includes(rest)) return [{ food, score: 30 + priority }];
    if (names.some(value => value.startsWith(rest))) return [{ food, score: 20 + priority }];
    return names.some(value => value.includes(rest)) ? [{ food, score: 10 + priority }] : [];
  }).sort((a, b) => b.score - a.score);
  const next = offset + 40;
  return {
    total: foods.length, matches: matches.length,
    referenceFoods: matches.slice(offset, next).map(entry => catalogFood(entry.food)),
    ...(next < matches.length ? { nextOffset: next } : {}),
  };
}

export function requireCurrentReferenceFood(link: ReferenceFoodLink) {
  const food = foodsById.get(link.id);
  if (!food || food.version !== link.version) throw new ApiError(409, "version_conflict", "参考食材规格已更新，请重新搜索选择。");
  return food;
}

export function validatePreparedReferenceFood(link: ReferenceFoodLink, snapshot?: ReferenceSnapshot) {
  // 已经由服务端核对的旧预览可以按原快照确认。新请求仍须引用可选规格。
  if (retiredVersions.get(link.id) === link.version && snapshot?.food.id === link.id &&
    snapshot.food.version === link.version && snapshot.portionId === link.portionId) return;
  requireCurrentReferenceFood(link);
}
