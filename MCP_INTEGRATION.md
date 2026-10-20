# MCP 接入与证据

## 已实现并验证

2026-10-20，使用个人 Token 连接 `https://mcp.mcd.cn`，发现 **35 个工具**；实际调用 `now-time-info`、`query-nearby-stores`、`query-meals`、`query-meal-detail` 和 `calculate-price`。

公开验收地点为上海人民广场，门店为“麦当劳上海黄浦华旭国际大厦餐厅”。读取 123 个在售餐品，首轮核价 6 份；筛选后候选包括 20.00 元、26.00 元、33.50 元餐单。另验证了不吃牛肉/辣味/冰饮时，选择实际热饮选项后重新核价。金额为 2026-10-20 17:58 左右快照，不是未来现价。

详见 [verification.md](docs/verification.md) 和脱敏[结构化记录](docs/live-verification.json)。原始返回及个人配置仅存在被忽略的 `.env` 和 `tmp/`，公开记录不含用户地址、账号或凭证。

## 实际调用链

1. Streamable HTTP `initialize` → `notifications/initialized`；支持 JSON 与 SSE。凭证仅发送到固定官方 HTTPS 地址，重定向拒绝。
2. `tools/list` 读取实际 Schema；`now-time-info` 验证连接和时段。
3. `query-nearby-stores`：`beType=1, searchType=2, city, keyword`。只搜索用户提供的公开地点，不查询收藏餐厅和会员地址。
4. `query-meals`：`storeCode, orderType=1, beType=1`。识别单人套餐并排除需随单购卡商品；当前仅到店自取，不传 `beCode`。
5. `query-meal-detail`：读取真实套餐分组和默认子项，只使用服务返回的编码、数量和特制键。没有合规默认搭配则跳过。
6. 用户不想要冰饮时，仅在当前分组中查找实际可选的热饮；没有可用选项就跳过，改变搭配必须重新核价。
7. `calculate-price`：携带整份套餐的 `roundList`、默认特制和 `needTableware=false`。本次实测返回的 `price` 为整数分；其他字段不能照搬这个单位规则。
8. 预算与标签筛选，主食多样性优先填充最多三个候选，用户自行选择或等概率抽选，再复制/导出卡片。应用不创建订单。

`lib/mcp-client.mjs` 实现实际连接，`lib/meals.mjs` 实现可售套餐与核价，`server.mjs` 只监听 127.0.0.1 并限制 Host/Origin；浏览器不获得 Token。

401/403 停止并提示更新 Token，429 停止当轮操作，超时和连接失败不无限重试。公开演示使用静态文件，不运行个人账号后端。

## 导入格式

真实模式导出到被忽略的 `tmp/quotes-live.json`，示例如下（文本和金额仅说明格式，时间须使用实际当次核价时间）：

```json
{
  "source": "mcp-calculate-price",
  "storeName": "实际门店名称",
  "fulfillment": "到店自取",
  "quotedAt": "2026-10-20T10:00:00Z",
  "options": [{
    "id": "实际套餐编码或当次餐单ID",
    "name": "实际餐单名称",
    "components": ["实际主食", "实际小食", "实际饮品"],
    "tags": ["chicken", "iced"],
    "amountFen": 2590,
    "quoteStatus": "official-quoted"
  }]
}
```

导入时验证预算、整数金额、来源类型和带时区的报价时间，排除未核价项与重复 ID。金额来源由输入方声明；浏览器与 Python CLI 不独立认证输入文件。菜单修改、报价超过五分钟均需重新核价，窗口不是官方价格保证。

## 业务价值与限制

减少面对大量菜单的决策负担，把随机选择约束在预算内及当前已核价候选中。当前每轮最多检查 8 个餐品，获得 6 个预算内报价后停止；不包含全量穷举、优惠券优化、购卡、预约或外送。文字标签不能替代过敏原信息。Node 本机链路、公开浏览器演示与合成测试分别记录，不混为同一种验证。
