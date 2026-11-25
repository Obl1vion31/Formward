import { metrics, scaled, sumNutrition, type Nutrition } from "./model";
import { referenceNutrition, type RecipePart, type RecipePartInput, type ReferenceFood, type ReferenceSnapshot } from "./reference-food";

const units = (grams: string) => Math.round(Number(grams) * 10000);
const gramsFromUnits = (value: number) => (value / 10000).toFixed(4);

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

export function recipePart(recipe: ReferenceFood, food: ReferenceFood, input: Pick<RecipePartInput, "grams" | "estimated">): RecipePart {
  const component = recipe.components?.find(entry => entry.food.id === food.id);
  const suggested = recipe.recipe?.suggestedFoods.some(entry => entry.id === food.id);
  const label = component?.label ?? (suggested && food.id === "potato-boiled" ? "土豆" :
    suggested && food.id === "broccoli-cooked" ? "西兰花" : undefined);
  return { food, ...(label ? { label } : {}), ...(component?.amountBasis ? { amountBasis: component.amountBasis } : {}),
    grams: input.grams, estimated: Boolean(input.estimated) };
}

export function recipePartInputs(parts: readonly RecipePart[]): RecipePartInput[] {
  return parts.map(({ food, grams, estimated }) => ({
    id: food.id, version: food.version, grams, ...(estimated ? { estimated: true } : {}),
  }));
}

export function sameRecipeParts(a?: readonly RecipePartInput[], b?: readonly RecipePartInput[]) {
  if (!a || !b) return a === b;
  return a.length === b.length && a.every((part, index) => part.id === b[index].id &&
    part.version === b[index].version && Number(part.grams) === Number(b[index].grams) &&
    Boolean(part.estimated) === Boolean(b[index].estimated));
}

export function savedRecipePartInputs(snapshot: ReferenceSnapshot | undefined) {
  return snapshot?.recipeMode === "split" && snapshot.recipeParts ? recipePartInputs(snapshot.recipeParts) : undefined;
}

export function recipeAmountBasis(part: RecipePart) {
  if (part.amountBasis) return part.amountBasis;
  return part.food.state === "raw" ? "生重 · 可食部" : part.food.state === "cooked" ? "熟重 · 可食部" : "即食重量";
}
