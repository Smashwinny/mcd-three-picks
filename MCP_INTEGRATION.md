# MCP 集成说明

## 服务与状态

- 官方服务：`https://mcp.mcd.cn`，Streamable HTTP。
- 鉴权：`Authorization: Bearer ${MCD_MCP_TOKEN}`，只在个人客户端配置。
- 官方文档：https://github.com/M-China/mcd-mcp-server
- **现状：代码与 Skill 流程已提供，尚未取得个人 Token；真实连接、Schema 和端到端工具调用未验证。下面是实现采用的调用设计，不是已完成调用记录。**

## Skill 使用的工具

- `now-time-info`：知道当前日期和时段。
- `query-nearby-stores`：选择用户位置附近的门店。
- `query-meals`：所选门店当时可售菜单。
- `query-meal-detail`：套餐组件、规格和可换选项。
- `calculate-price`：完整餐单的官方应付报价。
- 外送可使用 `delivery-query-addresses` 和 `delivery-query-stores`，仅查询，不新增地址。

第一版最多六个候选，逐一核价后交给确定性的预算筛选和随机抽选程序。查询和核价都为只读；没有写操作。遇到 401 停止并提示配置凭证，429 停止当轮操作并提示稍后重试，不能无限循环。

业务价值：减少用户面对大量菜单的选择负担，同时把“随便选一份”限制在当前可售、已核价、预算内的候选里。

## 输入格式

Agent 必须从**当次真实工具返回**提取数据并保存至被忽略的 `tmp/quotes-live.json`，不可凭示例填入“真实”字段。以下仅为格式示例，金额不能用来代表现价，时间必须替换为真实核价时间：

```json
{
  "source": "mcp-calculate-price",
  "storeName": "实际返回的门店名称",
  "fulfillment": "到店自取",
  "quotedAt": "2026-10-14T12:00:00+08:00",
  "options": [
    {
      "id": "当次餐单唯一编号",
      "name": "实际返回并确认完整组成的餐单名称",
      "components": ["主食及规格", "小食及规格", "饮品及规格"],
      "amountFen": 0,
      "quoteStatus": "official-quoted"
    }
  ]
}
```

上例的 0 仅表示 JSON 整数类型示意，绝不代表真实免费餐。`amountFen` 须按实际返回字段的单位规范化；不同字段不能一概按同一单位处理。五分钟是本应用的展示限制，不是官方的价格保证。脚本仅信任输入方标记，不独立认证 MCP 响应。

## 待完成的真实验收

1. 连接后的 `tools/list` 与输入 Schema 验证。
2. 一家门店菜单、详情与三个候选餐单核价。
3. 门店、方式、餐品变化后的重新核价。
4. 无可用餐单、接口失败、报价超预算的真实处理。
5. 保留不含凭证和个人信息的验收记录；完成后更新 README 与本说明。

离线 Demo 及本地单元测试不能替代以上真实验收。
