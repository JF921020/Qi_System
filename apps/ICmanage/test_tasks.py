import json
from importlib import import_module
from io import BytesIO
from pathlib import Path
from subprocess import run
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from django.contrib.auth import get_user_model
from django.contrib.messages import get_messages
from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import IntegrityError, transaction
from django.test import TestCase
from django.urls import reverse
from openpyxl import Workbook

from .forms import ICImportForm
from .models import ICSetting
from .views import add_save_error


class VoltageImportTests(TestCase):
    def setUp(self):
        self.client.force_login(get_user_model().objects.create_user(username="task-manager", is_staff=True))
        self.url = reverse("ICmanage:ic-import", args=["rx"])

    def upload(self, voltage="", with_column=True, filename="Rx_Test_3.8V.csv"):
        text = "voltage_v,current_ma,efficiency_percent\n3.8,0,0\n3.8,100,85.1234\n3.8,200,90"
        if not with_column:
            text = "current_ma,efficiency_percent\n0,0\n100,85.1234\n200,90"
        return self.client.post(self.url, {
            "voltage": voltage, "file": SimpleUploadedFile(filename, text.encode()),
        })

    def test_manual_and_auto_voltage_csv(self):
        for with_column, voltage in [(True, ""), (True, "3.8"), (False, "3.8")]:
            with self.subTest(with_column=with_column, voltage=voltage):
                response = self.upload(voltage, with_column)
                self.assertEqual(response.status_code, 302)
                item = ICSetting.objects.get(name="Test_3.8V")
                self.assertEqual(item.voltage, 3.8)
                self.assertEqual(item.model_number, "Test")
                self.assertEqual(item.points, [[0, 0], [100, 85.1234], [200, 90]])
                item.delete()

    def test_missing_mixed_and_invalid_voltage_do_not_save(self):
        before = ICSetting.objects.count()
        self.assertContains(self.upload(with_column=False), "檔案沒有電壓欄")
        for voltage in ("0", "-1", "NaN", "Infinity", "1000001"):
            self.assertEqual(self.upload(voltage).status_code, 200)
        text = "voltage_v,current_ma,efficiency_percent\n3.8,0,80\n5,100,85\n3.8,200,90"
        response = self.client.post(self.url, {"file": SimpleUploadedFile("Mixed.csv", text.encode())})
        self.assertContains(response, "至少需要 3 筆")
        self.assertEqual(ICSetting.objects.count(), before)

    def test_auto_voltage_excel(self):
        workbook = Workbook()
        sheet = workbook.active
        sheet.title = "Rx_Excel_3.8V"
        sheet.append(["工作電壓 (V)", "Iout (mA)", "效率 (%)"])
        for x in (0, 100, 200):
            sheet.append([3.8, x, 80])
        buffer = BytesIO()
        workbook.save(buffer)
        response = self.client.post(self.url, {
            "worksheet": sheet.title, "file": SimpleUploadedFile("data.xlsx", buffer.getvalue()),
        })
        self.assertEqual(response.status_code, 302)
        self.assertEqual(ICSetting.objects.get(name="Excel_3.8V").voltage, 3.8)

    def batch_upload(self, text=None):
        text = text or "VIN (V),VBAT (V),current_ma,efficiency_percent\n" + "\n".join(
            f"5,{voltage},{current},{80 + current / 100}" for voltage in (4.2, 3.8) for current in (200, 0, 100)
        )
        return self.client.post(self.url, {"voltage": "12", "file": SimpleUploadedFile("Rx_Batch.csv", text.encode())})

    def test_vbat_wins_and_creates_each_voltage(self):
        response = self.batch_upload()
        self.assertEqual(response.status_code, 302)
        items = list(ICSetting.objects.filter(model_number="Batch").order_by("voltage"))
        self.assertEqual([item.name for item in items], ["Batch_3.8V", "Batch_4.2V"])
        for item in items:
            self.assertEqual(item.points, [[0, 80], [100, 81], [200, 82]])
            self.assertIn("VBAT (V)=", item.source)

    def test_multiple_voltages_excel_and_vin_fallback(self):
        for label, has_vin in [("VBAT (V)", True), ("VBAT", False), ("vbat_v", False), ("VIN (V)", False)]:
            workbook = Workbook()
            sheet = workbook.active
            sheet.title = "Charger_Multi"
            sheet.append([label, "current_ma", "efficiency_percent"] + (["VIN (V)"] if has_vin else []))
            for voltage in (3.8, 4.2):
                for current in (0, 100, 200):
                    sheet.append([voltage, current, 0 if current == 0 else 90] + ([12] if has_vin else []))
            buffer = BytesIO()
            workbook.save(buffer)
            response = self.client.post(self.url, {"worksheet": sheet.title, "file": SimpleUploadedFile("multi.xlsx", buffer.getvalue())})
            self.assertEqual(response.status_code, 302)
            items = ICSetting.objects.filter(model_number="Multi")
            self.assertEqual(set(items.values_list("voltage", flat=True)), {3.8, 4.2})
            self.assertTrue(all(item.points[0] == [0, 0] for item in items))
            items.delete()

    def test_batch_conflict_does_not_partially_import(self):
        existing = ICSetting.objects.create(kind="rx", name="Already", model_number="Batch", voltage=4.2,
                                            points=[[0, 70], [100, 75], [200, 80]])
        before = ICSetting.objects.count()
        response = self.batch_upload()
        self.assertContains(response, "Batch_4.2V")
        self.assertContains(response, "型號與電壓已有設定")
        self.assertEqual(ICSetting.objects.count(), before)
        existing.refresh_from_db()
        self.assertEqual(existing.points[0][1], 70)

    def test_second_insert_failure_rolls_back_first(self):
        save = ICSetting.save
        def fail_second(item, *args, **kwargs):
            if item.voltage == 4.2:
                raise IntegrityError(1364, "missing default")
            return save(item, *args, **kwargs)
        before = ICSetting.objects.count()
        with patch.object(ICSetting, "save", fail_second), self.assertLogs("apps.ICmanage.views", level="ERROR"):
            response = self.batch_upload()
        self.assertContains(response, "資料庫結構與程式版本一致")
        self.assertEqual(ICSetting.objects.count(), before)

    def test_vbat_missing_or_duplicate_x_never_falls_back_to_vin(self):
        header = "VIN (V),VBAT (V),current_ma,efficiency_percent\n"
        for rows in ("5,,0,80\n5,3.8,100,85\n5,3.8,200,90",
                     "5,3.8,0,80\n12,3.8,0,85\n5,3.8,200,90"):
            before = ICSetting.objects.count()
            response = self.batch_upload(header + rows)
            self.assertEqual(response.status_code, 200)
            self.assertIn("file", response.context["form"].errors)
            self.assertEqual(ICSetting.objects.count(), before)

    def test_empty_voltage_group_is_reported_without_creating_a_curve(self):
        text = "voltage_v,current_ma,efficiency_percent\n3.8,0,0\n3.8,100,85\n3.8,200,90\n4.2,0,"
        response = self.batch_upload(text)
        self.assertEqual(response.status_code, 302)
        self.assertEqual(list(ICSetting.objects.filter(model_number="Batch").values_list("voltage", flat=True)), [3.8])
        # Messages are queued before the redirect, including the skipped voltage.
        self.assertTrue(any("4.2V" in str(message) for message in get_messages(response.wsgi_request)))

    def test_missing_legacy_default_is_not_reported_as_duplicate(self):
        before = ICSetting.objects.count()
        with patch.object(ICImportForm, "save", side_effect=IntegrityError(1364, "Field 'voltage_curves' has no default value")), self.assertLogs("apps.ICmanage.views", level="ERROR"):
            response = self.upload("3.8")
        self.assertContains(response, "資料庫結構與程式版本一致")
        self.assertNotContains(response, "此型號與電壓已有設定")
        self.assertEqual(ICSetting.objects.count(), before)

    def test_save_race_reports_a_verified_conflict(self):
        form = ICImportForm({"voltage": "3.8"}, {"file": SimpleUploadedFile(
            "Rx_Race.csv", b"current_ma,efficiency_percent\n0,80\n100,85\n200,90",
        )}, instance=ICSetting(kind="rx"))
        self.assertTrue(form.is_valid(), form.errors)
        ICSetting.objects.create(kind="rx", name="Race_3.8V", model_number="Race", voltage=3.8,
                                 points=[[0, 80], [100, 85], [200, 90]])
        add_save_error(form, IntegrityError(1062, "Duplicate entry"))
        self.assertIn("相同名稱或型號／電壓設定", str(form.errors))

    def test_legacy_column_migration_preserves_data_and_is_conditional(self):
        migration = import_module("apps.ICmanage.migrations.0007_allow_legacy_voltage_curves_null")
        self.assertFalse(migration.Migration.operations[0].atomic, "MySQL DDL must run outside a transaction")
        migrate = migration.allow_legacy_null
        schema = MagicMock()
        schema.connection.vendor = "mysql"
        apps = MagicMock()
        apps.get_model.return_value = ICSetting
        for columns in ([], [SimpleNamespace(name="voltage_curves", null_ok=True)]):
            schema.connection.introspection.get_table_description.return_value = columns
            migrate(apps, schema)
            schema.alter_field.assert_not_called()
        schema.connection.introspection.get_table_description.return_value = [SimpleNamespace(name="voltage_curves", null_ok=False)]
        migrate(apps, schema)
        model, old, new = schema.alter_field.call_args.args
        self.assertEqual(model, ICSetting)
        self.assertEqual(old.column, "voltage_curves")
        self.assertFalse(old.null)
        self.assertTrue(new.null)
        schema.execute.assert_not_called()


class CurveWorkbenchTests(TestCase):
    def setUp(self):
        self.client.force_login(get_user_model().objects.create_user(username="curve-manager", is_staff=True))
        self.item = ICSetting.objects.create(kind="rx", name="曲線測試", model_number="CURVE", voltage=3.8,
                                             axis="ma", points=[[0, 0], [100, 85.1234], [200, 90]])

    def payload(self, **overrides):
        return {"name": self.item.name, "model_number": self.item.model_number, "voltage": "3.8",
                "mode": "curve", "axis": "ma", "points": json.dumps(self.item.points), **overrides}

    def test_table_chart_render_save_and_invalid_draft(self):
        listing = self.client.get(reverse("ICmanage:ic-list", args=["rx"]))
        self.assertContains(listing, 'class="curve-table"')
        self.assertContains(listing, 'class="curve-chart"')
        url = reverse("ICmanage:ic-edit", args=["rx", self.item.pk])
        self.assertContains(self.client.get(url), 'data-editable="true"')
        self.assertEqual(self.client.post(url, self.payload(points="[[0,0],[100,88.765432],[200,95]]")).status_code, 302)
        self.item.refresh_from_db()
        self.assertEqual(self.item.points[1][1], 88.765432)
        draft = "[[0,0],[100,null],[200,95]]"
        response = self.client.post(url, self.payload(points=draft))
        self.assertTrue(response.context["form"].errors)
        self.assertEqual(json.loads(response.context["form"]["points"].value()), json.loads(draft))
        self.item.refresh_from_db()
        self.assertEqual(self.item.points[1][1], 88.765432)

    def test_duplicate_model_voltage_edit_import_and_constraint(self):
        other = ICSetting.objects.create(kind="rx", name="不同名稱", model_number="OTHER", voltage=3.8,
                                         points=self.item.points)
        url = reverse("ICmanage:ic-edit", args=["rx", other.pk])
        response = self.client.post(url, self.payload(name=other.name, model_number="curve"))
        self.assertContains(response, "型號與電壓已有設定")
        other.refresh_from_db()
        self.assertEqual(other.model_number, "OTHER")
        text = b"current_ma,efficiency_percent\n0,80\n100,85\n200,90"
        response = self.client.post(reverse("ICmanage:ic-import", args=["rx"]), {
            "voltage": "3.8", "file": SimpleUploadedFile("Rx_CURVE.csv", text),
        })
        self.assertContains(response, "型號與電壓已有設定")
        self.assertEqual(self.client.post(url, self.payload(name=other.name, voltage="5")).status_code, 302)
        with self.assertRaises(IntegrityError), transaction.atomic():
            ICSetting.objects.create(kind="rx", name="第三個名字", model_number="CURVE", voltage=3.8, points=self.item.points)
        ICSetting.objects.create(kind="charger", name="相同型號不同類別", model_number="CURVE", voltage=3.8, points=self.item.points)

    def test_browser_logic(self):
        run(["node", str(Path(__file__).parent / "testdata/curve_workbench.cjs")], check=True)


class AccountMenuTests(TestCase):
    def test_role_links_on_both_pages(self):
        accounts = [None,
                    get_user_model().objects.create_user(username="reader"),
                    get_user_model().objects.create_user(username="manager", is_staff=True),
                    get_user_model().objects.create_user(username="admin", is_staff=True, is_superuser=True)]
        for user in accounts:
            self.client.logout()
            if user:
                self.client.force_login(user)
            for url in (reverse("main:index"), reverse("ICmanage:ic-home"), reverse("main:account-settings"),
                        reverse("ICmanage:ic-list", args=["rx"]), reverse("ICmanage:ic-list", args=["charger"])):
                response = self.client.get(url, follow=True)
                self.assertContains(response, 'class="account-menu"', count=1)
                panel = response.content.decode().split('<nav class="account-panel"', 1)[1].split('</nav>', 1)[0]
                self.assertEqual(panel.count('<a '), 2)
                self.assertIn(reverse("ICmanage:ic-home"), panel)
                self.assertIn(reverse("main:account-settings"), panel)
                self.assertNotIn("登出", panel)
                self.assertNotIn("RX IC", panel)
            home = self.client.get(reverse("ICmanage:ic-home"), follow=True)
            self.assertRedirects(home, "rx/")
            self.assertEqual(home.context["kind"], "rx")
            self.assertContains(home, 'aria-current="page">🔌 RX IC')
            self.assertContains(home, reverse("ICmanage:ic-list", args=["rx"]))
            self.assertContains(home, reverse("ICmanage:ic-list", args=["charger"]))
            settings = self.client.get(reverse("main:account-settings"))
            if user and user.is_superuser:
                self.assertContains(settings, reverse("admin:auth_user_changelist"))
            else:
                self.assertNotContains(settings, reverse("admin:auth_user_changelist"))
            if user:
                self.assertContains(settings, f'action="{reverse("logout")}"')
                self.assertContains(settings, 'name="csrfmiddlewaretoken"')
            else:
                self.assertContains(settings, "管理者登入")
                self.assertNotContains(settings, "登出")

    def test_keyboard_and_outside_click(self):
        run(["node", str(Path(__file__).parent / "testdata/account_menu.cjs")], check=True)
