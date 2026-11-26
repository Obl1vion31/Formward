import { decimal, metrics, scaled, sumNutrition, type Nutrition } from "./model";
import { referenceNutrition, type RecipePart, type RecipePartAmount, type RecipePartInput, type ReferenceFood, type ReferenceSnapshot } from "./reference-food";

const units = (grams: string) => Math.round(Number(grams) * 10000);
const gramsFromUnits = (value: number) => (value / 10000).toFixed(4);

export function validRecipePeople(value: string) {
  const count = Number(value);
  return decimal.safeParse(value).success && Number.isInteger(count) && count >= 2;
}

/** Allocate rounding remainders once so the breakdown always weighs exactly what was entered. */
export function wholeRecipeParts(food: ReferenceFood, quantity: string, portionId?: string): RecipePart[] {
  const components = food.components ?? [];
  const portion = food.portions.find(entry => entry.id === portionId);
  const target = BigInt(units(portion ? scaled(quantity, portion.edibleGrams, "1") : quantity));
  const centigram = BigInt(100);
  const precision = target % centigram === BigInt(0) ? centigram : BigInt(1);
  const targetUnits = target / precision;
  const weights = components.map(part => BigInt(units(part.grams)));
  const full = weights.reduce((sum, weight) => sum + weight, BigInt(0));
  if (!full) return [];
  const allocated = weights.map((weight, index) => {
    const scaled = weight * targetUnits;
    return { index, whole: scaled / full, remainder: scaled % full };
  });
  const remaining = targetUnits - allocated.reduce((sum, part) => sum + part.whole, BigInt(0));
  [...allocated].sort((a, b) => Number(b.remainder - a.remainder))
    .slice(0, Number(remaining)).forEach(part => { part.whole += BigInt(1); });
  return allocated.flatMap(({ index, whole }) => whole ? [{
    ...components[index], grams: gramsFromUnits(Number(whole * precision)), estimated: true,
  }] : []);
}

export function recipeGrams(parts: readonly { grams: string }[]) {
  return gramsFromUnits(parts.reduce((sum, part) => sum + units(part.grams), 0));
}

export function recipeTotals(parts: readonly RecipePart[]) {
  const grams = recipeGrams(parts);
  const totals = sumNutrition(parts.map(part => referenceNutrition(part.food, part.grams).nutrition));
  const nutrition = Object.fromEntries(metrics.map(key => [
    key, totals.incomplete[key] ? null : totals.values[key],
  ])) as Nutrition;
  return { grams, nutrition };
}

export function recipeCountPortions(food: ReferenceFood) {
  if (food.basisUnit || food.components) return [];
  return food.portions.filter(portion => ["只", "个", "块", "片", "条"].includes(portion.unit) &&
    decimal.safeParse(portion.edibleGrams).success && Number(portion.edibleGrams) > 0);
}

export function recipePart(recipe: ReferenceFood, food: ReferenceFood, input: { grams: string; estimated?: boolean; count?: RecipePart["count"] }): RecipePart {
  const component = recipe.components?.find(entry => entry.food.id === food.id);
  const suggested = recipe.recipe?.suggestedFoods.some(entry => entry.id === food.id);
  const label = component?.label ?? (suggested && food.id === "potato-boiled" ? "土豆" :
    suggested && food.id === "broccoli-cooked" ? "西兰花" : undefined);
  return { food, ...(label ? { label } : {}), ...(component?.amountBasis ? { amountBasis: component.amountBasis } : {}),
    grams: input.grams, estimated: Boolean(input.estimated), ...(input.count ? { count: input.count } : {}) };
}

export function resolveRecipePart(recipe: ReferenceFood, food: ReferenceFood, amount: RecipePartAmount): RecipePart | null {
  if ("grams" in amount) return recipePart(recipe, food, amount);
  const portion = recipeCountPortions(food).find(entry => entry.id === amount.portionId);
  if (!portion || !decimal.safeParse(amount.quantity).success || Number(amount.quantity) <= 0) return null;
  const grams = scaled(amount.quantity, portion.edibleGrams, "1");
  if (!decimal.safeParse(grams).success || Number(grams) <= 0) return null;
  return recipePart(recipe, food, { grams, estimated: true, count: { quantity: amount.quantity, portion } });
}

export function recipePartAmount({ grams, estimated, count }: RecipePart): RecipePartAmount {
  return count ? { portionId: count.portion.id, quantity: count.quantity } : { grams, ...(estimated ? { estimated: true } : {}) };
}

export function recipePartInputs(parts: readonly RecipePart[]): RecipePartInput[] {
  return parts.map(part => ({ id: part.food.id, version: part.food.version, ...recipePartAmount(part) }));
}

export function sameRecipeParts(a?: readonly RecipePartInput[], b?: readonly RecipePartInput[]) {
  if (!a || !b) return a === b;
  return a.length === b.length && a.every((part, index) => {
    const other = b[index];
    if (part.id !== other.id || part.version !== other.version) return false;
    if ("grams" in part) return "grams" in other && Number(part.grams) === Number(other.grams) &&
      Boolean(part.estimated) === Boolean(other.estimated);
    return "portionId" in other && part.portionId === other.portionId && Number(part.quantity) === Number(other.quantity);
  });
}

export function savedRecipePartInputs(snapshot: ReferenceSnapshot | undefined) {
  return snapshot?.recipeMode === "split" && snapshot.recipeParts ? recipePartInputs(snapshot.recipeParts) : undefined;
}

export function recipeAmountBasis(part: RecipePart) {
  if (part.amountBasis) return part.amountBasis;
  return part.food.state === "raw" ? "生重 · 可食部" : part.food.state === "cooked" ? "熟重 · 可食部" : "即食重量";
}
