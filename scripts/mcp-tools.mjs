import { readFile, writeFile, mkdir } from "node:fs/promises";
import { McpClient } from "../lib/mcp-client.mjs";
import { loadToken } from "../lib/config.mjs";
try {
  const client = new McpClient(await loadToken());
  await client.initialize();
  const tools = await client.tools();
  await mkdir("tmp", { recursive: true });
  await writeFile("tmp/mcp-tools.json", JSON.stringify(tools, null, 2));
  console.log("Connected; tools:", tools.length);
  for (const name of [
    "now-time-info",
    "query-nearby-stores",
    "query-meals",
    "query-meal-detail",
    "calculate-price",
  ]) {
    const tool = tools.find((t) => t.name === name);
    console.log(name, JSON.stringify(tool?.inputSchema));
  }
  const time = await client.call("now-time-info", {});
  console.log("Read-only time query:", JSON.stringify(time));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
