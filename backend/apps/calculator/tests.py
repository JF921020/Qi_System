import copy
import json
import math
from pathlib import Path

from django.contrib.staticfiles import finders
from django.test import Client, SimpleTestCase
from django.urls import reverse

from .service import calculate

class CalculatorPageTests(SimpleTestCase):
    def test_page_and_static_assets(self):
        response = self.client.get(reverse("calculator:index"))
        self.assertEqual(response.status_code, 200)
        self.assertTemplateUsed(response, "calculator/index.html")
        self.assertContains(response, "Qi無線充電預測工具")
        for asset in ("qi-tool.css", "qi-tool.js"):
            self.assertContains(response, f'/static/calculator/{asset}')
            self.assertIsNotNone(finders.find(f"calculator/{asset}"))
        self.assertNotContains(response, "{%")


class CalculationTests(SimpleTestCase):
    cases = json.loads((Path(__file__).parent / "testdata/legacy_results.json").read_text(encoding="utf-8"))

    def payload(self, **overrides):
        return {"state": {**self.cases[0]["input"], **overrides}}

    def test_original_javascript_parity(self):
        for case in self.cases:
            with self.subTest(input=case["input"]):
                actual = calculate({"state": case["input"]})
                for field in ("coilEff", "sysEffPct", "rxIcEff", "chargerIcEff", "Qrx", "rxACR", "pInTotal", "totalLoss", "pOut", "chargeCurrentA"):
                    if case["expected"][field] is None:
                        self.assertIsNone(actual[field])
                    else:
                        self.assertAlmostEqual(actual[field], case["expected"][field], places=10)
                if actual["pInTotal"] is not None:
                    self.assertAlmostEqual(actual["pInTotal"], actual["pOut"] + actual["coilLoss"] + actual["icLoss"])

    def test_api_validation_and_csrf(self):
        url = reverse("calculator:calculate")
        self.assertEqual(self.client.get(url).status_code, 405)
        self.assertEqual(self.client.post(url, "bad", content_type="text/plain").status_code, 415)
        for invalid in ("{", "[]", "null", '{"state":{}}'):
            self.assertEqual(self.client.post(url, invalid, content_type="application/json").status_code, 400)
        for field, value in (("rxR", 0), ("kVal", 1.1), ("rxL", -1), ("sysPower", True), ("rxIcSelect", "unknown"), ("freq", float("nan")), ("batMaxC", float("inf")), ("batVoltage", "3.7")):
            with self.subTest(field=field):
                response = self.client.post(url, self.payload(**{field: value}), content_type="application/json")
                self.assertEqual(response.status_code, 400)
        client = Client(enforce_csrf_checks=True)
        self.assertEqual(client.post(url, self.payload(), content_type="application/json").status_code, 403)
        client.get(reverse("calculator:index"))
        response = client.post(url, self.payload(), content_type="application/json", HTTP_X_CSRFTOKEN=client.cookies["csrftoken"].value)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["modelVersion"], "lqk-v1")

    def test_zero_efficiency_and_independent_requests(self):
        payload = self.payload()
        unchanged = copy.deepcopy(payload)
        original = calculate(payload)
        for overrides in ({"kVal": 0}, {"rxIcSelect": "custom", "rxIcEff": 0}):
            result = calculate(self.payload(**overrides))
            self.assertIsNone(result["pInTotal"])
            self.assertTrue(result["warnings"])
            json.dumps(result, allow_nan=False)
        self.assertEqual(calculate(self.payload(sysPower=0, kVal=0))["pInTotal"], 0)
        self.assertEqual(calculate(payload), original)
        self.assertEqual(payload, unchanged)

    def test_custom_curves_and_server_owned_builtins(self):
        curve = {"axis": "power", "data": [[0, 70], [2, 80], [4, 90]]}
        payload = self.payload(rxIcSelect="custom_test", sysPower=3)
        payload["customCurves"] = {"rx": curve}
        self.assertEqual(calculate(payload)["rxIcEff"], 85)
        payload["state"]["sysPower"] = 5
        self.assertEqual(calculate(payload)["rxIcEff"], 90)
        payload["state"]["rxIcSelect"] = "cps4019"
        self.assertEqual(calculate(payload)["rxIcEff"], 84)
        payload["state"]["rxIcSelect"] = "custom_test"
        for points in ([[0, 70], [0, 80], [4, 90]], [[0, 70], [2, 101], [4, 90]], [[0, 70]], [[0, 70], [2, 80], [math.inf, 90]]):
            curve["data"] = points
            with self.assertRaises(ValueError):
                calculate(payload)
