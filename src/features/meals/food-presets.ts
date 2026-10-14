import type { FoodDraft } from "./model";
// 来自 USDA 官方 SR Legacy 2018 JSON，六项经版本固定，不在运行时联网估算。
export const foodPresets: FoodDraft[] = [
  {
    "name": "鸡胸肉",
    "preparation": "去皮去骨，生重，不含额外油酱",
    "baseQuantity": "100",
    "unit": "g",
    "nutrition": {
      "caloriesKcal": "120",
      "proteinG": "22.5",
      "carbsG": "0.0",
      "fatG": "2.62"
    },
    "sourceKind": "composition_table",
    "basis": "USDA FoodData Central · SR Legacy 2018 · FDC 171077 · 每100g。Chicken, broiler or fryers, breast, skinless, boneless, meat only, raw。参考成分不代表本次食物精确实测；部位、生熟、脂肪含量须核对。",
    "evidenceUrl": "https://fdc.nal.usda.gov/food-details/171077/nutrients"
  },
  {
    "name": "鸡腿肉",
    "preparation": "去皮去骨，生重，不含额外油酱",
    "baseQuantity": "100",
    "unit": "g",
    "nutrition": {
      "caloriesKcal": "121",
      "proteinG": "19.7",
      "carbsG": "0.0",
      "fatG": "4.12"
    },
    "sourceKind": "composition_table",
    "basis": "USDA FoodData Central · SR Legacy 2018 · FDC 173627 · 每100g。Chicken, broilers or fryers, dark meat, thigh, meat only, raw。参考成分不代表本次食物精确实测；部位、生熟、脂肪含量须核对。",
    "evidenceUrl": "https://fdc.nal.usda.gov/food-details/173627/nutrients"
  },
  {
    "name": "牛里脊",
    "preparation": "去骨瘦肉，外部脂肪修至0，生重，不含额外油酱",
    "baseQuantity": "100",
    "unit": "g",
    "nutrition": {
      "caloriesKcal": "139",
      "proteinG": "21.9",
      "carbsG": "0.0",
      "fatG": "5.74"
    },
    "sourceKind": "composition_table",
    "basis": "USDA FoodData Central · SR Legacy 2018 · FDC 171767 · 每100g。Beef, loin, tenderloin steak, boneless, separable lean only, trimmed to 0\" fat, all grades, raw。参考成分不代表本次食物精确实测；部位、生熟、脂肪含量须核对。",
    "evidenceUrl": "https://fdc.nal.usda.gov/food-details/171767/nutrients"
  },
  {
    "name": "鸡蛋",
    "preparation": "全蛋可食部分，生重，不含蛋壳及额外油酱",
    "baseQuantity": "100",
    "unit": "g",
    "nutrition": {
      "caloriesKcal": "143",
      "proteinG": "12.6",
      "carbsG": "0.72",
      "fatG": "9.51"
    },
    "sourceKind": "composition_table",
    "basis": "USDA FoodData Central · SR Legacy 2018 · FDC 171287 · 每100g。Egg, whole, raw, fresh。参考成分不代表本次食物精确实测；部位、生熟、脂肪含量须核对。",
    "evidenceUrl": "https://fdc.nal.usda.gov/food-details/171287/nutrients"
  },
  {
    "name": "三文鱼",
    "preparation": "养殖大西洋鲑，可食部分，生重，不含额外油酱",
    "baseQuantity": "100",
    "unit": "g",
    "nutrition": {
      "caloriesKcal": "208",
      "proteinG": "20.4",
      "carbsG": "0.0",
      "fatG": "13.4"
    },
    "sourceKind": "composition_table",
    "basis": "USDA FoodData Central · SR Legacy 2018 · FDC 175167 · 每100g。Fish, salmon, Atlantic, farmed, raw。参考成分不代表本次食物精确实测；部位、生熟、脂肪含量须核对。",
    "evidenceUrl": "https://fdc.nal.usda.gov/food-details/175167/nutrients"
  },
  {
    "name": "米饭",
    "preparation": "普通强化长粒白米，熟重，不含额外油酱",
    "baseQuantity": "100",
    "unit": "g",
    "nutrition": {
      "caloriesKcal": "130",
      "proteinG": "2.69",
      "carbsG": "28.2",
      "fatG": "0.28"
    },
    "sourceKind": "composition_table",
    "basis": "USDA FoodData Central · SR Legacy 2018 · FDC 168878 · 每100g。Rice, white, long-grain, regular, enriched, cooked。参考成分不代表本次食物精确实测；部位、生熟、脂肪含量须核对。",
    "evidenceUrl": "https://fdc.nal.usda.gov/food-details/168878/nutrients"
  }
];
export function searchFoodPresets(query="") { const q=query.normalize("NFKC").trim().toLowerCase(); return foodPresets.filter(f=>`${f.name} ${f.preparation}`.toLowerCase().includes(q)); }
