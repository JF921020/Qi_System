import json
import re
import subprocess
from pathlib import Path

from django.contrib.staticfiles import finders
from django.test import TestCase
from django.urls import reverse



BASE_STATE = json.loads((Path(__file__).parent / "testdata/legacy_results.json").read_text(encoding="utf-8"))[0]["input"]


def calculate_js(state, catalog):
    result = subprocess.run(
        ["node", str(Path(__file__).parent / "testdata/calculation.cjs"), "--calculate"],
        input=json.dumps({"state": state, "catalog": catalog}),
        capture_output=True, text=True, encoding="utf-8", check=True,
    )
    return json.loads(result.stdout)


class MainPageTests(TestCase):
    def test_page_and_static_assets(self):
        response = self.client.get(reverse("main:index"))
        self.assertEqual(response.status_code, 200)
        self.assertTemplateUsed(response, "main/index.html")
        self.assertContains(response, "Qi無線充電預測工具")
        assets = (
            "qi-tool.css", "qi-tool-core.js", "qi-tool-layout.js",
            "qi-tool-calculation.js", "qi-tool-events.js",
            "qi-tool-history-data.js", "qi-tool-history.js",
            "qi-tool-advisor.js", "qi-tool-digitizer.js", "qi-tool-app.js",
        )
        for asset in assets:
            self.assertContains(response, f'/static/main/{asset}')
            self.assertIsNotNone(finders.find(f"main/{asset}"))
        self.assertIsNone(re.search(r'<input(?=[^>]*type="number")(?![^>]*min="0")[^>]*>', response.content.decode()))
        self.assertIsNone(re.search(r'on\w+="[^"]*\bevent\b', response.content.decode()))
        self.assertNotContains(response, "{%")

    def test_form_controls_have_accessible_labels(self):
        html = self.client.get(reverse("main:index")).content.decode()
        for tag in re.findall(r"<(?:input|select|textarea)\b[^>]*>", html):
            if re.search(r'\btype=["\']hidden["\']', tag):
                continue
            control_id = re.search(r'\bid=["\']([^"\']+)["\']', tag)
            self.assertIsNotNone(control_id, tag)
            if re.search(r'\baria-label(?:ledby)?=["\'][^"\']+["\']', tag):
                continue
            self.assertRegex(
                html, rf'<label\b[^>]*\bfor=["\']{re.escape(control_id.group(1))}["\']'
            )


class CalculationTests(TestCase):
    def test_browser_calculation(self):
        subprocess.run(["node", str(Path(__file__).parent / "testdata/calculation.cjs")], check=True)
        subprocess.run(["node", str(Path(__file__).parent / "testdata/request_flow.cjs")], check=True)

    def test_no_calculation_api(self):
        self.assertEqual(self.client.get("/api/main/").status_code, 404)
        self.assertNotContains(self.client.get(reverse("main:index")), "data-calculate-url")
