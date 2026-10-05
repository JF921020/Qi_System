"""Run with: python -m unittest config.test_deployment"""
import os
import runpy
import unittest
from pathlib import Path
from unittest.mock import patch

from django.core.exceptions import ImproperlyConfigured


class DeploymentSettingsTests(unittest.TestCase):
    def settings(self, env):
        with patch.dict(os.environ, env, clear=True), patch("dotenv.load_dotenv"):
            return runpy.run_path(str(Path(__file__).with_name("settings.py")))

    def test_production_requires_secret(self):
        with self.assertRaises(ImproperlyConfigured):
            self.settings({"DJANGO_DEBUG": "false"})

    def test_production_hosts_and_static_root(self):
        result = self.settings({
            "DJANGO_DEBUG": "false", "DJANGO_SECRET_KEY": "test-only-secret",
            "DJANGO_ALLOWED_HOSTS": " qi.example.test,127.0.0.1, ",
        })
        self.assertFalse(result["DEBUG"])
        self.assertEqual(result["SECRET_KEY"], "test-only-secret")
        self.assertEqual(result["ALLOWED_HOSTS"], ["qi.example.test", "127.0.0.1"])
        self.assertEqual(result["STATIC_URL"], "/static/")

    def test_local_development_and_existing_proxy(self):
        result = self.settings({"FORCE_SCRIPT_NAME": "/proxy/8000"})
        self.assertTrue(result["DEBUG"])
        self.assertEqual(result["STATIC_URL"], "/proxy/8000/static/")
