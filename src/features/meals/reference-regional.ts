import { metrics, scaled, sumNutrition, type Nutrition } from "./model";
import { referenceNutrition, type ReferenceComponent, type ReferenceFood, type ReferenceSource } from "./reference-food";

const chineseBeef = "https://china-kitchen.lkk.com.cn/kitchen/zh-CN/recipe/0/1c/recipe-475/";
const chineseEgg = "https://china-kitchen.lkk.com.cn/kitchen/zh-CN/recipe/0/c5/49/";
const chineseWing = "https://china-kitchen.lkk.com.cn/kitchen/zh-CN/recipe/0/c7/30/";
const sgStudy = "https://www.mdpi.com/2304-8158/10/7/1659";
const steakMenu = "https://astonsprime.com.sg/";
const pastaMenu = "https://www.pastaandco.com.sg/";
const japaneseMenu = "https://www.sukiya.com.sg/menu";

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
];

type MealComponentSpec = readonly [id: string, role: ReferenceComponent["role"], grams: string];
type StudiedMeal = { kilojoules: string; protein: string; carbs: string; fat: string; grams: string; title: string; table: string };
type MealSpec = {
  id: string;
  family: "chinese-meal" | "singapore-meal" | "western-meal" | "japanese-meal";
  name: string;
  aliases: readonly string[];
  illustration: ReferenceFood["illustration"];
  menu: string;
  components: readonly MealComponentSpec[];
  sample?: StudiedMeal;
};

const mealSpecs: readonly MealSpec[] = [
  {
    id: "tomato-brisket-rice", family: "chinese-meal", name: "番茄牛腩盖饭",
    aliases: ["番茄牛腩饭", "西红柿牛腩饭", "番茄炖牛腩配饭", "tomato beef brisket rice"], illustration: "tomato-brisket-rice", menu: chineseBeef,
    components: [["tomato-beef-brisket", "主菜", "160"], ["white-rice-cooked", "主食", "150"], ["napa-cooked", "配菜", "60"]],
  },
  {
    id: "tomato-egg-rice", family: "chinese-meal", name: "番茄炒蛋饭",
    aliases: ["番茄炒蛋盖饭", "西红柿鸡蛋盖饭", "番茄炒蛋配米饭"], illustration: "tomato-eggs", menu: chineseEgg,
    components: [["tomato-scrambled-eggs", "主菜", "160"], ["white-rice-cooked", "主食", "150"]],
  },
  {
    id: "yellow-chicken-rice", family: "chinese-meal", name: "黄焖鸡米饭",
    aliases: ["黄焖鸡饭", "黄焖鸡配饭", "yellow braised chicken rice"], illustration: "yellow-chicken", menu: "https://www.ymyhmj.com/",
    components: [["yellow-braised-chicken", "主菜", "190"], ["white-rice-cooked", "主食", "150"]],
  },
  {
    id: "cola-wings-rice", family: "chinese-meal", name: "可乐鸡翅配饭",
    aliases: ["可乐鸡翅饭", "可乐鸡翅盖饭", "cola chicken wings with rice"], illustration: "cola-wings", menu: chineseWing,
    components: [["cola-wings", "主菜", "120"], ["white-rice-cooked", "主食", "150"], ["napa-cooked", "配菜", "60"]],
  },
  {
    id: "hainanese-chicken-rice", family: "singapore-meal", name: "海南鸡饭",
    aliases: ["白鸡饭", "白切鸡饭", "新加坡鸡饭", "hainanese chicken rice", "steamed chicken rice", "chicken rice"], illustration: "hainanese-chicken-rice", menu: sgStudy,
    components: [["poached-chicken", "主菜", "105"], ["chicken-oil-rice", "主食", "180"], ["cucumber-fresh", "配菜", "25"], ["chicken-rice-chili", "酱料", "15"]],
    sample: { title: "Steamed Chicken Rice", table: "Table 1", kilojoules: "789", grams: "412", protein: "9.3", carbs: "21.2", fat: "7.4" },
  },
  {
    id: "sg-roast-chicken-rice", family: "singapore-meal", name: "烧鸡饭",
    aliases: ["新加坡烧鸡饭", "烤鸡饭", "roasted chicken rice", "chicken rice"], illustration: "hainanese-chicken-rice", menu: sgStudy,
    components: [["sg-roast-chicken", "主菜", "90"], ["chicken-oil-rice", "主食", "160"], ["cucumber-fresh", "配菜", "25"], ["chicken-rice-chili", "酱料", "10"]],
    sample: { title: "Roasted Chicken Rice", table: "Table 1", kilojoules: "768", grams: "285", protein: "8.3", carbs: "23.4", fat: "6.3" },
  },
  {
    id: "nasi-lemak", family: "singapore-meal", name: "椰浆饭",
    aliases: ["新加坡椰浆饭", "椰浆饭套餐", "nasi lemak"], illustration: "nasi-lemak", menu: sgStudy,
    components: [["coconut-rice", "主食", "170"], ["egg-boiled", "配菜", "50"], ["fried-anchovies", "配菜", "20"], ["peanut-roasted", "配菜", "15"], ["cucumber-fresh", "配菜", "25"], ["sambal", "酱料", "20"]],
    sample: { title: "Nasi Lemak", table: "Table 2", kilojoules: "785", grams: "395", protein: "9.2", carbs: "17.7", fat: "9.0" },
  },
  {
    id: "ribeye-plate", family: "western-meal", name: "肉眼牛排配薯块",
    aliases: ["肉眼牛排套餐", "ribeye with potato wedges", "ribeye steak plate"], illustration: "steak-plate", menu: steakMenu,
    components: [["beef-ribeye", "主菜", "150"], ["baked-potato-wedges", "配菜", "95"], ["broccoli-cooked", "配菜", "60"]],
  },
  {
    id: "striploin-plate", family: "western-meal", name: "西冷牛排配薯块",
    aliases: ["西冷牛排套餐", "striploin with potato wedges", "striploin steak plate"], illustration: "steak-plate", menu: steakMenu,
    components: [["beef-striploin-grilled", "主菜", "150"], ["baked-potato-wedges", "配菜", "95"], ["broccoli-cooked", "配菜", "60"]],
  },
  {
    id: "beef-bolognese-pasta", family: "western-meal", name: "番茄牛肉酱意面",
    aliases: ["牛肉酱意面", "肉酱意大利面", "牛肉肉酱意面", "牛肉番茄意面", "beef bolognese", "spaghetti bolognese"], illustration: "beef-bolognese", menu: pastaMenu,
    components: [["pasta-cooked", "主食", "175"], ["tomato-beef-sauce", "主菜", "130"]],
  },
  {
    id: "gyudon", family: "japanese-meal", name: "日式牛肉饭",
    aliases: ["牛丼", "日式牛丼", "牛肉盖饭", "gyudon", "japanese beef bowl"], illustration: "gyudon", menu: japaneseMenu,
    components: [["japanese-onion-beef", "主菜", "150"], ["white-rice-cooked", "主食", "170"]],
  },
  {
    id: "japanese-chicken-curry-rice", family: "japanese-meal", name: "日式鸡肉咖喱饭",
    aliases: ["日式咖喱饭", "日式咖喱鸡饭", "日式鸡肉咖哩饭", "japanese chicken curry rice"], illustration: "japanese-curry-rice", menu: japaneseMenu,
    components: [["japanese-chicken-curry", "主菜", "230"], ["white-rice-cooked", "主食", "170"]],
  },
];

export function buildReferenceMeals(foods: readonly ReferenceFood[]): ReferenceFood[] {
  const byId = new Map(foods.map(food => [food.id, food]));
  return mealSpecs.map(spec => {
    const components = spec.components.map(([id, role, grams]) => {
      const food = byId.get(id);
      if (!food || food.basisUnit || food.components) throw Error("Invalid reference meal component: " + id);
      return { food, role, grams };
    });
    const grams = components.reduce((total, item) => total + Number(item.grams), 0).toString();
    const sample = spec.sample;
    const source: ReferenceSource = {
      dataset: sample ? "新加坡本地餐食成品实测（Yeo 等，2021，CC BY 4.0）" : "Formward 标准配方",
      recordId: sample ? sample.table + " · " + sample.title : spec.id + " v1",
      title: sample ? "Energy Content and Nutrient Profiles of Frequently Consumed Meals in Singapore" : spec.name + " · 菜目与搭配参考",
      url: spec.menu,
    };
    const totals = sumNutrition(components.map(({ food, grams }) => referenceNutrition(food, grams).nutrition));
    const nutrition = sample
      ? readings(scaled(sample.kilojoules, "1", "4.184"), sample.protein, sample.carbs, sample.fat)
      : Object.fromEntries(metrics.map(key => [key, totals.incomplete[key] || totals.values[key] === null ? null :
        scaled(totals.values[key], "100", grams)])) as Nutrition;
    return {
      id: spec.id, name: spec.name, family: spec.family, aliases: spec.aliases, illustration: spec.illustration,
      version: 1, state: "cooked", method: "熟制", source, sourceKind: sample ? "composition_table" : "estimated",
      nutrition, components,
      preparation: sample ? "整份为新加坡实测样本 · 资料能量由 kJ 换算" : "分项可食量合计 · 含搭配所列内容",
      portions: [{ id: "meal-serving", unit: "份", edibleGrams: sample?.grams ?? grams,
        label: sample ? "研究样本整份可食量" : "标准搭配整份可食量", source }],
    };
  });
}
