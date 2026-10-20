import test from "node:test";
import assert from "node:assert/strict";
import { McpClient, unpack } from "../lib/mcp-client.mjs";
import { prepareDefaultMeal, mealPlans, foodTags } from "../lib/meals.mjs";
test("MCP initializes, carries session, parses SSE and blocks writes", async () => {
  const requests = [];
  const mock = async (url, init) => {
    const req = JSON.parse(init.body);
    requests.push({ url, ...init, rpc: req });
    if (req.method === "notifications/initialized")
      return new Response(null, { status: 202 });
    let result =
      req.method === "initialize"
        ? { protocolVersion: "2025-03-26" }
        : req.method === "tools/list"
          ? { tools: [{ name: "now-time-info" }] }
          : {
              structuredContent: {
                success: true,
                data: { date: "2026-10-20" },
              },
            };
    return new Response(
      `event: message\ndata: ${JSON.stringify({ jsonrpc: "2.0", id: req.id, result })}\n\n`,
      {
        headers: {
          "content-type": "text/event-stream",
          ...(req.method === "initialize"
            ? { "mcp-session-id": "test-session" }
            : {}),
        },
      },
    );
  };
  const client = new McpClient("test-placeholder", mock);
  await client.initialize();
  assert.equal((await client.tools()).length, 1);
  assert.equal((await client.call("now-time-info", {})).date, "2026-10-20");
  assert.equal(requests[2].headers["Mcp-Session-Id"], "test-session");
  assert.equal(requests[0].redirect, "error");
  await assert.rejects(() => client.call("create-order", {}), /仅允许/);
  assert.equal(requests.length, 4);
});
test("invalid auth and rate limit do not echo credential", async () => {
  for (const code of [401, 429]) {
    const client = new McpClient(
      "test-placeholder",
      async () => new Response(null, { status: code }),
    );
    await assert.rejects(
      () => client.initialize(),
      (error) =>
        !error.message.includes("test-placeholder") &&
        ["TOKEN", "RATE_LIMIT"].includes(error.code),
    );
  }
});
test("supports JSON and structured tool results, rejects business failures", () => {
  assert.deepEqual(
    unpack({
      content: [
        {
          type: "text",
          text: '## Original Response\n```json\n{"success":true,"data":{"price":2500}}\n```',
        },
      ],
    }),
    { price: 2500 },
  );
  assert.throws(() =>
    unpack({ structuredContent: { success: false, data: { price: 0 } } }),
  );
});
const detail = {
  code: "123",
  name: "鱼肉堡中套餐",
  rounds: [
    {
      id: 1,
      minQuantity: 1,
      maxQuantity: 1,
      choices: [{ code: "11", name: "鱼肉堡", isDefault: 1, quantity: 1 }],
    },
    {
      id: 2,
      minQuantity: 1,
      maxQuantity: 1,
      choices: [
        { code: "22", name: "冰可乐", isDefault: 1, quantity: 1 },
        {
          code: "23",
          name: "热红茶",
          isDefault: 0,
          quantity: 0,
          maxQuantity: 1,
        },
      ],
    },
  ],
};
test("meal construction follows provided defaults, can select a real hot option", () => {
  assert.deepEqual(prepareDefaultMeal(detail).components, ["鱼肉堡", "冰可乐"]);
  const hot = prepareDefaultMeal(detail, ["iced"]);
  assert.deepEqual(hot.components, ["鱼肉堡", "热红茶"]);
  assert.equal(hot.item.roundList[1].comboItemList[0].code, "23");
  const broken = structuredClone(detail);
  broken.rounds[0].choices[0].quantity = 0;
  assert.throws(() => prepareDefaultMeal(broken));
});
test("query pipeline uses only authoritative integer price; no display-price fallback", async () => {
  const calls = [];
  const client = {
    async call(name, args) {
      calls.push({ name, args });
      if (name === "query-meals")
        return { meals: { 123: { name: "鱼肉堡套餐", currentPrice: "9.90" } } };
      if (name === "query-meal-detail") return detail;
      if (name === "calculate-price") return { price: 3450 };
      throw new Error(name);
    },
  };
  const result = await mealPlans(client, {
    storeCode: "100",
    storeName: "Test Store",
    budgetFen: 3500,
  });
  assert.equal(result.options[0].amountFen, 3450);
  assert.deepEqual(
    calls.map((x) => x.name),
    ["query-meals", "query-meal-detail", "calculate-price"],
  );
  assert(!JSON.stringify(calls).includes("create-order"));
  client.call = async (name) =>
    name === "query-meals"
      ? { meals: { 123: { name: "鱼肉堡套餐", currentPrice: "9.9" } } }
      : name === "query-meal-detail"
        ? detail
        : { price: "3450" };
  await assert.rejects(
    () =>
      mealPlans(client, {
        storeCode: "100",
        storeName: "Test",
        budgetFen: 3500,
      }),
    /未找到/,
  );
});
test("plain hamburger component is marked as beef for preference filtering", () => {
  assert(foodTags("快乐套餐", ["汉堡包", "可乐"]).includes("beef"));
});
