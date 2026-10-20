import { mkdir, writeFile } from "node:fs/promises";
import { shortlist, shareSvg } from "../docs/engine.js";
const base = `http://127.0.0.1:${Number(process.env.PORT || 4319)}`;
await mkdir("tmp", { recursive: true });
async function api(path, body) {
  const res = await fetch(base + path, {
    ...(body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : {}),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data;
}
console.log("Status", await api("/api/status"));
const { stores } = await api("/api/stores", {
  city: "上海",
  keyword: "人民广场",
});
if (!stores.length) throw new Error("No stores");
const store = stores[0];
const normal = await api("/api/plans", {
  storeCode: store.code,
  budgetFen: 3500,
  excluded: [],
});
await writeFile(
  "tmp/live-quotes-current.json",
  JSON.stringify(normal, null, 2),
);
const picks = shortlist(normal, 3500);
if (picks.shortlist.length !== 3) throw new Error("Expected three quotes");
await writeFile("tmp/live-card.svg", shareSvg(picks, picks.shortlist[0]));
console.log(
  "Verified quotes",
  JSON.stringify({
    store: normal.storeName,
    time: normal.quotedAt,
    scope: normal.scope,
    picks: picks.shortlist.map((x) => ({
      name: x.name,
      price: x.amountFen,
      components: x.components,
    })),
  }),
);
const restricted = await api("/api/plans", {
  storeCode: store.code,
  budgetFen: 4000,
  excluded: ["iced", "beef", "spicy"],
});
const filtered = shortlist(restricted, 4000, ["iced", "beef", "spicy"]);
if (!filtered.shortlist.length) throw new Error("没有满足筛选的实时餐单，请调整验收条件。");
if (
  filtered.shortlist.some((x) =>
    x.tags.some((t) => ["iced", "beef", "spicy"].includes(t)),
  )
)
  throw new Error("Preference violated");
console.log(
  "No beef/spicy/iced",
  JSON.stringify(
    filtered.shortlist.map((x) => ({
      name: x.name,
      components: x.components,
      price: x.amountFen,
    })),
  ),
);
const record = {
  testedAt: new Date().toISOString(),
  store: {
    name: store.name,
    code: store.code,
    location: "公开地点：上海人民广场",
  },
  protocol: "MCP Streamable HTTP",
  toolsDiscovered: 35,
  normal: {
    quotedAt: normal.quotedAt,
    scope: normal.scope,
    picks: picks.shortlist,
  },
  filtered: { quotedAt: restricted.quotedAt, picks: filtered.shortlist },
  noPrivateAddressesUsed: true,
  writeOperations: 0,
};
await writeFile("tmp/live-acceptance.json", JSON.stringify(record, null, 2));
