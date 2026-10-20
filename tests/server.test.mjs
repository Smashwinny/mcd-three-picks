import { request } from "node:http";
import test from "node:test";
import assert from "node:assert/strict";
import { appServer } from "../server.mjs";
async function withServer(fn, options = {}) {
  const server = appServer(options);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  try {
    await fn(`http://127.0.0.1:${server.address().port}`);
  } finally {
    await new Promise((r) => server.close(r));
  }
}
test("serves app, denies private files and cross-origin requests, reports no-token honestly", async () => {
  await withServer(
    async (base) => {
      assert.equal((await fetch(base)).status, 200);
      const status = await (await fetch(base + "/api/status")).json();
      assert.equal(status.liveAvailable, false);
      for (const path of [
        "/.env",
        "/scripts/pick.py",
        "/../.env",
        "/%2e%2e/.env",
      ])
        assert.notEqual((await fetch(base + path)).status, 200);
      assert.equal(
        (
          await fetch(base + "/api/status", {
            headers: { Origin: "https://example.com" },
          })
        ).status,
        403,
      );
      const badHost = await new Promise((resolve, reject) => {
        const req = request(
          base + "/api/status",
          { headers: { Host: "evil.example" } },
          (res) => {
            res.resume();
            resolve(res.statusCode);
          },
        );
        req.on("error", reject);
        req.end();
      });
      assert.equal(badHost, 403);
      assert.equal(
        (
          await fetch(base + "/api/plans", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{}",
          })
        ).status,
        503,
      );
      assert.equal(
        (await fetch(base + "/api/create-order", { method: "POST" })).status,
        404,
      );
    },
    { tokenProvider: async () => "" },
  );
});
test("only fetched stores can be quoted; client-provided names or arbitrary fields are denied", async () => {
  const factory = () => ({
    async initialize() {},
    async call() {
      return [
        { storeCode: "123", storeName: "Test Store", businessStatus: true },
      ];
    },
  });
  await withServer(
    async (base) => {
      const post = (path, data) =>
        fetch(base + path, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
      assert.equal(
        (
          await post("/api/plans", {
            storeCode: "999",
            budgetFen: 3500,
            excluded: [],
          })
        ).status,
        400,
      );
      const stores = await (
        await post("/api/stores", { city: "上海", keyword: "人民广场" })
      ).json();
      assert.equal(stores.stores[0].code, "123");
      assert.equal(
        (
          await post("/api/plans", {
            storeCode: "123",
            budgetFen: 3500,
            excluded: [],
            withOrder: {},
          })
        ).status,
        400,
      );
    },
    { tokenProvider: async () => "test-placeholder", clientFactory: factory },
  );
});
