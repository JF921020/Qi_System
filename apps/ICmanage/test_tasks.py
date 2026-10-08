from importlib import import_module
from io import BytesIO
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from django.contrib.auth import get_user_model
from django.contrib.messages import get_messages
from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import IntegrityError
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
