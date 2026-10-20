# 麦麦三选一

**午餐，就别纠结了。** 预算你来定，选项我们减。最多给你三份，再随机选一份。

[打开免 Token 演示](https://smashwinny.github.io/mcd-three-picks/) · [真实 MCP 验收记录](docs/verification.md) · [接入说明](MCP_INTEGRATION.md) · [报名成功确认](https://github.com/M-China/mcd-developer-innovation-challenge/issues/691#issuecomment-6165770560)

为选择困难的学生、打工人和单人用餐用户做的小工具。预算和“不想吃什么”确定后，只留下三个可能：可以自己点一份，也可以让随机抽选帮你结束纠结。支持下载一张午餐分享卡。

> 非麦当劳官方产品，2026 MCP 创意开发大赛参赛作品。公开演示使用**明确标注的虚构数据**；本机模式已完成官方 MCP 选店、菜单、套餐详情和核价链路验收，详见记录。不自动下单，不申请 WorkBuddy 专项奖励。

## 三种体验

- **先试一试**：9 份虚构餐单，预算筛选、不吃牛肉/辣味/冰饮/早餐类、主食多样性优先、换一组、等概率抽选、复制餐单和下载 SVG 卡。无需登录和 Token。
- **本机真实选餐**：自己的 Token 保留在本机服务端。搜索城市和地点，选门店，读取当前可售套餐及默认搭配，并逐份 `calculate-price` 核价。尽量从服务返回的实际选项中换热饮，重新试算；没有合规选项则跳过。
- **导入核价餐单**：从 Agent 或本机服务导出的 JSON 载入浏览器，继续筛选和抽选。导入文件的来源由提供方声明，浏览器不独立认证。

公开演示只承载演示和导入功能，不接收个人 Token，也不代理任何人的会员账号。真实接口需本机启动。

## 本机启动

Node.js **22+**，零第三方运行依赖，**不需要 npm install**：

```bash
git clone https://github.com/Smashwinny/mcd-three-picks.git
cd mcd-three-picks
npm start
```

打开 `http://127.0.0.1:4319`。也可用 `PORT=4320 npm start` 切换端口。服务仅监听本机，不要直接暴露到公网。

## 真实选餐

1. 到 https://open.mcd.cn/mcp 登录（当前页面支持扫码），在控制台自行激活、阅读并决定是否同意服务协议。
2. 创建项目根目录的 `.env`，填入 `MCD_MCP_TOKEN=你的个人Token`。这个文件已被 Git 忽略；不要把它发到聊天、Issue 或仓库。
3. 启动本机服务，在“本机真实选餐”中填写**你选择的城市和地点**，找门店后点击一家。
4. 等待本轮核价完成，比较最多三个预算内候选并抽选。套餐名称、规格与实际应付均来自本轮服务返回，最后在官方渠道自行核对和点餐。

接入自检：`node scripts/mcp-tools.mjs`，进行初始化、工具发现和时间查询。工具 Schema 保存到被忽略的 `tmp/`。配置示例见 `mcp-config.example.json`，客户端是否自动展开占位符以其文档为准。

完整真实验收命令：`node scripts/verify-live.mjs`，默认使用公开地点上海人民广场，不读取会员私人地址；输出在 `tmp/`，不会提交。

## 用作 Agent Skill

将本项目放入支持 Skill 的客户端目录，保留相对文件结构；在客户端配置官方 MCP 连接器后，使用仓库 `SKILL.md`。

> 麦麦三选一，预算 35 元，到店自取，不想吃牛肉。先问我要选哪家门店。

CLI 仍可独立使用（Python 3.9+，无依赖）：

```bash
python3 scripts/pick.py --demo --budget 35 --exclude beef,spicy --card tmp/demo-card.svg
python3 scripts/pick.py --input tmp/quotes-live.json --budget 35 --card tmp/meal-card.svg
```

## 实现与验证

- 原生 HTML/CSS/JavaScript；移动端竖排餐单，键盘可操作，尊重“减少动态效果”设置。
- Web Crypto 无取模偏差的等概率抽选；每份候选机会相同，不做付费抽取。
- 内部金额统一为整数分；只将成功核价餐单作为真实候选，报价过期后隐藏旧金额。
- 本机后端固定连接 `https://mcp.mcd.cn`，禁止凭证跟随跳转；工具白名单仅包括时间、门店、菜单、详情和核价。
- 真实选店来自当次搜索，默认仅到店自取；没有券优化、预约、外送、下单或账户写操作。
- 每轮检查最多 8 个候选，获得 6 个预算内报价后提前结束，不承诺全菜单最优。
- 27 项自动化测试（17 项 Node + 10 项 Python）；浏览器验证与真实调用范围见[验收记录](docs/verification.md)。

```bash
npm run check
npm test
python3 -m unittest discover -s tests -v
```

## 边界说明

筛选依据餐品文字与标签，**不能用于判断过敏原**。未知组成、默认选配缺失、核价失败的餐单跳过，不用展示价补造实付。五分钟为本应用展示窗口，不是官方价格保证；换店和改条件后应重新核价。本机真实查询的结果也只代表当时门店与候选范围。

前端不储存历史或凭证；分享内容只包含所选餐单、门店、金额及来源提示。请自行确认导入文件不含个人信息。

原创代码采用 MIT License；官方参赛声明保持原文不变，商标和官方素材的权利不因本许可证转移。餐品、价格和供应以官方实时渠道为准。
