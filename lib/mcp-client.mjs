const ENDPOINT = "https://mcp.mcd.cn";
export const READ_TOOLS = new Set([
  "now-time-info",
  "query-nearby-stores",
  "query-meals",
  "query-meal-detail",
  "calculate-price",
]);
export class McpError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}
export function unpack(result) {
  if (result.isError)
    throw new McpError(
      "BUSINESS",
      "官方工具未完成请求，请检查参数或当前供应。",
    );
  let body = result.structuredContent;
  if (!body) {
    const text = (result.content || [])
      .filter((x) => x.type === "text")
      .map((x) => x.text)
      .join("\n");
    const marker = text.indexOf("## Original Response");
    const candidates = [
      text.trim(),
      marker >= 0 ? text.slice(marker + 20).trim() : "",
    ];
    for (let raw of candidates) {
      raw = raw.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
      try {
        body = JSON.parse(raw);
        break;
      } catch {}
    }
  }
  if (!body || typeof body !== "object")
    throw new McpError("FORMAT", "工具返回格式无法识别，未使用猜测数据。");
  if (
    body.success === false ||
    (body.code && ![0, 200, "0", "200", "0000"].includes(body.code))
  )
    throw new McpError("BUSINESS", "当前门店或餐品不可用，请重新选择。");
  return Object.hasOwn(body, "data") ? body.data : body;
}
export class McpClient {
  constructor(token, fetcher = fetch) {
    if (!token)
      throw new McpError("TOKEN", "请先在本机 .env 配置 MCD_MCP_TOKEN。");
    this.token = token;
    this.fetcher = fetcher;
    this.sequence = 0;
    this.protocol = "2025-03-26";
  }
  async rpc(method, params = {}, notification = false) {
    const id = notification ? undefined : ++this.sequence;
    let response;
    try {
      response = await this.fetcher(ENDPOINT, {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(22000),
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          Authorization: `Bearer ${this.token}`,
          "MCP-Protocol-Version": this.protocol,
          ...(this.session ? { "Mcp-Session-Id": this.session } : {}),
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          ...(id === undefined ? {} : { id }),
          method,
          params,
        }),
      });
    } catch {
      throw new McpError("NETWORK", "连接麦当劳服务失败或超时，请稍后重试。");
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new McpError(
        response.status === 401 || response.status === 403
          ? "TOKEN"
          : response.status === 429
            ? "RATE_LIMIT"
            : "HTTP",
        response.status === 401 || response.status === 403
          ? "Token 无效或权限不足，请在本机更新。"
          : response.status === 429
            ? "查询频率过高，请稍后重试。"
            : `麦当劳服务暂不可用（HTTP ${response.status}）。`,
      );
    }
    if (method === "initialize")
      this.session = response.headers.get("mcp-session-id");
    if (notification) {
      await response.body?.cancel();
      return;
    }
    let reply;
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "",
      size = 0;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 4 * 1024 * 1024)
          throw new McpError("SIZE", "返回数据过大，请缩小范围。");
        buffer += decoder.decode(value, { stream: true });
        if (
          response.headers.get("content-type")?.includes("text/event-stream")
        ) {
          let match;
          while ((match = /\r?\n\r?\n/.exec(buffer))) {
            const event = buffer.slice(0, match.index);
            buffer = buffer.slice(match.index + match[0].length);
            const data = event
              .split(/\r?\n/)
              .filter((x) => x.startsWith("data:"))
              .map((x) => x.slice(5).trimStart())
              .join("\n");
            if (!data) continue;
            const parsed = JSON.parse(data);
            reply = (Array.isArray(parsed) ? parsed : [parsed]).find(
              (x) => x.id === id,
            );
            if (reply) break;
          }
          if (reply) break;
        }
      }
      if (!reply) {
        const parsed = JSON.parse(buffer + decoder.decode());
        reply = (Array.isArray(parsed) ? parsed : [parsed]).find(
          (x) => x.id === id,
        );
      }
    } catch (error) {
      if (error instanceof McpError) throw error;
      throw new McpError("FORMAT", "MCP 响应不完整或格式发生变化。");
    } finally {
      await reader.cancel().catch(() => {});
    }
    if (!reply || reply.error || !reply.result)
      throw new McpError("RPC", "MCP 调用失败，请检查工具参数。");
    return reply.result;
  }
  async initialize() {
    const info = await this.rpc("initialize", {
      protocolVersion: this.protocol,
      capabilities: {},
      clientInfo: { name: "mcd-three-picks", version: "0.2.0" },
    });
    this.protocol = info.protocolVersion;
    await this.rpc("notifications/initialized", {}, true);
    return info;
  }
  async tools() {
    const all = [];
    let cursor;
    do {
      const page = await this.rpc("tools/list", cursor ? { cursor } : {});
      all.push(...page.tools);
      cursor = page.nextCursor;
      if (all.length > 200) throw new McpError("TOOLS", "工具列表过大。");
    } while (cursor);
    return all;
  }
  async call(name, args) {
    if (!READ_TOOLS.has(name))
      throw new McpError("DENIED", "本项目仅允许菜单、门店、时间和核价查询。");
    return unpack(await this.rpc("tools/call", { name, arguments: args }));
  }
}
