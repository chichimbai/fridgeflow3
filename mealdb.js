window.FridgeMealDB = (() => {
  const API = "https://www.themealdb.com/api/json/v1/1";
  const CACHE_KEY = "fridgeflow-meal-cache";
  const SOURCE_NAME = "TheMealDB";
  const SOURCE_URL = "https://www.themealdb.com/";

  function loadCache() {
    try {
      const parsed = JSON.parse(localStorage.getItem(CACHE_KEY) || "{}");
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }

  function saveCache(cache) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
    } catch {
      // Кэш переполнен: рецепты просто не сохранятся.
    }
  }

  function remember(meal) {
    if (!meal || !meal.idMeal) return;
    const cache = loadCache();
    cache[meal.idMeal] = meal;
    saveCache(cache);
  }

  function cached(id) {
    return loadCache()[id] || null;
  }

  async function getJson(path) {
    const response = await fetch(`${API}${path}`);
    if (!response.ok) throw new Error(`Источник ответил ошибкой ${response.status}`);
    return response.json();
  }

  async function search(word) {
    const data = await getJson(`/search.php?s=${encodeURIComponent(word)}`);
    const meals = Array.isArray(data.meals) ? data.meals : [];
    meals.forEach(remember);
    return meals;
  }

  async function byIngredient(ingredient) {
    const data = await getJson(`/filter.php?i=${encodeURIComponent(ingredient)}`);
    const meals = Array.isArray(data.meals) ? data.meals : [];
    meals.forEach((meal) =>
      remember({
        idMeal: meal.idMeal,
        strMeal: meal.strMeal,
        strMealThumb: meal.strMealThumb,
        partial: true,
      }),
    );
    return meals;
  }

  async function byCategory(category) {
    const data = await getJson(`/filter.php?c=${encodeURIComponent(category)}`);
    const meals = Array.isArray(data.meals) ? data.meals : [];
    meals.forEach((meal) =>
      remember({
        idMeal: meal.idMeal,
        strMeal: meal.strMeal,
        strMealThumb: meal.strMealThumb,
        strCategory: category,
        strArea: meal.strArea || "",
        strInstructions: meal.strInstructions || "",
        partial: true,
      }),
    );
    return meals;
  }

  async function byId(id) {
    const hit = cached(id);
    if (hit && !hit.partial) return hit;
    const data = await getJson(`/lookup.php?i=${encodeURIComponent(id)}`);
    const meal = Array.isArray(data.meals) ? data.meals[0] : null;
    if (meal) remember(meal);
    return meal || null;
  }

  const HISTORY_KEY = "fridgeflow-recipe-history";
  const USES_KEY = "fridgeflow-recipe-uses";

  function loadHistory() {
    try {
      const parsed = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function saveUse(meal) {
    const history = loadHistory();
    history.push({
      id: meal.idMeal,
      title: meal.strMeal || "Рецепт",
      at: new Date().toISOString(),
      thumb: meal.strMealThumb || "",
      category: meal.strCategory || "",
      area: meal.strArea || "",
    });
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    try {
      const uses = JSON.parse(localStorage.getItem(USES_KEY) || "{}");
      const id = meal.idMeal;
      uses[id] = Number(uses[id] || 0) + 1;
      localStorage.setItem(USES_KEY, JSON.stringify(uses));
    } catch {
      localStorage.setItem(USES_KEY, JSON.stringify({ [meal.idMeal]: 1 }));
    }
    return history;
  }

  return {
    search,
    byIngredient,
    byCategory,
    byId,
    remember,
    cached,
    loadHistory,
    saveUse,
    SOURCE_NAME,
    SOURCE_URL,
  };
})();

window.FridgeMatch = (() => {
  const FOODS = [
    { keys: ["подсолнеч"], en: "olive oil", label: "растительное масло", words: ["sunflower oil", "vegetable oil", "olive oil"] },
    { keys: ["молок", "кефир"], en: "milk", label: "молоко", words: ["milk"] },
    { keys: ["йогурт"], en: "yogurt", label: "йогурт", words: ["yogurt", "yoghurt"] },
    { keys: ["сметан"], en: "sour cream", label: "сметана", words: ["sour cream", "soured cream"] },
    { keys: ["сливк"], en: "cream", label: "сливки", words: ["cream"] },
    { keys: ["сыр"], en: "cheese", label: "сыр", words: ["cheese", "parmesan", "cheddar", "mozzarella", "feta"] },
    { keys: ["яйц"], en: "egg", label: "яйца", words: ["egg"] },
    { keys: ["помидор", "томат"], en: "tomato", label: "помидоры", words: ["tomato"] },
    { keys: ["огурец", "огурц"], en: "cucumber", label: "огурец", words: ["cucumber"] },
    { keys: ["картоф"], en: "potato", label: "картофель", words: ["potato"] },
    { keys: ["морков"], en: "carrot", label: "морковь", words: ["carrot"] },
    { keys: ["чеснок"], en: "garlic", label: "чеснок", words: ["garlic"] },
    { keys: ["лук"], en: "onion", label: "лук", words: ["onion"] },
    { keys: ["куриц", "курин"], en: "chicken", label: "курица", words: ["chicken"] },
    { keys: ["говяд"], en: "beef", label: "говядина", words: ["beef"] },
    { keys: ["свинин", "бекон", "ветчин"], en: "pork", label: "свинина", words: ["pork", "bacon", "ham"] },
    { keys: ["баранин"], en: "lamb", label: "баранина", words: ["lamb"] },
    { keys: ["рыб", "лосос", "тунец", "треск", "кревет"], en: "salmon", label: "рыба", words: ["salmon", "tuna", "cod", "fish", "prawn", "shrimp"] },
    { keys: ["рис"], en: "rice", label: "рис", words: ["rice"] },
    { keys: ["греч"], en: "buckwheat", label: "гречка", words: ["buckwheat"] },
    { keys: ["паста", "макарон", "спагет"], en: "pasta", label: "паста", words: ["pasta", "spaghetti", "noodle"] },
    { keys: ["хлеб"], en: "bread", label: "хлеб", words: ["bread"] },
    { keys: ["сливочн", "масло"], en: "butter", label: "масло", words: ["butter"] },
    { keys: ["яблок"], en: "apple", label: "яблоки", words: ["apple"] },
    { keys: ["банан"], en: "banana", label: "бананы", words: ["banana"] },
    { keys: ["гриб"], en: "mushroom", label: "грибы", words: ["mushroom"] },
    { keys: ["капуст"], en: "cabbage", label: "капуста", words: ["cabbage"] },
    { keys: ["шпинат"], en: "spinach", label: "шпинат", words: ["spinach"] },
    { keys: ["сахар"], en: "sugar", label: "сахар", words: ["sugar"] },
    { keys: ["мук"], en: "flour", label: "мука", words: ["flour"] },
  ];

  const QUERY_MAP = [
    [/омлет/, "omelette"],
    [/яичниц/, "egg"],
    [/суп/, "soup"],
    [/салат/, "salad"],
    [/борщ/, "borscht"],
    [/паста|спагетти|макарон/, "pasta"],
    [/куриц/, "chicken"],
    [/говядин/, "beef"],
    [/свинин/, "pork"],
    [/рыб/, "fish"],
    [/рис/, "rice"],
    [/картоф/, "potato"],
    [/помидор|томат/, "tomato"],
    [/сыр/, "cheese"],
    [/яйц/, "egg"],
    [/десерт|торт/, "cake"],
    [/блин|оладь/, "pancake"],
    [/каша|овсян/, "porridge"],
  ];

  function normalize(name) {
    return String(name || "").toLocaleLowerCase("ru").replaceAll("ё", "е");
  }

  function hasKey(name, key) {
    return new RegExp(`(^|[^а-я])${key}`).test(normalize(name));
  }

  function includesWord(haystack, word) {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[^a-z])${escaped}(?:es|s)?([^a-z]|$)`, "i").test(haystack);
  }

  function daysUntil(isoDate) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const expiry = new Date(`${isoDate}T00:00:00`);
    return Math.round((expiry - today) / 86400000);
  }

  function foodFor(name) {
    if (hasKey(name, "подсолнеч")) return FOODS.find((item) => item.en === "olive oil") || null;
    if (hasKey(name, "масло") || (hasKey(name, "сливочн") && !hasKey(name, "сливк"))) {
      return FOODS.find((item) => item.en === "butter") || null;
    }
    return FOODS.find((item) => item.en !== "butter" && item.en !== "olive oil" && item.keys.some((key) => hasKey(name, key))) || null;
  }

  function isPantry(name) {
    const value = name.toLowerCase();
    if (includesWord(value, "salt") || includesWord(value, "water")) return true;
    if (/black pepper|white pepper/.test(value) || value.trim() === "pepper") return true;
    if (/olive oil|vegetable oil|sunflower oil|cooking oil/.test(value) || value.trim() === "oil") return true;
    return false;
  }

  function loadFridge() {
    let saved = [];
    try {
      const parsed = JSON.parse(localStorage.getItem("fridgeflow-products") || "[]");
      if (Array.isArray(parsed)) saved = parsed;
    } catch {
      saved = [];
    }
    return saved
      .filter((product) => product && product.name && !product.used && /^\d{4}-\d{2}-\d{2}$/.test(product.expiry || ""))
      .map((product) => {
        const food = foodFor(product.name);
        return {
          ...product,
          days: daysUntil(product.expiry),
          en: food ? food.en : "",
          label: food ? food.label : product.name.trim(),
          words: food ? food.words : [],
        };
      })
      .sort((a, b) => a.days - b.days || a.name.localeCompare(b.name, "ru"));
  }

  function ingredients(meal) {
    const parts = [];
    for (let index = 1; index <= 20; index += 1) {
      const name = (meal[`strIngredient${index}`] || "").trim();
      if (name) parts.push(name);
    }
    return parts;
  }

  function displayName(ingredient) {
    const food = FOODS.find((item) => item.words.some((word) => includesWord(ingredient, word)));
    return food ? food.label : ingredient;
  }

  function assess(meal, products) {
    const used = new Set();
    const have = [];
    const missing = [];
    ingredients(meal).forEach((name) => {
      if (isPantry(name)) return;
      const index = products.findIndex(
        (product, productIndex) => !used.has(productIndex) && product.words.some((word) => includesWord(name, word)),
      );
      if (index >= 0) {
        used.add(index);
        have.push({ product: products[index], ingredient: name });
      } else {
        missing.push(displayName(name));
      }
    });
    const uniqueMissing = [...new Set(missing)];
    return {
      have,
      missing: uniqueMissing,
      ok: have.length > 0 && uniqueMissing.length <= 3,
    };
  }

  function urgency(days) {
    if (days < 0) return 10;
    if (days <= 2) return 7;
    if (days <= 5) return 4;
    return 1;
  }

  function fridgeScore(have) {
    return have.reduce((total, item) => total + urgency(item.product.days), 0);
  }

  function toEnglishQuery(text) {
    const value = normalize(text).trim();
    if (!value) return "";
    if (/[a-z]/i.test(value) && !/[а-я]/.test(value)) return value;
    const hit = QUERY_MAP.find(([pattern]) => pattern.test(value));
    return hit ? hit[1] : "";
  }

  function expiryText(days) {
    if (days < 0) return `просрочено на ${Math.abs(days)} дн.`;
    if (days === 0) return "срок сегодня";
    if (days === 1) return "остался 1 день";
    return `осталось ${days} дн.`;
  }

  return {
    loadFridge,
    assess,
    fridgeScore,
    urgency,
    toEnglishQuery,
    expiryText,
    displayName,
    MAX_MISSING: 3,
  };
})();
