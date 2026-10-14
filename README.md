# 麦麦三选一 · mcd-three-picks

想吃麦当劳，却不想翻一百个餐品？把选择缩成三个，再随机选一个。

面向选择困难的学生、打工人和单人用餐用户。这个初版提供 Agent Skill 调用流程、可运行的筛选抽选脚本及 SVG 分享卡。先把一个小功能做通，后续再完善交互。

> 麦当劳 MCP 创意开发大赛参赛作品，非麦当劳官方产品。**当前已完成离线演示与本地测试；尚未配置个人 MCP Token，真实接口连接和完整 Skill 流程待验证。** 不申请 WorkBuddy 专项奖励。

## 30 秒体验

只需 Python 3.9+，无第三方依赖，不用 Token：

```bash
git clone https://github.com/Smashwinny/mcd-three-picks.git
cd mcd-three-picks
python3 scripts/pick.py --demo --budget 35 --card tmp/demo-card.svg
```

终端输出最多三个预算内选项和随机抽中项。打开 `tmp/demo-card.svg` 查看分享卡。示例店、餐品和价格均为虚构，不代表任何真实门店。

## 怎么接真实 MCP

1. 按[麦当劳官方指引](https://github.com/M-China/mcd-mcp-server)申请个人 Token，并在支持 MCP / Skill 的客户端中配置 `https://mcp.mcd.cn`。
2. 参考 `mcp-config.example.json`，凭证只保存在个人客户端或本机环境变量。部分客户端不自动展开环境变量，占位符配置请按其文档处理。
3. 将项目放入客户端的 Skill 目录，保留 `SKILL.md`、`scripts/`、`examples/` 和集成说明的相对位置；各客户端安装位置以其文档为准。
4. 说：“麦麦三选一，预算 35 元，到店自取，不想吃牛肉。”Agent 按 Skill 查询真实菜单和套餐详情，并逐候选官方核价；缺位置或门店时先补齐。
5. Agent 将当次报价传给本地脚本，输出三选一结果和分享卡。你在官方渠道自行核对、下单。

脚本自身**不连接 MCP**，真实调用由具备官方 MCP 连接器的 Agent 执行。没有 Token 或连接器时不能完成真实流程；输入文件的来源标记也不能代替独立的真实性验证。

## 初版功能与限制

- 预算以人民币元输入，内部金额统一为整数分。
- 从本次提交且核价成功的候选中取最低价的最多三个，随机选出一份；可少于三个。
- 排除超预算、未核价、重复 ID、已超过应用五分钟展示窗口的报价。
- 分享卡清楚区分演示和输入报价，不含用户地址与凭证。
- 只读，无自动下单、领券、购卡、积分兑换或抽奖。
- 初版由 Agent 判断完整餐单和偏好，脚本不独立验证营养、过敏原、套餐组成或报价来源，不承诺全局最优。

## 验证

```bash
python3 -m unittest discover -s tests -v
```

本地 10 项测试覆盖预算、真实/演示隔离、未核价过滤、空候选、金额类型、重复、过期与新鲜输入、卡片转义和精度。真实 MCP 调用不在这组测试的验证范围内。

## 目录与后续

- `SKILL.md`：Agent 的实际工具编排步骤与边界。
- `scripts/pick.py`：预算筛选、随机抽选与 SVG 分享卡。
- `examples/demo-quotes.json`：公开的虚构演示数据。
- `MCP_INTEGRATION.md`：工具、调用链、输入格式与待验证项。
- `CONTEST_DECLARATION.md`：官方原文，保持不变。

后续优先补齐个人 Token 只读接入实测、可复现的脱敏核价记录和简单界面。项目输出只供参考，餐品、供应与价格以官方实时结果为准。

原创代码按 MIT License 发布；官方参赛声明、商标与官方资料的权利不因本许可证转移。
