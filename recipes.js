const form = document.querySelector("#recipe-form");
const result = document.querySelector("#recipe-result");
const fridgePick = document.querySelector("#fridge-pick");
const DB = window.FridgeMealDB;
const Match = window.FridgeMatch;

const DISHES = {
  salad: { words: ["salad"] },
  soup: { words: ["soup", "broth", "chowder"] },
  hot: { categories: ["beef", "chicken", "pasta", "pork", "seafood", "lamb", "goat"] },
  breakfast: { categories: ["breakfast"] },
  snack: { categories: ["starter"] },
  side: { categories: ["side"] },
  dessert: { categories: ["dessert"] },
  drink: { words: ["smoothie", "juice", "drink", "tea", "coffee", "shake"] },
};

const WISH_WORDS = [
  [/остр|перечн|карри/, "spicy"],
  [/сол[её]н/, "salty"],
  [/слад|десерт|торт|пирожн|конфет/, "sweet"],
  [/кисл/, "sour"],
  [/л[её]гк|диет|полезн|низкокалор|фитнес/, "light"],
  [/сытн|плотн|нажорист|калорийн/, "hearty"],
  [/постн|веган/, "vegan"],
  [/вегетариан/, "vegetarian"],
  [/куриц|курин/, "chicken"],
  [/говядин|мясн|бифштекс/, "beef"],
  [/свинин|бекон|ветчин|колбас/, "pork"],
  [/рыбн|лосос|форел|тунец|треск|кревет/, "fish"],
  [/рис/, "rice"],
  [/картоф|пюре/, "potato"],
  [/паста|макарон|спагетти|пенне/, "pasta"],
  [/помидор|томат/, "tomato"],
  [/сырн|сыр(?!ник)/, "cheese"],
  [/яичн|яйц|омлет/, "egg"],
  [/грибн|гриб(?!ник)/, "mushroom"],
  [/шоколад/, "chocolate"],
  [/овощн/, "vegetable"],
  [/фрукт|ягод/, "fruit"],
  [/суп|борщ|рамен/, "soup"],
  [/салат/, "salad"],
  [/блин|оладь|панкейк/, "pancake"],
  [/каша|овсян|гречк/, "porridge"],
];

const FOOD_TERMS = new Set([
  "chicken", "beef", "pork", "fish", "rice", "potato", "tomato", "cheese", "egg",
  "mushroom", "chocolate", "vegetable", "fruit", "soup", "salad", "pancake", "porridge", "pasta",
]);

let searching = false;

renderFridge();

form.addEventListener("submit", (event) => {
  event.preventDefault();
  if (searching) return;
  const wish = form.elements.wish.value.trim();
  const tastes = [...form.querySelectorAll('input[name="taste"]:checked')].map((input) => input.value);
  const dishes = [...form.querySelectorAll('input[name="dish"]:checked')].map((input) => input.value);
  showList(dishes, tastes, wish);
});

function renderFridge() {
  const products = Match.loadFridge();
  fridgePick.replaceChildren();
  if (!products.length) {
    const empty = document.createElement("li");
    empty.className = "fridge-pick-empty";
    empty.textContent = "Холодильник пуст. Добавьте продукты, и подбор пойдёт от них.";
    fridgePick.append(empty);
    return;
  }
  products.forEach((product) => {
    const row = document.createElement("li");
    const name = document.createElement("span");
    name.textContent = product.name;
    const status = document.createElement("span");
    status.textContent = product.en ? Match.expiryText(product.days) : "в поиске источника не участвует";
    if (product.en && product.days <= 2) status.className = "is-urgent";
    row.append(name, status);
    fridgePick.append(row);
  });
}

async function showList(dishes, tastes, wish) {
  result.hidden = false;
  result.replaceChildren();
  const products = Match.loadFridge();
  const known = products.filter((product) => product.en);

  if (!known.length && !tastes.length && !dishes.length && !wish) {
    note("Добавьте продукты в холодильник или отметьте вкус и тип блюда.");
    return;
  }
  if (!known.length) {
    note("В холодильнике нет продуктов, которые можно искать в источнике. Добавьте их на вкладке «Мой холодильник» — рецепт собирается в первую очередь из того, что уже дома.");
    return;
  }

  searching = true;
  form.querySelector("[type='submit']").disabled = true;
  try {
    const keywords = [...new Set([...tastes, ...wishWords(wish)])];
    setLoading(known);
    const partials = await collectMeals(known, wish);
    const ranked = [];
    const limit = Math.min(partials.length, 12);
    for (let index = 0; index < limit && ranked.filter((item) => item.fit.ok).length < 8; index += 1) {
      const meal = await DB.byId(partials[index].idMeal).catch(() => null);
      if (!meal || meal.partial) continue;
      const fit = Match.assess(meal, products);
      if (!fit.ok) continue;
      ranked.push({
        meal,
        fit,
        fridge: Match.fridgeScore(fit.have),
        pref: preferenceScore(meal, keywords, dishes),
        dishHit: !dishes.length || dishes.some((key) => dishHit(meal, key)),
      });
    }

    result.replaceChildren();
    if (!ranked.length) {
      note("Из текущих продуктов источник не собрал блюдо даже с 2–3 недостающими ингредиентами. Добавьте ещё продукт или смягчите пожелание.");
      return;
    }

    let picked = ranked;
    if (dishes.length) {
      const matched = ranked.filter((item) => item.dishHit);
      if (matched.length) {
        picked = matched;
      } else {
        note("Точного типа блюда среди продуктов холодильника нет. Ниже ближайшие рецепты из того, что уже дома.");
      }
    }

    picked.sort((a, b) => b.fridge - a.fridge || b.pref - a.pref || a.fit.missing.length - b.fit.missing.length || a.meal.strMeal.localeCompare(b.meal.strMeal));

    const found = document.createElement("p");
    found.className = "field-hint";
    found.textContent = `Источник: ${DB.SOURCE_NAME}. Сначала рецепты из продуктов, которые испортятся раньше. Не больше ${Match.MAX_MISSING} недостающих продуктов. Текст рецептов на английском.`;
    result.append(found);

    const grid = document.createElement("div");
    grid.className = "recipe-grid";
    picked.slice(0, 6).forEach((entry) => grid.append(card(entry)));
    result.append(grid);
  } catch {
    result.replaceChildren();
    note("Не удалось связаться с TheMealDB. Проверьте интернет и попробуйте снова.");
  } finally {
    searching = false;
    form.querySelector("[type='submit']").disabled = false;
  }
}

async function collectMeals(products, wish) {
  const terms = [];
  products.forEach((product) => {
    if (product.en && !terms.includes(product.en)) terms.push(product.en);
  });
  wishWords(wish).forEach((word) => {
    if (FOOD_TERMS.has(word) && !terms.includes(word)) terms.push(word);
  });

  const found = new Map();
  for (const term of terms.slice(0, 6)) {
    const batch = await DB.byIngredient(term).catch(() => []);
    batch.forEach((meal) => {
      const current = found.get(meal.idMeal);
      if (current) current.hits += 1;
      else found.set(meal.idMeal, { ...meal, hits: 1 });
    });
  }
  return [...found.values()].sort((a, b) => b.hits - a.hits).slice(0, 40);
}

function wishWords(wish) {
  if (!wish) return [];
  const text = wish.toLocaleLowerCase("ru");
  return WISH_WORDS.filter(([pattern]) => pattern.test(text)).map(([, word]) => word);
}

function preferenceScore(meal, keywords, dishes) {
  const blob = mealBlob(meal);
  let score = 0;
  keywords.forEach((word) => {
    if (blob.title.includes(word)) score += 4;
    if (blob.category.includes(word) || blob.area.includes(word) || blob.tags.includes(word)) score += 2;
    if (blob.instructions.includes(word)) score += 1;
  });
  if (dishes.some((key) => dishHit(meal, key))) score += 6;
  return score;
}

function dishHit(meal, key) {
  const rule = DISHES[key];
  if (!rule) return false;
  const blob = mealBlob(meal);
  if (rule.categories && rule.categories.includes(blob.category)) return true;
  return (rule.words || []).some((word) => blob.title.includes(word) || blob.tags.includes(word) || blob.instructions.includes(word));
}

function mealBlob(meal) {
  return {
    title: (meal.strMeal || "").toLowerCase(),
    category: (meal.strCategory || "").toLowerCase(),
    area: (meal.strArea || "").toLowerCase(),
    tags: (meal.strTags || "").toLowerCase(),
    instructions: (meal.strInstructions || "").toLowerCase(),
  };
}

function card(entry) {
  const { meal, fit } = entry;
  const cardNode = document.createElement("article");
  cardNode.className = "recipe-card";

  if (meal.strMealThumb) {
    const image = document.createElement("img");
    image.src = meal.strMealThumb;
    image.alt = meal.strMeal;
    image.loading = "lazy";
    cardNode.append(image);
  }

  const title = document.createElement("h3");
  title.textContent = meal.strMeal;
  const meta = document.createElement("p");
  meta.className = "recipe-meta";
  meta.textContent = [meal.strCategory, meal.strArea].filter(Boolean).join(" · ");

  const have = document.createElement("p");
  have.className = "recipe-have";
  const haveNames = fit.have
    .slice()
    .sort((a, b) => a.product.days - b.product.days)
    .map((item) => `${item.product.name} (${Match.expiryText(item.product.days)})`);
  have.textContent = `Есть дома: ${haveNames.join(", ")}`;

  const missing = document.createElement("p");
  missing.className = fit.missing.length ? "recipe-miss" : "recipe-have";
  missing.textContent = fit.missing.length
    ? `Не хватает: ${fit.missing.join(", ")}`
    : "Докупать ничего не нужно";

  const open = document.createElement("a");
  open.className = "action";
  open.href = `recipe.html?id=${encodeURIComponent(meal.idMeal)}`;
  open.textContent = "Показать рецепт";

  cardNode.append(title, meta, have, missing, open);
  return cardNode;
}

function setLoading(products) {
  const loading = document.createElement("p");
  loading.className = "field-hint recipe-loading";
  const names = products.slice(0, 4).map((product) => product.name).join(", ");
  loading.textContent = `Ищем в ${DB.SOURCE_NAME} по одному запросу, сначала «${names}»…`;
  result.append(loading);
}

function note(text) {
  const node = document.createElement("p");
  node.className = "field-hint";
  node.textContent = text;
  result.append(node);
}
