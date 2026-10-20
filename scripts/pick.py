#!/usr/bin/env python3
"""Select up to three affordable meal quotes and draw one; no network or orders."""
import argparse
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
import html
import json
from pathlib import Path
import secrets
import sys


def budget_fen(value):
    try:
        amount = Decimal(value)
        if not amount.is_finite() or amount <= 0 or amount * 100 != (amount * 100).to_integral_value():
            raise ValueError
        return int(amount * 100)
    except (InvalidOperation, ValueError):
        raise ValueError("预算必须是正数，最多保留两位小数") from None


def choose(payload, budget, *, demo=False, now=None, excluded=(), removed=()):
    if type(budget) is not int or budget <= 0:
        raise ValueError("预算必须是正整数分")
    if not isinstance(payload, dict) or not isinstance(payload.get("options"), list):
        raise ValueError("输入必须含 options 数组")
    if not payload.get("storeName") or not payload.get("fulfillment"):
        raise ValueError("输入必须说明门店和取餐方式")
    if demo:
        if payload.get("source") != "synthetic-demo":
            raise ValueError("演示模式只接受 synthetic-demo 数据")
    else:
        if payload.get("source") != "mcp-calculate-price":
            raise ValueError("真实模式只接受标记来自 MCP calculate-price 的报价")
        try:
            if not isinstance(payload.get("quotedAt"), str):
                raise ValueError
            stamp = datetime.fromisoformat(payload["quotedAt"].replace("Z", "+00:00"))
            if stamp.tzinfo is None:
                raise ValueError
            age = ((now or datetime.now(timezone.utc)) - stamp).total_seconds()
        except (KeyError, TypeError, ValueError):
            raise ValueError("报价必须含带时区的 quotedAt 时间") from None
        if not 0 <= age <= 300:
            raise ValueError("报价已超过应用的五分钟展示窗口，或时间在未来；请重新核价")
    eligible, seen = [], set()
    for option in payload["options"]:
        if not isinstance(option, dict):
            raise ValueError("options 的每项必须是对象")
        price = option.get("amountFen")
        if type(price) is not int or price < 0:
            raise ValueError("amountFen 必须是非负整数分")
        name, key = option.get("name"), option.get("id")
        if not isinstance(name, str) or not name.strip() or not isinstance(key, str) or not key:
            raise ValueError("餐单必须有非空字符串 id 和 name")
        expected = "demo-only" if demo else "official-quoted"
        tags = option.get("tags", [])
        if not isinstance(tags, list) or any(not isinstance(t, str) for t in tags):
            raise ValueError("tags 必须是文本数组")
        if option.get("quoteStatus") != expected or price > budget or key in seen or key in removed or any(t in excluded for t in tags):
            continue
        seen.add(key)
        eligible.append(option)
    # Prefer different main courses, then fill remaining slots; no global-optimum claim.
    ordered = sorted(eligible, key=lambda item: (item["amountFen"], item["id"]))
    shortlist, kinds = [], set()
    for item in ordered:
        kind = next((t for t in item.get("tags", []) if t in {"chicken", "beef", "fish", "breakfast", "wrap"}), None)
        if len(shortlist) < 3 and (kind is None or kind not in kinds):
            shortlist.append(item)
            if kind:
                kinds.add(kind)
    for item in ordered:
        if len(shortlist) < 3 and item not in shortlist:
            shortlist.append(item)
    if not shortlist:
        raise ValueError("没有预算内且符合报价状态的候选，请调整需求或重新核价")
    return {
        "mode": "synthetic-demo" if demo else "submitted-mcp-quotes",
        "storeName": payload["storeName"],
        "fulfillment": payload["fulfillment"],
        "budgetFen": budget,
        "shortlist": shortlist,
        "chosen": secrets.choice(shortlist),
        "notice": "演示为虚构餐品和价格" if demo else "来源标记由输入方提供，脚本不独立证明报价真实性；请以官方渠道实时结果为准",
    }


def share_card(result, path):
    esc = lambda value: html.escape(str(value), quote=True)
    money = lambda value: f"{value // 100}.{value % 100:02d}"
    lines = ["麦麦三选一", "离线演示 / 虚构数据" if result["mode"] == "synthetic-demo" else "输入报价整理 / 非官方产品",
             f"预算 {money(result['budgetFen'])} 元", result["storeName"], result["fulfillment"]]
    for item in result["shortlist"]:
        marker = "抽中了：" if item["id"] == result["chosen"]["id"] else "备选："
        lines.append(f"{marker}{item['name']} / {money(item['amountFen'])} 元")
    lines += ["只在这次提交的候选中选择，不自动下单", "餐品与价格以官方渠道实时结果为准"]
    height = 72 + len(lines) * 38
    texts = "".join(f'<text x="28" y="{48 + index * 38}" font-size="{24 if index == 0 else 16}">{esc(line)}</text>' for index, line in enumerate(lines))
    svg = f'<svg xmlns="http://www.w3.org/2000/svg" width="960" height="{height}" viewBox="0 0 960 {height}"><rect width="960" height="{height}" fill="#f6f3ec"/><g fill="#24323b" font-family="sans-serif">{texts}</g></svg>'
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    Path(path).write_text(svg, encoding="utf-8")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--demo", action="store_true", help="使用标注清楚的虚构数据")
    parser.add_argument("--input", type=Path, help="Agent 整理的当次核价 JSON")
    parser.add_argument("--budget", default="35", help="人民币元，例如 35.50")
    parser.add_argument("--exclude", default="", help="排除偏好标签，逗号分隔：beef,spicy,iced,breakfast")
    parser.add_argument("--card", type=Path, help="输出 SVG 分享卡")
    args = parser.parse_args()
    try:
        if not args.demo and args.input is None:
            raise ValueError("请选择 --demo 或用 --input 提交 MCP 核价结果")
        source = args.input or Path(__file__).resolve().parents[1] / "examples/demo-quotes.json"
        payload = json.loads(source.read_text(encoding="utf-8"))
        excluded = [t.strip() for t in args.exclude.split(",") if t.strip()]
        if any(t not in {"beef", "spicy", "iced", "breakfast"} for t in excluded):
            raise ValueError("存在不支持的偏好标签")
        result = choose(payload, budget_fen(args.budget), demo=args.demo, excluded=excluded)
        if args.card:
            share_card(result, args.card)
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0
    except (OSError, ValueError, TypeError) as error:
        print(f"无法选择：{error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
