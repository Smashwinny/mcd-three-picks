import {
  budgetFen,
  shortlist,
  randomIndex,
  money,
  plainSummary,
  shareSvg,
  validateQuotes,
} from "./engine.js";
const $ = (id) => document.getElementById(id);
const state = {
  mode: "demo",
  payload: null,
  removed: [],
  result: null,
  selected: null,
  busy: false,
  epoch: 0,
  server: false,
};
let demo;
const kindNames = {
  chicken: "鸡肉灵感",
  beef: "牛肉灵感",
  fish: "鱼肉灵感",
  breakfast: "早餐灵感",
  wrap: "卷饼灵感",
};
function element(tag, text, className) {
  const e = document.createElement(tag);
  if (text !== undefined) e.textContent = text;
  if (className) e.className = className;
  return e;
}
function selectedTags() {
  return [...document.querySelectorAll(".preferences input:checked")].map(
    (x) => x.value,
  );
}
function status(text) {
  $("action-status").textContent = text;
}
function hideResult() {
  state.selected = null;
  $("result").hidden = true;
}
function budget() {
  return budgetFen($("budget").value);
}
function render() {
  state.epoch++;
  hideResult();
  $("candidates").replaceChildren();
  $("budget-error").textContent = "";
  $("empty").hidden = true;
  $("draw").disabled = true;
  $("refresh").disabled = true;
  if (!state.payload) {
    $("candidate-count").textContent =
      state.mode === "live"
        ? "先选择门店并完成核价。"
        : "载入餐单后开始三选一。";
    return;
  }
  try {
    state.result = shortlist(
      state.payload,
      budget(),
      selectedTags(),
      state.removed,
    );
    const result = state.result;
    $("candidate-count").textContent =
      `${result.storeName} · ${result.total} 份餐单 / ${result.matchedCount} 份符合本轮条件${result.source === "synthetic-demo" ? "" : " · 报价窗口 5 分钟"}`;
    $("draw").disabled = state.busy || !result.shortlist.length;
    $("refresh").disabled = state.busy || !result.shortlist.length;
    if (!result.shortlist.length) {
      $("empty").hidden = false;
      $("empty-reason").textContent = state.removed.length
        ? "本轮候选已看完，可以恢复全部候选，或调整预算和口味。"
        : "没有预算内且满足当前筛选的餐单。可以调整预算、筛选，或换一家门店；我们不会悄悄增加预算。";
      return;
    }
    for (const [i, option] of result.shortlist.entries()) {
      const card = element("article", undefined, "meal-card");
      card.dataset.id = option.id;
      const art = element("div", undefined, `meal-art ${option.art}`),
        image = element("img");
      image.src = option.image || `assets/${option.art}.svg`;
      image.alt = option.image ? option.name : "";
      if (option.image) image.className = "official-img";
      image.addEventListener(
        "error",
        () => {
          image.className = "";
          image.src = `assets/${option.art}.svg`;
        },
        { once: true },
      );
      art.append(
        image,
        element("span", `0${i + 1}`, "card-number"),
        element(
          "span",
          result.source === "synthetic-demo"
            ? kindNames[option.art]
            : "本次已核价",
          "card-kind",
        ),
      );
      const content = element("div", undefined, "meal-content");
      content.append(element("h4", option.name));
      const list = element("ul");
      for (const part of option.components.length
        ? option.components
        : ["餐品组成未提供，请在官方渠道确认"])
        list.append(element("li", part));
      content.append(list);
      const price = element("div", undefined, "meal-price");
      price.append(
        element("b", `¥${money(option.amountFen)}`),
        element(
          "span",
          result.source === "synthetic-demo" ? "演示价格" : "核价应付",
        ),
      );
      content.append(price);
      const choose = element("button", undefined, "choose-one");
      choose.type = "button";
      choose.append(element("span", "就这份，不纠结了"), element("span", "↗"));
      choose.disabled = state.busy;
      choose.setAttribute("aria-label", `选择${option.name}`);
      choose.addEventListener("click", () => {
        if (!state.busy) finish(option.id);
      });
      content.append(choose);
      card.append(art, content);
      $("candidates").append(card);
    }
  } catch (error) {
    state.result = null;
    $("candidate-count").textContent = "暂时不能展示候选。";
    if (/预算/.test(error.message))
      $("budget-error").textContent = error.message;
    else status(error.message);
  }
}
function finish(id) {
  try {
    const current = shortlist(
      state.payload,
      budget(),
      selectedTags(),
      state.removed,
    );
    const option = current.shortlist.find((x) => x.id === id);
    if (!option) throw new Error("候选已变化，请重新选择。");
    state.result = current;
    state.selected = option;
    document
      .querySelectorAll(".meal-card")
      .forEach((card) =>
        card.classList.toggle("active-card", card.dataset.id === id),
      );
    $("ticket-source").textContent =
      state.mode === "demo"
        ? "虚构数据 / 演示"
        : state.mode === "live"
          ? "本机 MCP / 只读核价"
          : "外部输入 / 来源未独立认证";
    $("result-name").textContent = option.name;
    $("result-components").textContent =
      option.components.join(" · ") || "餐品组成未提供";
    $("result-price").textContent = `¥${money(option.amountFen)}`;
    $("result-saving").textContent =
      `预算还余 ¥${money(current.budgetFen - option.amountFen)}`;
    $("result-store").textContent =
      `${current.storeName} · ${current.fulfillment}`;
    $("result-time").textContent = current.quotedAt
      ? `核价时间：${new Date(current.quotedAt).toLocaleString("zh-CN", { hour12: false })}`
      : "演示数据，不代表任何门店现价";
    $("result-notice").textContent =
      current.source === "synthetic-demo"
        ? "离线演示：本餐品及价格均为虚构，不可据此点餐。"
        : "仅在这次已提供的候选中选择，请在官方渠道核对并自行下单。";
    $("result").hidden = false;
    status(`已选好：${option.name}，¥${money(option.amountFen)}。`);
    $("result-heading").focus({ preventScroll: true });
    $("result").scrollIntoView({
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
      block: "center",
    });
  } catch (error) {
    hideResult();
    status(error.message);
  }
}
async function draw() {
  if (state.busy) return;
  try {
    const current = shortlist(
      state.payload,
      budget(),
      selectedTags(),
      state.removed,
    );
    if (!current.shortlist.length) throw new Error("没有可抽选的餐单。");
    const epoch = state.epoch;
    state.busy = true;
    document
      .querySelectorAll(".choose-one")
      .forEach((b) => (b.disabled = true));
    $("draw").disabled = true;
    $("draw").firstElementChild.textContent = "一点惊喜，马上就好…";
    const selected = current.shortlist[randomIndex(current.shortlist.length)];
    if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
      for (let i = 0; i < 8; i++) {
        if (epoch !== state.epoch) return;
        document
          .querySelectorAll(".meal-card")
          .forEach((card, n) =>
            card.classList.toggle(
              "active-card",
              n === i % current.shortlist.length,
            ),
          );
        await new Promise((resolve) => setTimeout(resolve, 75 + i * 9));
      }
    }
    if (epoch === state.epoch) finish(selected.id);
  } catch (error) {
    status(error.message);
  } finally {
    state.busy = false;
    document
      .querySelectorAll(".choose-one")
      .forEach((b) => (b.disabled = false));
    $("draw").firstElementChild.textContent = "帮我选一份";
    $("draw").disabled = !state.result?.shortlist.length;
    $("refresh").disabled = !state.result?.shortlist.length;
  }
}
function onSettings() {
  status("");
  state.removed = [];
  if (state.mode === "live" && state.payload) {
    state.payload = null;
    status("条件已调整，请点击当前门店重新核价，以便重新匹配搭配。");
  }
  render();
  document
    .querySelectorAll("[data-budget]")
    .forEach((button) =>
      button.classList.toggle(
        "active",
        button.dataset.budget === $("budget").value,
      ),
    );
}
async function api(path, body) {
  const response = await fetch(path, {
    ...(body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : {}),
    signal: AbortSignal.timeout(180000),
  });
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error(
      "公开演示不提供个人 Token 接口；请在本机运行 npm start，或导入当次核价餐单。",
    );
  }
  if (!response.ok) throw new Error(data.error || "请求未完成。");
  return data;
}
async function switchMode(mode) {
  if (state.busy) return;
  state.mode = mode;
  state.payload = null;
  state.removed = [];
  state.result = null;
  status("");
  for (const key of ["demo", "live", "import"])
    $(`mode-${key}`).setAttribute("aria-pressed", String(mode === key));
  $("live-panel").hidden = mode !== "live";
  $("import-panel").hidden = mode !== "import";
  $("mode-badge").textContent =
    mode === "demo"
      ? "免 Token 演示"
      : mode === "live"
        ? "本机真实选餐"
        : "导入报价";
  $("source-note").textContent =
    mode === "demo"
      ? "当前为虚构餐品与价格，仅用于体验操作，不代表门店实时菜单。"
      : mode === "live"
        ? "个人 Token 仅由本机服务读取。请选择一个地点和门店，查询当前可售单人套餐并核价。"
        : "导入数据只在当前页面处理，不上传。来源标记由提供方声明，本站不独立认证。请勿粘贴凭证。";
  if (mode === "demo") state.payload = demo;
  render();
  if (mode === "live") {
    try {
      const result = await api("/api/status");
      state.server = result.liveAvailable;
      $("live-help").textContent = result.liveAvailable
        ? "本机 Token 已配置。输入城市和公开地点，开始找店。"
        : "本机服务已运行，但尚未配置 .env 中的 MCD_MCP_TOKEN。";
    } catch (error) {
      state.server = false;
      $("live-help").textContent = error.message;
    }
    $("store-form").querySelector("button").disabled = !state.server;
  }
}
async function loadStore(store) {
  if (state.busy) return;
  let amount;
  try {
    amount = budget();
  } catch (error) {
    status(error.message);
    return;
  }
  state.busy = true;
  state.payload = null;
  state.result = null;
  render();
  status("正在查询菜单、确认套餐搭配并逐份核价，请稍候…");
  document.querySelectorAll(".store-item").forEach((b) => (b.disabled = true));
  try {
    const payload = await api("/api/plans", {
      storeCode: store.code,
      budgetFen: amount,
      excluded: selectedTags(),
    });
    state.payload = payload;
    state.removed = [];
    status(
      `已核价 ${payload.scope.quoted} 份餐单，检查 ${payload.scope.productsInspected} 个候选。价格和供应以官方实时结果为准。`,
    );
  } catch (error) {
    status(error.message);
  } finally {
    state.busy = false;
    render();
    document
      .querySelectorAll(".store-item")
      .forEach((b) => (b.disabled = false));
  }
}
$("store-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (state.busy || !state.server) return;
  state.payload = null;
  state.result = null;
  render();
  status("正在查找营业中的门店…");
  const button = $("store-form").querySelector("button");
  button.disabled = true;
  $("store-results").replaceChildren();
  try {
    const data = await api("/api/stores", {
      city: $("city").value,
      keyword: $("keyword").value,
    });
    if (!data.stores.length)
      status("没有查到当前营业的门店，请换个地点关键词。");
    else status("选一家门店，准备三选一。");
    for (const store of data.stores) {
      const b = element("button", undefined, "store-item");
      b.type = "button";
      b.append(
        element("span", store.name),
        element("small", `${store.address} · 营业 ${store.hours}`),
      );
      b.addEventListener("click", () => loadStore(store));
      $("store-results").append(b);
    }
  } catch (error) {
    status(error.message);
  } finally {
    button.disabled = false;
  }
});
for (const key of ["demo", "live", "import"])
  $(`mode-${key}`).addEventListener("click", () => switchMode(key));
$("budget").addEventListener("input", onSettings);
document.querySelectorAll("[data-budget]").forEach((b) =>
  b.addEventListener("click", () => {
    $("budget").value = b.dataset.budget;
    onSettings();
  }),
);
document
  .querySelectorAll(".preferences input")
  .forEach((x) => x.addEventListener("change", onSettings));
$("draw").addEventListener("click", draw);
$("redraw").addEventListener("click", draw);
$("refresh").addEventListener("click", () => {
  if (state.busy || !state.result) return;
  state.removed.push(...state.result.shortlist.map((x) => x.id));
  status("");
  render();
});
$("reset-options").addEventListener("click", () => {
  state.removed = [];
  status("");
  render();
});
$("load-quotes").addEventListener("click", () => {
  try {
    const text = $("quote-json").value;
    if (text.length > 128000) throw new Error("文件过大，请仅导入本轮餐单。");
    const payload = JSON.parse(text);
    if (payload.source !== "mcp-calculate-price")
      throw new Error("此入口仅接收当次 MCP 核价餐单；演示请使用“先试一试”。");
    validateQuotes(payload);
    state.payload = payload;
    state.removed = [];
    status("餐单已载入。来源为外部输入，未独立认证。");
    render();
  } catch (error) {
    state.payload = null;
    state.result = null;
    render();
    status(
      error instanceof SyntaxError
        ? "JSON 格式不正确，请检查内容。"
        : error.message,
    );
  }
});
function freshSelected() {
  if (!state.selected) throw new Error("请先选一份餐单。");
  validateQuotes(state.payload);
  return state.selected;
}
$("copy-result").addEventListener("click", async () => {
  try {
    const option = freshSelected();
    await navigator.clipboard.writeText(plainSummary(state.result, option));
    status("餐单已复制。");
  } catch (error) {
    status(error.message || "复制不可用，请下载分享卡。");
  }
});
$("download-result").addEventListener("click", () => {
  try {
    const option = freshSelected(),
      svg = shareSvg(state.result, option),
      url = URL.createObjectURL(
        new Blob([svg], { type: "image/svg+xml;charset=utf-8" }),
      ),
      a = element("a");
    a.href = url;
    a.download = "three-picks-lunch.svg";
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    status("分享卡已下载。");
  } catch (error) {
    status(error.message);
  }
});
setInterval(() => {
  if (state.payload?.source === "mcp-calculate-price") {
    try {
      validateQuotes(state.payload);
    } catch (error) {
      state.payload = null;
      state.result = null;
      render();
      status("报价展示窗口已结束，请重新核价。旧金额已隐藏。");
    }
  }
}, 1000);
try {
  const response = await fetch("data/demo-quotes.json");
  if (!response.ok) throw new Error();
  demo = await response.json();
  await switchMode("demo");
} catch {
  status("演示餐单加载失败，请刷新页面。");
  $("draw").disabled = true;
}
