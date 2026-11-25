const sheets = [
  { name: "chicken", width: 1536, height: 1024, columns: 3, rows: 2, cells: [
    "stewed-skinless", "stewed-skin", "grilled-skinless", "grilled-skin", "fried-drumstick", "raw-chicken",
  ] },
  { name: "staples", width: 1254, height: 1254, columns: 3, rows: 3, cells: [
    "raw-rice", "cooked-rice", "raw-egg", "boiled-egg", "dry-noodles", "cooked-noodles", "raw-fish", "cooked-fish", "generic",
  ] },
  { name: "proteins", width: 640, height: 640, columns: 4, rows: 4, cells: [
    "chicken-breast-raw", "chicken-breast-cooked", "chicken-wing-roasted", "duck-roasted",
    "beef-raw", "beef-cooked", "pork-loin-raw", "pork-loin-cooked",
    "pork-belly-raw", "braised-pork", "shrimp-raw", "shrimp-cooked",
    "salmon-raw", "salmon-cooked", "tofu", "edamame",
  ] },
  { name: "produce", width: 640, height: 640, columns: 4, rows: 4, cells: [
    "leafy-greens", "broccoli", "cabbage", "tomato",
    "carrot", "cucumber", "mushroom", "potato",
    "sweet-potato", "apple", "banana", "orange",
    "grapes", "berries", "pear", "kiwi",
  ] },
  { name: "pantry", width: 640, height: 640, columns: 4, rows: 4, cells: [
    "oats", "mantou", "toast", "milk",
    "yogurt", "cheese", "nuts", "seeds",
    "oil", "sauce", "sugar", "tea",
    "coffee", "juice", "cola", "water",
  ] },
  { name: "dishes", width: 640, height: 640, columns: 4, rows: 4, cells: [
    "fried-rice", "congee", "rice-noodles", "dumplings",
    "wonton-soup", "beef-stew", "chicken-rice", "curry",
    "steamed-egg", "fried-egg", "cracker", "chocolate",
    "chips", "cake", "corn", "pumpkin",
  ] },
  { name: "regional", width: 640, height: 640, columns: 4, rows: 4, cells: [
    "cola-wings", "air-fryer-wings", "tomato-brisket", "tomato-brisket-rice",
    "tomato-eggs", "mapo-tofu", "pork-pepper", "yellow-chicken",
    "hainanese-chicken-rice", "nasi-lemak", "laksa", "char-kway-teow",
    "steak-plate", "beef-bolognese", "gyudon", "japanese-curry-rice",
  ] },
  { name: "prepared", width: 640, height: 640, columns: 4, rows: 4, cells: [
    "potato-boiled", "sweet-potato-baked", "sweet-potato-boiled", "spinach-cooked",
    "broccoli-cooked", "cabbage-cooked", "carrot-cooked", "mushroom-cooked",
    "scrambled-egg", "duck-raw", "lamb-chop", "dry-rice-noodles",
    "dry-glass-noodles", "black-tea", "soy-milk", "fried-tofu",
  ] },
] as const;

export type FoodIllustration = (typeof sheets)[number]["cells"][number];

const cells = new Map(sheets.flatMap(({ name, width, height, columns, rows, cells }) =>
  cells.map((key, index) => [key, { src: "/images/reference-" + name + ".webp", width, height, columns, rows, index }] as const)
));

export function foodArtCell(key: FoodIllustration) {
  return cells.get(key) ?? cells.get("generic")!;
}
