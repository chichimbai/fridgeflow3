const DB = window.FridgeMealDB;
const root = document.querySelector("#recipe-detail");
const id = new URLSearchParams(location.search).get("id");

if (!id) {
  showMissing();
} else {
  root.replaceChildren();
  const loading = document.createElement("p");
  loading.className = "field-hint";
  loading.textContent = "Загружаем рецепт из интернета…";
  root.append(loading);

  DB.byId(id)
    .then((meal) => {
      if (!meal) {
        showMissing();
        return;
      }
      renderRecipe(meal);
    })
    .catch(() => {
      const hit = DB.cached(id);
      if (hit && !hit.partial) {
        renderRecipe(hit);
        return;
      }
      root.replaceChildren();
      const note = document.createElement("p");
      note.className = "field-hint";
      note.textContent = "Не удалось загрузить рецепт. Проверьте интернет и обновите страницу.";
      root.append(note);
    });
}

function showMissing() {
  root.replaceChildren();
  const note = document.createElement("p");
  note.className = "field-hint";
  note.textContent = "Такого рецепта нет. Вернитесь к списку и выберите блюдо снова.";
  root.append(note);
}

function renderRecipe(meal) {
  root.replaceChildren();

  const photo = document.createElement("figure");
  photo.className = "recipe-photo";
  const image = document.createElement("img");
  image.src = meal.strMealThumb;
  image.alt = meal.strMeal;
  photo.append(image);

  const title = document.createElement("h2");
  title.textContent = meal.strMeal;
  const meta = document.createElement("p");
  meta.className = "recipe-meta";
  meta.textContent = [meal.strCategory, meal.strArea].filter(Boolean).join(" · ");
  const source = document.createElement("p");
  source.className = "recipe-source";
  const link = document.createElement("a");
  link.href = `${DB.SOURCE_URL}meal/${encodeURIComponent(meal.idMeal)}`;
  link.target = "_blank";
  link.rel = "noopener";
  link.textContent = `Источник: ${DB.SOURCE_NAME}`;
  source.append("Рецепт скопирован из открытой базы ", link, ". Текст на английском языке.");
  root.append(photo, title, meta, source);

  const fit = window.FridgeMatch.assess(meal, window.FridgeMatch.loadFridge());
  const have = document.createElement("p");
  have.className = "recipe-have";
  have.textContent = fit.have.length
    ? `Есть дома: ${fit.have.map((item) => item.product.name).join(", ")}`
    : "В холодильнике сейчас нет продуктов этого рецепта.";
  const missing = document.createElement("p");
  missing.className = fit.missing.length ? "recipe-miss" : "recipe-have";
  missing.textContent = fit.missing.length
    ? `Не хватает: ${fit.missing.join(", ")}`
    : "Докупать ничего не нужно";
  const use = document.createElement("button");
  use.type = "button";
  use.className = "action";
  use.textContent = "Использовать этот";
  const saved = document.createElement("p");
  saved.className = "field-hint";
  saved.hidden = true;
  use.addEventListener("click", () => {
    DB.saveUse(meal);
    saved.hidden = false;
    saved.textContent = "Рецепт записан в историю кабинета.";
  });
  root.append(have, missing, use, saved);

  const parts = ingredients(meal);
  if (parts.length) {
    const haveTitle = document.createElement("h3");
    haveTitle.textContent = "Ингредиенты";
    const list = document.createElement("ul");
    list.className = "recipe-list";
    parts.forEach(({ name, measure }) => {
      const row = document.createElement("li");
      row.textContent = measure ? `${name} — ${measure}` : name;
      list.append(row);
    });
    root.append(haveTitle, list);
  }

  const steps = stepsFrom(meal.strInstructions || "");
  if (steps.length) {
    const stepsTitle = document.createElement("h3");
    stepsTitle.textContent = "Как приготовить";
    const intro = document.createElement("p");
    intro.className = "field-hint";
    intro.textContent = "Шаги приведены как в источнике, без изменений.";
    const list = document.createElement("ol");
    list.className = "recipe-list";
    steps.forEach((text) => {
      const row = document.createElement("li");
      row.textContent = text;
      list.append(row);
    });
    root.append(stepsTitle, intro, list);
  }
}

function ingredients(meal) {
  const parts = [];
  for (let index = 1; index <= 20; index += 1) {
    const name = (meal[`strIngredient${index}`] || "").trim();
    if (!name) continue;
    const measure = (meal[`strMeasure${index}`] || "").trim();
    parts.push({ name, measure });
  }
  return parts;
}

function stepsFrom(text) {
  const blocks = text
    .split(/\r?\n/)
    .map((block) => block.trim())
    .filter(Boolean);
  if (blocks.length > 1) return blocks;
  const flat = (blocks[0] || "").replace(/\s+/g, " ").trim();
  if (!flat) return [];
  if (flat.length <= 360) return [flat];
  return flat
    .split(/(?<=[.!?])\s+(?=[A-ZА-Я0-9])/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}
