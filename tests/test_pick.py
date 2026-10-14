import importlib.util
import json
from pathlib import Path
from datetime import datetime, timezone
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("pick", ROOT / "scripts/pick.py")
pick = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pick)


class PickerTests(unittest.TestCase):
    def setUp(self):
        self.demo = json.loads((ROOT / "examples/demo-quotes.json").read_text())

    def test_budget_filter_and_draw(self):
        result = pick.choose(self.demo, 3000, demo=True)
        self.assertEqual([x["id"] for x in result["shortlist"]], ["demo-a", "demo-b"])
        self.assertIn(result["chosen"], result["shortlist"])

    def test_demo_cannot_enter_live_mode(self):
        with self.assertRaises(ValueError):
            pick.choose(self.demo, 3500)

    def test_unknown_quotes_are_excluded(self):
        self.demo["options"][0]["quoteStatus"] = "unknown"
        result = pick.choose(self.demo, 3500, demo=True)
        self.assertNotIn("demo-a", [x["id"] for x in result["shortlist"]])

    def test_empty_budget_has_no_fake_result(self):
        with self.assertRaises(ValueError):
            pick.choose(self.demo, 100, demo=True)

    def test_no_float_money(self):
        self.demo["options"][0]["amountFen"] = 25.9
        with self.assertRaises(ValueError):
            pick.choose(self.demo, 3500, demo=True)

    def test_duplicate_candidates(self):
        self.demo["options"].append(self.demo["options"][0].copy())
        result = pick.choose(self.demo, 3500, demo=True)
        self.assertEqual(len({x["id"] for x in result["shortlist"]}), 3)

    def test_expired_quote_is_rejected(self):
        self.demo.update(source="mcp-calculate-price", quotedAt="2026-10-14T00:00:00Z")
        with self.assertRaises(ValueError):
            pick.choose(self.demo, 3500, now=datetime(2026, 10, 14, 1, tzinfo=timezone.utc))

    def test_fresh_input_quotes(self):
        self.demo.update(source="mcp-calculate-price", quotedAt="2026-10-14T01:00:00Z")
        for item in self.demo["options"]:
            item["quoteStatus"] = "official-quoted"
        result = pick.choose(self.demo, 3500, now=datetime(2026, 10, 14, 1, 1, tzinfo=timezone.utc))
        self.assertEqual(result["mode"], "submitted-mcp-quotes")

    def test_card_escapes_text(self):
        result = pick.choose(self.demo, 3500, demo=True)
        result["storeName"] = "<script>"
        (ROOT / "tmp").mkdir(exist_ok=True)
        with tempfile.TemporaryDirectory(dir=ROOT / "tmp") as folder:
            path = Path(folder) / "card.svg"
            pick.share_card(result, path)
            self.assertIn("&lt;script&gt;", path.read_text())
            self.assertIn("虚构数据", path.read_text())

    def test_budget_precision(self):
        self.assertEqual(pick.budget_fen("35.50"), 3550)
        for amount in ["NaN", "Infinity", "0", "-1", "1.001"]:
            with self.assertRaises(ValueError):
                pick.budget_fen(amount)


if __name__ == "__main__":
    unittest.main()
