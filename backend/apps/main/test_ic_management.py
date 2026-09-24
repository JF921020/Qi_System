import json

from django.contrib.auth import get_user_model
from django.test import Client, TestCase
from django.urls import reverse

from .models import ICSetting
from .tests import CalculationTests


class ICManagementTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.staff = get_user_model().objects.create_user(username="manager", is_staff=True)

    def data(self, **overrides):
        return {
            "name": "測試設定", "model_number": "TEST-01", "mode": "curve",
            "axis": "power", "points": "[[0, 60], [2, 80], [4, 90]]",
            "efficiency": "", "provisional": "on", "source": "測試條件",
            **overrides,
        }

    def test_seed_and_separate_lists(self):
        self.assertEqual(ICSetting.objects.count(), 12)
        for kind, own, other in [("rx", "CPS4019", "MP2733GQC-C04L"), ("charger", "MP2733GQC-C04L", "CPS4019")]:
            response = self.client.get(reverse("main:ic-list", args=[kind]))
            self.assertContains(response, own)
            self.assertNotContains(response, other)
        self.assertEqual(self.client.get("/ics/unknown/").status_code, 404)

    def test_named_crud_and_database_lookup(self):
        self.client.force_login(self.staff)
        for kind in ("rx", "charger"):
            response = self.client.post(reverse("main:ic-new", args=[kind]), self.data())
            self.assertEqual(response.status_code, 302)
            item = ICSetting.objects.get(kind=kind, name="測試設定")
            self.assertTrue(item.provisional)
            self.assertEqual(item.points, [[0, 60], [2, 80], [4, 90]])
            self.assertContains(self.client.get(reverse("main:index")), item.code)
            field = "rxIc" if kind == "rx" else "chargerIc"
            payload = {"state": {**CalculationTests.cases[0]["input"], field + "Select": item.code, "sysPower": 3}}
            result = self.client.post(reverse("main:main"), payload, content_type="application/json")
            self.assertEqual(result.status_code, 200)
            self.assertEqual(result.json()[field + "Eff"], 85)
            self.assertIn("暫定", result.json()["rxTip" if kind == "rx" else "chargerTip"])
            edit_url = reverse("main:ic-edit", args=[kind, item.pk])
            self.assertEqual(self.client.post(edit_url, self.data(name="已改名", mode="fixed", efficiency="77", points="", provisional="")).status_code, 302)
            item.refresh_from_db()
            self.assertEqual(item.name, "已改名")
            self.assertFalse(item.provisional)
            self.assertEqual(item.points, [])
            result = self.client.post(reverse("main:main"), payload, content_type="application/json")
            self.assertEqual(result.json()[field + "Eff"], 77)
            self.assertNotIn("暫定", result.json()["rxTip" if kind == "rx" else "chargerTip"])
            delete_url = reverse("main:ic-delete", args=[kind, item.pk])
            self.assertEqual(self.client.get(delete_url).status_code, 200)
            self.assertTrue(ICSetting.objects.filter(pk=item.pk).exists())
            self.assertEqual(self.client.post(delete_url).status_code, 302)
            self.assertEqual(self.client.post(reverse("main:main"), payload, content_type="application/json").status_code, 400)

    def test_invalid_data_and_duplicate_names(self):
        self.client.force_login(self.staff)
        url = reverse("main:ic-new", args=["rx"])
        invalid = [
            {"points": "[[0,70],[0,80],[2,90]]"},
            {"points": "[[0,70],[1,101],[2,90]]"},
            {"points": "[[0,70],[1,80]]"},
            {"points": "null"}, {"points": "not json"},
            {"points": "[[false,70],[1,80],[2,90]]"},
            {"mode": "fixed", "efficiency": "NaN"},
            {"mode": "fixed", "efficiency": "101"},
            {"mode": "fixed", "efficiency": ""},
            {"name": ""}, {"axis": "unknown"},
        ]
        for values in invalid:
            with self.subTest(values=values):
                response = self.client.post(url, self.data(**values))
                self.assertEqual(response.status_code, 200)
                self.assertTrue(response.context["form"].errors)
        self.assertEqual(ICSetting.objects.count(), 12)
        self.client.post(url, self.data())
        response = self.client.post(url, self.data())
        self.assertIn("name", response.context["form"].errors)
        self.assertEqual(ICSetting.objects.filter(name="測試設定").count(), 1)

    def test_permissions_csrf_and_kind_isolation(self):
        item = ICSetting.objects.get(code="cps4019")
        urls = [reverse("main:ic-new", args=["rx"]), reverse("main:ic-edit", args=["rx", item.pk]), reverse("main:ic-delete", args=["rx", item.pk])]
        for url in urls:
            self.assertEqual(self.client.post(url, self.data()).status_code, 302)
        user = get_user_model().objects.create_user(username="viewer")
        self.client.force_login(user)
        for url in urls:
            self.assertEqual(self.client.post(url, self.data()).status_code, 302)
        self.client.force_login(self.staff)
        self.assertEqual(self.client.post(reverse("main:ic-delete", args=["charger", item.pk])).status_code, 404)
        secure = Client(enforce_csrf_checks=True)
        secure.force_login(self.staff)
        for url in urls:
            self.assertEqual(secure.post(url, self.data()).status_code, 403)
        self.assertEqual(ICSetting.objects.count(), 12)

    def test_database_overrides_original_catalog_and_zero_fixed(self):
        self.client.force_login(self.staff)
        item = ICSetting.objects.get(code="cps4019")
        self.client.post(reverse("main:ic-edit", args=["rx", item.pk]), self.data(mode="fixed", efficiency="0", points=""))
        payload = {"state": {**CalculationTests.cases[0]["input"], "rxIcSelect": "cps4019"}, "customCurves": {"rx": {"axis": "power", "data": [[0,100],[1,100],[2,100]]}}}
        response = self.client.post(reverse("main:main"), json.dumps(payload), content_type="application/json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["rxIcEff"], 0)
        self.assertIsNone(response.json()["pInTotal"])
