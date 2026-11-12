const STORAGE_KEY = "fridgeflow-products";
const RECOMMEND_KEY = "fridgeflow-recommendations";
const NAME_KEY = "fridgeflow-name";
const EXPIRED_MAX_DAYS = 2;
const SOON_MAX_DAYS = 5;
const UNITS = {
  g: "г",
  kg: "кг",
  ml: "мл",
  l: "л",
  pcs: "шт",
};

const form = document.querySelector("#product-form");
const formTitle = document.querySelector("#form-title");
const cancelEdit = document.querySelector("#cancel-edit");
const listPanel = document.querySelector("#product-list");
const list = document.querySelector("#product-rows");
const toggleList = document.querySelector("#toggle-list");
const recordsCount = document.querySelector("#records-count");
const filterTabs = document.querySelectorAll(".list-tab");
const addButton = document.querySelector("#add-product");
const recommend = document.querySelector("#recommend");
const recommendToggle = document.querySelector("#recommend-toggle");
const recommendList = document.querySelector("#recommend-list");
const recommendSave = document.querySelector("#recommend-save");
const statusText = document.querySelector("#fridge-status");
const donut = document.querySelector("#usage-donut");
const usagePercent = document.querySelector("#usage-percent");
const usageNote = document.querySelector("#usage-note");
const expiredDonut = document.querySelector("#expired-donut");
const expiredPercent = document.querySelector("#expired-percent");
const expiredNote = document.querySelector("#expired-note");
const bars = document.querySelector("#usage-bars");
const nameNode = document.querySelector("#user-name");
const nameForm = document.querySelector("#name-form");
const renameButton = document.querySelector("#rename");
const searchInput = document.querySelector("#product-search");
const filterSelect = document.querySelector("#product-filter");
const eatFirstSection = document.querySelector("#eat-first");
const eatFirstList = document.querySelector("#eat-first-list");
const exportButton = document.querySelector("#export-data");
const importButton = document.querySelector("#import-data");
const importFile = document.querySelector("#import-file");
const dataError = document.querySelector("#data-error");

let products = loadProducts();
let editingId = null;

nameNode.textContent = localStorage.getItem(NAME_KEY) || "Алия";
document.querySelector("#rule-total").textContent = "Любой продукт из списка.";
document.querySelector("#rule-soon").textContent =
  "Не использован, до конца срока от 3 до 5 дней.";
document.querySelector("#rule-used").textContent = "Отмечен кнопкой «Использовано».";
document.querySelector("#rule-almost").textContent =
  "Не использован, до конца срока осталось от 0 до 2 дней.";
document.querySelector("#rule-expired").textContent =
  "Не использован, срок годности уже прошёл.";

toggleList.addEventListener("click", () => {
  const open = listPanel.classList.toggle("is-open");
  toggleList.setAttribute("aria-expanded", String(open));
  toggleList.classList.toggle("is-collapsed", !open);
  toggleList.setAttribute("aria-label", open ? "Свернуть список" : "Развернуть список");
  toggleList.title = open ? "Свернуть список" : "Развернуть список";
});

filterTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    filterTabs.forEach((entry) => entry.classList.toggle("is-active", entry === tab));
    filterSelect.value = tab.dataset.filter;
    render();
  });
});

addButton.addEventListener("click", () => {
  form.scrollIntoView({ behavior: "smooth", block: "center" });
  form.elements.name.focus({ preventScroll: true });
});

recommendToggle.addEventListener("click", () => {
  const open = recommend.classList.toggle("is-open");
  recommendToggle.setAttribute("aria-expanded", String(open));
});

searchInput.addEventListener("input", render);
filterSelect.addEventListener("change", render);

exportButton.addEventListener("click", () => {
  const blob = new Blob([JSON.stringify({ products }, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "fridgeflow-products.json";
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
});

importButton.addEventListener("click", () => importFile.click());

importFile.addEventListener("change", () => {
  const file = importFile.files && importFile.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.addEventListener("load", () => {
    try {
      const parsed = JSON.parse(String(reader.result));
      const items = Array.isArray(parsed) ? parsed : parsed.products;
      if (!Array.isArray(items)) throw new Error("Неверный формат файла");
      const restored = items.filter(isImportableProduct).map(normalizeProduct);
      if (!restored.length) throw new Error("В файле нет подходящих продуктов");
      products = restored;
      dataError.hidden = true;
      persist();
    } catch (error) {
      dataError.textContent =
        error instanceof Error && error.message
          ? error.message
          : "Не удалось загрузить копию. Проверьте файл.";
      dataError.hidden = false;
    }
    importFile.value = "";
  });
  reader.readAsText(file);
});

recommendList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-recommend]");
  if (!button) return;
  const suggestion = suggestions().find((item) => productKey(item.name) === button.dataset.recommend);
  if (!suggestion) return;
  form.elements.name.value = suggestion.name;
  form.elements.amount.value = suggestion.amount ? String(suggestion.amount) : "";
  if (suggestion.unit) form.elements.unit.value = suggestion.unit;
  form.elements.price.value = suggestion.price == null ? "" : priceForForm(suggestion);
  form.elements.expiry.focus();
});

recommendSave.addEventListener("click", () => {
  const name = form.elements.name.value.trim();
  if (!name) {
    form.elements.name.focus();
    return;
  }
  addRecommendation({
    name,
    amount: Number(form.elements.amount.value) || null,
    unit: form.elements.unit.value,
    price: readPrice(form.elements.price.value),
    priceCurrency: readPrice(form.elements.price.value) == null ? null : FridgePrices.currentCurrency(),
  });
});

renameButton.addEventListener("click", () => {
  nameForm.hidden = false;
  renameButton.hidden = true;
  nameForm.elements.userName.value = nameNode.textContent;
  nameForm.elements.userName.focus();
});

document.querySelector("#cancel-name").addEventListener("click", closeNameForm);

nameForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const next = String(nameForm.elements.userName.value).trim();
  if (!next) {
    return;
  }
  localStorage.setItem(NAME_KEY, next);
  nameNode.textContent = next;
  closeNameForm();
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const data = readForm();

  if (editingId) {
    products = products.map((product) =>
      product.id === editingId ? { ...product, ...data } : product,
    );
  } else {
    products.push({ id: crypto.randomUUID(), used: false, ...data });
  }

  resetForm();
  persist();
});

cancelEdit.addEventListener("click", resetForm);

list.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  const row = event.target.closest("[data-id]");
  if (!button || !row) {
    return;
  }

  const id = row.dataset.id;
  const action = button.dataset.action;

  if (action === "edit") {
    startEdit(id);
  }

  if (action === "delete") {
    products = products.filter((product) => product.id !== id);
    if (editingId === id) {
      resetForm();
    }
    persist();
  }

  if (action === "recommend") {
    const current = products.find((product) => product.id === id);
    if (!current) return;
    fillFromProduct(current);
    addRecommendation({
      name: current.name.trim(),
      amount: current.amount,
      unit: current.unit,
      price: current.price ?? null,
      priceCurrency: current.priceCurrency ?? null,
    });
  }

  if (action === "use") {
    const current = products.find((product) => product.id === id);
    if (current) rememberUse(current);
    products = products.map((product) =>
      product.id === id ? { ...product, used: true, usedOn: product.usedOn || FridgePrices.todayISO() } : product,
    );
    persist();
  }
});

render();
renderRecommendations();

function loadProducts() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    const stored = JSON.parse(saved);
    let changed = false;
    const migrated = stored.map((product) => {
      if (product.used && !product.usedOn) {
        changed = true;
        return { ...product, usedOn: FridgePrices.todayISO() };
      }
      return product;
    });
    if (changed) localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
    return migrated;
  }

  return [
    item("Молоко", 250, "ml", 2),
    item("Помидоры", 500, "g", 3),
    item("Йогурт", 200, "g", 4),
    item("Сыр", 180, "g", -1),
    item("Яйца", 10, "pcs", 12, true),
    item("Огурец", 2, "pcs", 6, true),
  ];
}

function item(name, amount, unit, dayOffset, used = false) {
  const expiry = new Date();
  expiry.setDate(expiry.getDate() + dayOffset);

  return {
    id: crypto.randomUUID(),
    name,
    amount,
    unit,
    expiry: expiry.toISOString().slice(0, 10),
    used,
    usedOn: used ? FridgePrices.todayISO() : null,
    price: null,
    priceCurrency: null,
  };
}

function addRecommendation(entry) {
  const data = loadRecommendations();
  const key = productKey(entry.name);
  if (!key) return;
  data.manual = data.manual.filter((item) => productKey(item.name) !== key);
  data.manual.push(entry);
  data.templates[key] = entry;
  saveRecommendations(data);
  renderRecommendations();
}

function fillFromProduct(product) {
  form.elements.name.value = product.name;
  form.elements.amount.value = product.amount ? String(product.amount) : "";
  if (product.unit) form.elements.unit.value = product.unit;
  form.elements.price.value = product.price == null ? "" : priceForForm(product);
  form.elements.name.focus();
}

function loadRecommendations() {
  try {
    const saved = JSON.parse(localStorage.getItem(RECOMMEND_KEY) || "");
    return {
      log: Array.isArray(saved.log) ? saved.log : [],
      manual: Array.isArray(saved.manual) ? saved.manual : [],
      templates: saved.templates && typeof saved.templates === "object" ? saved.templates : {},
    };
  } catch {
    return { log: [], manual: [], templates: {} };
  }
}

function saveRecommendations(data) {
  localStorage.setItem(RECOMMEND_KEY, JSON.stringify(data));
}

function productKey(name) {
  return String(name || "").trim().toLocaleLowerCase("ru").replaceAll("ё", "е");
}

function rememberUse(product) {
  const data = loadRecommendations();
  const name = product.name.trim();
  if (!name) return;
  data.log.push(name);
  data.templates[productKey(name)] = {
    name,
    amount: product.amount,
    unit: product.unit,
    price: product.price ?? null,
    priceCurrency: product.priceCurrency ?? null,
  };
  saveRecommendations(data);
  renderRecommendations();
}

function suggestions() {
  const data = loadRecommendations();
  const repeated = new Set();
  let run = 1;
  for (let index = 1; index < data.log.length; index += 1) {
    const current = productKey(data.log[index]);
    const previous = productKey(data.log[index - 1]);
    if (current && current === previous) {
      run += 1;
      if (run >= 2) repeated.add(current);
    } else {
      run = 1;
    }
  }

  const counts = new Map();
  data.log.forEach((name) => {
    const key = productKey(name);
    if (!key) return;
    counts.set(key, (counts.get(key) || 0) + 1);
  });

  const items = new Map();
  repeated.forEach((key) => {
    const template = data.templates[key] || { name: key };
    items.set(key, { ...template, count: counts.get(key) || 0 });
  });
  data.manual.forEach((item) => {
    const key = productKey(item.name);
    if (!key) return;
    const existing = items.get(key);
    items.set(key, {
      ...(existing || {}),
      ...item,
      count: counts.get(key) || existing?.count || 0,
    });
  });

  return [...items.values()].sort(
    (a, b) => b.count - a.count || a.name.localeCompare(b.name, "ru"),
  );
}

function timesLabel(count) {
  const mod100 = count % 100;
  const mod10 = count % 10;
  if (mod100 > 10 && mod100 < 20) return `${count} раз`;
  if (mod10 === 1) return `${count} раз`;
  if (mod10 >= 2 && mod10 <= 4) return `${count} раза`;
  return `${count} раз`;
}

function renderRecommendations() {
  const items = suggestions();
  recommendList.replaceChildren();
  if (!items.length) {
    const empty = document.createElement("li");
    empty.className = "recommend-empty";
    empty.textContent = "Пока пусто. Отметьте один продукт два раза подряд или добавьте его из формы.";
    recommendList.append(empty);
    return;
  }

  items.forEach((item) => {
    const row = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.recommend = productKey(item.name);
    const times = item.count ? `, ${timesLabel(item.count)}` : "";
    button.textContent = `${item.name}${times}`;
    row.append(button);
    recommendList.append(row);
  });
}

function readForm() {
  const data = new FormData(form);
  return {
    name: String(data.get("name")).trim(),
    amount: Number(data.get("amount")),
    unit: String(data.get("unit")),
    expiry: String(data.get("expiry")),
    price: readPrice(data.get("price")),
    priceCurrency: readPrice(data.get("price")) == null ? null : FridgePrices.currentCurrency(),
  };
}

function priceForForm(product) {
  if (product.price == null) return "";
  const code = FridgePrices.currentCurrency();
  const kzt = FridgePrices.toKzt(Number(product.price), product.priceCurrency || "KZT");
  return String(Math.round(FridgePrices.fromKzt(kzt, code) * 100) / 100);
}

function readPrice(value) {
  if (value == null || String(value).trim() === "") return null;
  const price = Number(value);
  return Number.isFinite(price) && price >= 0 ? price : null;
}

function startEdit(id) {
  const product = products.find((entry) => entry.id === id);
  if (!product) {
    return;
  }

  editingId = id;
  form.elements.name.value = product.name;
  form.elements.amount.value = String(product.amount);
  form.elements.unit.value = product.unit;
  form.elements.expiry.value = product.expiry;
  form.elements.price.value = priceForForm(product);
  formTitle.textContent = "Изменить продукт";
  form.querySelector("[type='submit']").textContent = "Сохранить";
  cancelEdit.hidden = false;
  form.scrollIntoView({ behavior: "smooth", block: "center" });
}

function closeNameForm() {
  nameForm.hidden = true;
  renameButton.hidden = false;
  nameForm.reset();
}

function resetForm() {
  editingId = null;
  form.reset();
  formTitle.textContent = "Добавить продукт";
  form.querySelector("[type='submit']").textContent = "Добавить";
  cancelEdit.hidden = true;
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(products));
  render();
}

function render() {
  const active = products
    .filter((product) => !product.used)
    .sort((a, b) => a.expiry.localeCompare(b.expiry));
  const used = products.filter((product) => product.used);
  const soon = active.filter((product) => classify(product) === "soon");
  const almost = active.filter((product) => classify(product) === "almost");
  const expired = active.filter((product) => classify(product) === "expired");

  document.querySelector("#count-total").textContent = String(products.length);
  document.querySelector("#count-soon").textContent = String(soon.length);
  document.querySelector("#count-used").textContent = String(used.length);
  document.querySelector("#count-almost").textContent = String(almost.length);
  document.querySelector("#count-expired").textContent = String(expired.length);
  fillCounter("items-total", products);
  fillCounter("items-soon", soon);
  fillCounter("items-used", used);
  fillCounter("items-almost", almost);
  fillCounter("items-expired", expired);

  statusText.textContent =
    soon.length || almost.length || expired.length
      ? "Есть продукты, на которые стоит взглянуть"
      : "Твой холодильник в порядке";

  const percent = share(used.length);
  donut.style.setProperty("--share", String(percent));
  usagePercent.textContent = `${percent}%`;
  usageNote.textContent = `${percent}% от всех`;

  const expiredShare = share(expired.length);
  expiredDonut.style.setProperty("--share", String(expiredShare));
  expiredPercent.textContent = `${expiredShare}%`;
  expiredNote.textContent = `${expiredShare}% от всех`;

  const fresh = active.filter((product) => classify(product) === "fresh");
  renderMix([
    { label: "Использовано", value: used.length, tone: "used" },
    { label: "Свежие", value: fresh.length, tone: "fresh" },
    { label: "Скоро", value: soon.length, tone: "soon" },
    { label: "Вот-вот", value: almost.length, tone: "almost" },
    { label: "Просрочено", value: expired.length, tone: "expired" },
  ]);
  renderBars([
    { label: "Всего", value: products.length, tone: "total" },
    { label: "Скоро", value: soon.length, tone: "soon" },
    { label: "Готово", value: used.length, tone: "used" },
    { label: "Вот-вот", value: almost.length, tone: "almost" },
    { label: "Истёк", value: expired.length, tone: "expired" },
  ]);
  renderEatFirst(active);
  renderList(active, used);
}

function renderEatFirst(active) {
  const urgent = active
    .filter((product) => {
      const state = classify(product);
      return state === "expired" || state === "almost";
    })
    .sort((a, b) => a.expiry.localeCompare(b.expiry));

  eatFirstSection.hidden = urgent.length === 0;
  eatFirstList.replaceChildren();

  urgent.forEach((product) => {
    const row = document.createElement("li");
    const name = document.createElement("span");
    name.textContent = `${product.name}, ${product.amount} ${UNITS[product.unit] || ""}`.trim();
    const status = document.createElement("span");
    status.className = expiryClass(product);
    status.textContent = expiryLabel(product);
    row.append(name, status);
    eatFirstList.append(row);
  });
}

function share(count) {
  return products.length ? Math.round((count / products.length) * 100) : 0;
}

function fillCounter(id, items) {
  const node = document.querySelector(`#${id}`);
  node.replaceChildren();

  if (!items.length) {
    const empty = document.createElement("li");
    empty.className = "counter-empty";
    empty.textContent = "Пока нет таких продуктов.";
    node.append(empty);
    return;
  }

  items.forEach((product) => {
    const item = document.createElement("li");
    item.textContent = `${product.name}, ${product.amount} ${UNITS[product.unit] || ""}`.trim();
    node.append(item);
  });
}

function renderMix(groups) {
  const mix = document.querySelector("#usage-mix");
  const legend = document.querySelector("#usage-mix-legend");
  if (!mix || !legend) return;

  const total = groups.reduce((sum, group) => sum + group.value, 0);
  mix.replaceChildren();
  legend.replaceChildren();
  if (!total) return;

  groups.forEach((group) => {
    if (!group.value) return;

    const part = document.createElement("span");
    part.className = `mix-part mix-${group.tone}`;
    part.style.width = `${(group.value / total) * 100}%`;
    mix.append(part);

    const key = document.createElement("span");
    key.className = `mix-${group.tone}`;
    key.textContent = `${group.label} ${group.value}`;
    legend.append(key);
  });
}

function renderBars(groups) {
  const max = Math.max(1, ...groups.map((group) => group.value));
  bars.replaceChildren();

  groups.forEach((group) => {
    const bar = document.createElement("div");
    bar.className = `bar bar-${group.tone}`;

    const value = document.createElement("span");
    value.className = "bar-value";
    value.textContent = String(group.value);

    const fill = document.createElement("div");
    fill.className = "bar-fill";
    fill.style.setProperty("--size", `${(group.value / max) * 100}%`);

    const label = document.createElement("span");
    label.textContent = group.label;

    bar.append(value, fill, label);
    bars.append(bar);
  });
}

function renderList(active, used) {
  list.replaceChildren();

  const query = productKey(searchInput.value);
  const filter = filterSelect.value;

  let shownActive = active;
  let shownUsed = used;

  if (filter !== "all") {
    shownActive = filter === "used" ? [] : active.filter((product) => classify(product) === filter);
    shownUsed = filter === "used" ? used : [];
  }

  if (query) {
    shownActive = shownActive.filter((product) => productKey(product.name).includes(query));
    shownUsed = shownUsed.filter((product) => productKey(product.name).includes(query));
  }

  recordsCount.textContent = String(shownActive.length + shownUsed.length);

  if (!shownActive.length && !shownUsed.length) {
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = products.length
      ? "Ничего не найдено. Попробуйте изменить поиск или фильтр."
      : "В холодильнике пока нет продуктов.";
    list.append(empty);
    return;
  }

  let index = 0;
  shownActive.forEach((product) => {
    index += 1;
    list.append(renderProduct(product, index));
  });

  if (!shownUsed.length) {
    return;
  }

  const title = document.createElement("h3");
  title.className = "used-title";
  title.textContent = "Уже использовано";
  list.append(title);
  shownUsed.forEach((product) => {
    index += 1;
    list.append(renderProduct(product, index));
  });
}

function renderProduct(product, index) {
  const row = document.createElement("article");
  const state = product.used ? "used" : classify(product);
  row.className = `product product-${state}`;
  row.dataset.id = product.id;

  const main = document.createElement("div");
  main.className = "product-main";

  const num = document.createElement("span");
  num.className = "row-num";
  num.textContent = String(index).padStart(2, "0");

  const avatar = document.createElement("span");
  avatar.className = "product-avatar";
  avatar.textContent = product.name.trim().charAt(0).toLocaleUpperCase("ru");

  const heading = document.createElement("h3");
  heading.textContent = product.name;
  main.append(num, avatar, heading);

  const amount = document.createElement("p");
  amount.className = "product-amount";
  amount.textContent = `${product.amount} ${UNITS[product.unit] || ""}`.trim();

  const price = document.createElement("p");
  price.className = "product-price";
  price.textContent = product.price == null
    ? "—"
    : FridgePrices.formatMoney(product.price, product.priceCurrency || "KZT");

  const date = document.createElement("p");
  date.className = "product-date";
  date.textContent = formatDate(product.used && product.usedOn ? product.usedOn : product.expiry);

  const status = document.createElement("span");
  status.className = `status-pill-row pill-${state}`;
  status.textContent = pillLabel(product);

  const actions = document.createElement("div");
  actions.className = "row-actions";
  if (!product.used && (state === "almost" || state === "expired")) {
    const star = document.createElement("span");
    star.className = "row-star";
    star.textContent = "★";
    star.title = "Сначала съесть";
    actions.append(star);
  }
  if (!product.used) {
    actions.append(iconButton("Использовано", "use", "✓", "row-btn-use"));
  }
  actions.append(iconButton("Изменить", "edit", "✎", ""));
  actions.append(iconButton("В список", "recommend", "✚", ""));
  actions.append(iconButton("Удалить", "delete", "✕", "row-btn-danger"));

  row.append(main, amount, price, date, status, actions);
  return row;
}

function iconButton(label, action, glyph, extraClass) {
  const element = document.createElement("button");
  element.type = "button";
  element.className = `row-btn ${extraClass}`.trim();
  element.dataset.action = action;
  element.textContent = glyph;
  element.title = label;
  element.setAttribute("aria-label", label);
  return element;
}

function formatDate(iso) {
  const months = [
    "янв", "фев", "мар", "апр", "мая", "июн",
    "июл", "авг", "сен", "окт", "ноя", "дек",
  ];
  const [year, month, day] = String(iso).split("-").map(Number);
  if (!year || !month || !day) return String(iso);
  return `${day} ${months[month - 1]} ${year}`;
}

function classify(product) {
  const days = daysUntil(product.expiry);
  if (days < 0) return "expired";
  if (days <= EXPIRED_MAX_DAYS) return "almost";
  if (days <= SOON_MAX_DAYS) return "soon";
  return "fresh";
}

function pillLabel(product) {
  if (product.used) return "Использовано";
  if (classify(product) === "expired") return "Просрочено";
  return expiryLabel(product);
}

function expiryClass(product) {
  if (product.used) {
    return "";
  }
  const state = classify(product);
  if (state === "soon" || state === "almost") return "status-warn";
  if (state === "expired") return "status-expired";
  return "";
}

function isImportableProduct(entry) {
  return (
    entry &&
    typeof entry === "object" &&
    typeof entry.name === "string" &&
    entry.name.trim() !== "" &&
    Number.isFinite(Number(entry.amount)) &&
    typeof entry.expiry === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(entry.expiry)
  );
}

function normalizeProduct(entry) {
  return {
    id: typeof entry.id === "string" ? entry.id : crypto.randomUUID(),
    name: entry.name.trim(),
    amount: Number(entry.amount),
    unit: UNITS[entry.unit] ? entry.unit : "g",
    expiry: entry.expiry,
    used: Boolean(entry.used),
    usedOn: typeof entry.usedOn === "string" ? entry.usedOn : null,
    price: Number.isFinite(Number(entry.price)) ? Number(entry.price) : null,
    priceCurrency:
      typeof entry.priceCurrency === "string" ? entry.priceCurrency : null,
  };
}

function expiryLabel(product) {
  if (product.used) {
    return "Использовано";
  }

  const days = daysUntil(product.expiry);
  if (days < 0) {
    return `Просрочено на ${Math.abs(days)} дн.`;
  }
  if (days === 0) {
    return "Срок сегодня";
  }
  if (days === 1) {
    return "Остался 1 день";
  }
  return `Осталось ${days} дн.`;
}

function daysUntil(isoDate) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiry = new Date(`${isoDate}T00:00:00`);
  return Math.round((expiry - today) / 86400000);
}
