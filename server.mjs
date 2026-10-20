import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve, sep, extname } from "node:path";
import { McpClient, McpError } from "./lib/mcp-client.mjs";
import { loadToken } from "./lib/config.mjs";
import { mealPlans } from "./lib/meals.mjs";
const ROOT = fileURLToPath(new URL("./docs/", import.meta.url));
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webm": "video/webm",
};
export function appServer({
  tokenProvider = loadToken,
  clientFactory = (token) => new McpClient(token),
} = {}) {
  let busy = false;
  const stores = new Map();
  return createServer(async (req, res) => {
    const host = req.headers.host || "",
      port = req.socket.localPort;
    const hosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
    const headers = {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "Content-Security-Policy":
        "default-src 'self'; img-src 'self' https://menu-img.mcd.cn; style-src 'self'; script-src 'self'; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'",
    };
    const send = (status, data) => {
      res.writeHead(status, {
        ...headers,
        "Content-Type": "application/json; charset=utf-8",
      });
      res.end(JSON.stringify(data));
    };
    try {
      if (
        !hosts.has(host) ||
        req.headers["sec-fetch-site"] === "cross-site" ||
        (req.headers.origin && !hosts.has(new URL(req.headers.origin).host))
      )
        return send(403, { error: "仅允许本机同源访问。" });
      const url = new URL(req.url, `http://${host}`);
      if (url.pathname === "/api/status" && req.method === "GET")
        return send(200, {
          liveAvailable: Boolean(await tokenProvider()),
          version: "0.2.0",
        });
      if (url.pathname.startsWith("/api/")) {
        if (
          req.method !== "POST" ||
          !["/api/stores", "/api/plans"].includes(url.pathname)
        )
          return send(404, { error: "不支持这个接口。" });
        if (!req.headers["content-type"]?.startsWith("application/json"))
          return send(415, { error: "请求需要 JSON 格式。" });
        let body = "",
          size = 0;
        for await (const chunk of req) {
          size += chunk.length;
          if (size > 8000) return send(413, { error: "请求太大。" });
          body += chunk;
        }
        let args;
        try {
          args = JSON.parse(body);
        } catch {
          return send(400, { error: "JSON 格式不正确。" });
        }
        if (!args || typeof args !== "object" || Array.isArray(args))
          return send(400, { error: "请求参数应为对象。" });
        if (busy) return send(429, { error: "正在核价，请等待本轮完成。" });
        const token = await tokenProvider();
        if (!token)
          return send(503, {
            error: "本机尚未配置麦当劳 Token，请参考 README。",
          });
        busy = true;
        try {
          const client = clientFactory(token);
          await client.initialize();
          if (url.pathname === "/api/stores") {
            if (
              Object.keys(args).some((x) => !["city", "keyword"].includes(x)) ||
              typeof args.city !== "string" ||
              !args.city.trim() ||
              args.city.length > 30 ||
              typeof args.keyword !== "string" ||
              !args.keyword.trim() ||
              args.keyword.length > 80
            )
              return send(400, { error: "请填写城市和地点关键词。" });
            const data = await client.call("query-nearby-stores", {
              beType: 1,
              searchType: 2,
              city: args.city.trim(),
              keyword: args.keyword.trim(),
            });
            if (!Array.isArray(data))
              throw new McpError("FORMAT", "门店列表格式无法识别。");
            stores.clear();
            const list = data
              .filter(
                (x) =>
                  x.businessStatus === true &&
                  typeof x.storeCode === "string" &&
                  /^\d+$/.test(x.storeCode) &&
                  typeof x.storeName === "string",
              )
              .slice(0, 6)
              .map((x) => ({
                code: x.storeCode,
                name: x.storeName,
                address: typeof x.address === "string" ? x.address : "",
                hours: `${x.businessStartTime || "?"}-${x.businessEndTime || "?"}`,
              }));
            for (const s of list) stores.set(s.code, { ...s, at: Date.now() });
            return send(200, { stores: list });
          }
          if (
            Object.keys(args).some(
              (x) => !["storeCode", "budgetFen", "excluded"].includes(x),
            ) ||
            !Number.isSafeInteger(args.budgetFen) ||
            args.budgetFen < 1 ||
            args.budgetFen > 999999 ||
            !Array.isArray(args.excluded) ||
            args.excluded.some(
              (x) => !["beef", "spicy", "iced", "breakfast"].includes(x),
            )
          )
            return send(400, { error: "预算或筛选条件无效。" });
          const store = stores.get(args.storeCode);
          if (!store || Date.now() - store.at > 30 * 60 * 1000)
            return send(400, { error: "请先搜索并选择一家门店。" });
          return send(
            200,
            await mealPlans(client, {
              storeCode: store.code,
              storeName: store.name,
              budgetFen: args.budgetFen,
              excluded: args.excluded,
            }),
          );
        } finally {
          busy = false;
        }
      }
      if (req.method !== "GET" && req.method !== "HEAD")
        return send(405, { error: "不支持此方法。" });
      const pathname = decodeURIComponent(url.pathname);
      const path = resolve(
        ROOT,
        "." + (pathname === "/" ? "/index.html" : pathname),
      );
      if (
        !path.startsWith(ROOT) ||
        pathname.split("/").some((x) => x.startsWith(".")) ||
        !MIME[extname(path)]
      )
        return send(404, { error: "文件不存在。" });
      const data = await readFile(path);
      res.writeHead(200, { ...headers, "Content-Type": MIME[extname(path)] });
      res.end(req.method === "HEAD" ? undefined : data);
    } catch (error) {
      send(error instanceof McpError ? 502 : 500, {
        error:
          error instanceof McpError ? error.message : "请求未完成，请重试。",
        ...(error instanceof McpError ? { code: error.code } : {}),
      });
    }
  });
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const port = Number(process.env.PORT || 4319);
  const server = appServer();
  server.listen(port, "127.0.0.1", () =>
    console.log(`麦麦三选一 → http://127.0.0.1:${port}`),
  );
  server.on("error", (error) => {
    console.error(error.code === "EADDRINUSE" ? "端口已占用，请用 PORT 指定其他端口。" : `启动失败（${error.code || "UNKNOWN"}），请检查运行环境权限。`);
    process.exitCode = 1;
  });
}
