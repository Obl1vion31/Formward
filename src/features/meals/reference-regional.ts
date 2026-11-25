import { metrics, scaled, type Nutrition } from "./model";
import type { ReferenceComponent, ReferenceFood, ReferenceSource } from "./reference-food";
import { recipeTotals } from "./reference-recipe";

const readings = (caloriesKcal: string, proteinG: string, carbsG: string, fatG: string): Nutrition => ({ caloriesKcal, proteinG, carbsG, fatG });

export const regionalFoods: readonly ReferenceFood[] = [
  {
    id: "cola-zero", version: 1, family: "cola", name: "无糖可乐",
    aliases: ["零糖可乐", "零卡可乐", "可乐无糖", "可乐零糖", "diet cola", "zero sugar cola", "coke zero"],
    state: "ready", method: "即食", preparation: "新加坡在售瓶装零卡样本 · 按实际饮用毫升计",
    illustration: "cola", basisUnit: "mL", sourceKind: "label", nutrition: readings("0", "0", "0", "0"), portions: [],
    source: {
      dataset: "新加坡在售瓶装营养标签", recordId: "FairPrice 11788366",
      title: "Coca-Cola Bottle Drink – Zero Sugar, 500 mL · Per 100 mL",
      url: "https://www.fairprice.com.sg/product/coca-cola-bottle-drink-zero-sugar-500ml-11788366",
    },
  },
  {
    id: "beef-striploin-grilled", version: 1, family: "beef-steak", name: "西冷牛排",
    aliases: ["西冷", "纽约客", "纽约客牛排", "striploin", "strip loin", "new york strip", "strip steak", "烤西冷牛排", "牛排"],
    state: "cooked", method: "烤", preparation: "Striploin · 烤熟 · 修掉外层脂肪后，计可食瘦肉与脂肪",
    illustration: "beef-cooked", nutrition: readings("223", "28.57", "0", "11.15"), portions: [],
    source: {
      dataset: "USDA FoodData Central · SR Legacy", recordId: "170239",
      title: 'Beef, loin, top loin steak, boneless, lip off, separable lean and fat, trimmed to 0" fat, all grades, cooked, grilled',
      url: "https://fdc.nal.usda.gov/food-details/170239/nutrients",
    },
  },
  {
    id: "table-salt", version: 1, family: "seasoning", name: "盐", aliases: ["食盐", "精盐", "table salt"],
    state: "ready", method: "即食", preparation: "普通食盐 · 计实际吃下的重量",
    illustration: "sugar", nutrition: readings("0", "0", "0", "0"), portions: [],
    source: {
      dataset: "USDA FoodData Central · SR Legacy", recordId: "173468", title: "Salt, table",
      url: "https://fdc.nal.usda.gov/food-details/173468/nutrients",
    },
  },
];

export function colaGlaze(cola: ReferenceFood): ReferenceFood {
  return {
    id: "cola-glaze", version: 1, family: "sauce", name: "普通可乐收汁", aliases: ["可乐收汁", "可乐汁", "cola glaze"],
    state: "cooked", method: "熟制", preparation: "参考配方假设 40 g 普通可乐收汁至 12 g，按成品汁重量计",
    illustration: "sauce", sourceKind: "estimated", portions: [],
    source: { ...cola.source, dataset: "Formward 收汁估算 · " + cola.source.dataset,
      recordId: cola.source.recordId + " · 40 g → 12 g", title: "通用含糖可乐 · 标准配方收汁假设" },
    nutrition: Object.fromEntries(metrics.map(key => [key, cola.nutrition[key] === null ? null :
      scaled(cola.nutrition[key], "40", "12")])) as Nutrition,
  };
}

type MealSpec = {
  id: string;
  name: string;
  aliases: readonly string[];
  illustration: ReferenceFood["illustration"];
  relatedDishes: readonly string[];
  components: readonly (readonly [id: string, role: ReferenceComponent["role"], grams: string, label?: string, amountBasis?: string])[];
  sourceAmounts: Readonly<Record<string, string>>;
  links: NonNullable<ReferenceFood["recipe"]>["links"];
  note: string;
};

const mealSpecs: readonly MealSpec[] = [
  {
    id: "tomato-brisket-rice", name: "番茄牛腩盖饭",
    aliases: ["番茄牛腩饭", "西红柿牛腩饭", "番茄炖牛腩配饭", "tomato beef brisket rice"],
    illustration: "tomato-brisket", relatedDishes: ["tomato-beef-brisket"],
    components: [
      ["brisket-cooked", "主菜", "90", "牛腩", "熟重 · 牛前胸可食肉"],
      ["tomato-cooked", "主菜", "70", "番茄", "熟重 · 可食部"],
      ["white-rice-cooked", "主食", "150", "白米饭", "熟重"],
      ["vegetable-oil", "酱料", "5", "食用油", "成品保留量"],
      ["soy-sauce-light", "酱料", "4", "生抽", "即食 · 淡色酱油"],
      ["table-salt", "酱料", "1", "盐", "成品保留量"],
      ["tomato-ketchup", "酱料", "8", "番茄沙司", "即食 · 甜味番茄酱"],
      ["ginger-raw", "酱料", "2", "姜", "生重原料基准"],
    ],
    sourceAmounts: { "brisket-cooked": "300 g 生重", "tomato-cooked": "500 g 生重", "potato-boiled": "300 g 生重",
      "vegetable-oil": "用量未注明", "soy-sauce-light": "15 mL", "tomato-ketchup": "30 mL",
      "table-salt": "适量", "ginger-raw": "约 15 g", "white-rice-cooked": "用量未注明" },
    links: [
      { name: "番茄炖牛肉菜谱", url: "https://china-kitchen.lkk.com.cn/kitchen/zh-cn/recipe/0/c7/05/" },
      { name: "番茄牛腩饭（含土豆的做法）", url: "https://china-kitchen.lkk.com.cn/kitchen/zh-CN/recipe/0/1c/recipe-475/" },
    ],
    note: "投料参考含土豆盖饭的原菜谱。本份按估算的成品可食量计算，牛腩用熟牛前胸肉近似，土豆按实际吃到的量选加。炖煮的出成率未知。",
  },
  {
    id: "cola-wings-rice", name: "可乐鸡翅配饭",
    aliases: ["可乐鸡翅饭", "可乐鸡翅盖饭", "cola chicken wings with rice"],
    illustration: "cola-wings", relatedDishes: ["cola-wings"],
    components: [
      ["chicken-wing-stewed", "主菜", "100", "鸡翅", "熟重 · 带皮去骨可食部"],
      ["white-rice-cooked", "主食", "150", "白米饭", "熟重"],
      ["cola-glaze", "酱料", "12", "普通可乐收汁", "成品量 · 收汁估算"],
      ["vegetable-oil", "酱料", "4", "食用油", "成品保留量"],
      ["soy-sauce-light", "酱料", "4", "生抽", "即食 · 淡色酱油"],
      ["ginger-raw", "酱料", "2", "姜", "生重原料基准"],
      ["table-salt", "酱料", "1", "盐", "成品保留量"],
    ],
    sourceAmounts: { "chicken-wing-stewed": "750 g 带骨生重", "cola-glaze": "500 mL 普通可乐",
      "vegetable-oil": "25 mL 花生油", "soy-sauce-light": "5 mL 酱油", "ginger-raw": "5 g 生重",
      "table-salt": "4 g" },
    links: [
      { name: "中国家常可乐鸡翅菜谱", url: "https://china-kitchen.lkk.com.cn/kitchen/zh-CN/recipe/0/c7/30/" },
      { name: "苏泊尔可乐鸡翅与收汁做法", url: "https://www.supor.com.cn/other/dishesinfo/1461/4584.html" },
    ],
    note: "投料参考家常鸡翅的原菜谱。配方假设 40 g 普通可乐收汁后约 12 g，按原可乐的营养保留估算。锅中投油量与吃下的油量分开计。",
  },
];

export function recipeRelatedDishIds(id: string) {
  return mealSpecs.find(spec => spec.id === id)?.relatedDishes ?? [];
}

export function buildReferenceMeals(foods: readonly ReferenceFood[]): ReferenceFood[] {
  const byId = new Map(foods.map(food => [food.id, food]));
  function ingredient(id: string) {
    const food = byId.get(id);
    if (!food || food.basisUnit || food.components) throw Error("Invalid reference meal component: " + id);
    return food;
  }
  return mealSpecs.map(spec => {
    const components = spec.components.map(([id, role, grams, label, amountBasis]) => ({
      food: ingredient(id), role, grams, label, amountBasis,
    }));
    const totals = recipeTotals(components.map(part => ({ ...part, estimated: true })));
    const nutrition = Object.fromEntries(metrics.map(key => [key, totals.nutrition[key] === null ? null :
      scaled(totals.nutrition[key], "100", totals.grams)])) as Nutrition;
    const source: ReferenceSource = {
      dataset: "Formward 标准配方", recordId: spec.id + " v2",
      title: spec.name + " · 家常配方参考", url: spec.links[0].url,
    };
    return {
      id: spec.id, name: spec.name, family: "chinese-meal", aliases: spec.aliases, illustration: spec.illustration,
      version: 2, state: "cooked", method: "熟制", source, sourceKind: "estimated", nutrition, components,
      recipe: { note: spec.note, links: spec.links, sourceAmounts: spec.sourceAmounts,
        suggestedFoods: ["potato-boiled", "broccoli-cooked", "tofu-firm"].map(ingredient) },
      preparation: "整餐 · 家常参考配方",
      portions: [{ id: "meal-serving", unit: "份", edibleGrams: totals.grams, label: "标准搭配整份可食量", source }],
    };
  });
}
