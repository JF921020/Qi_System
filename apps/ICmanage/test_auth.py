from secrets import token_urlsafe
from urllib.parse import parse_qs, urljoin, urlsplit

from django.contrib.auth import get_user_model
from django.test import Client, TestCase
from django.urls import get_script_prefix, reverse, set_script_prefix

from .models import ICSetting


class AccountAccessTests(TestCase):
    def setUp(self):
        self.password = token_urlsafe(24)
        self.user = get_user_model().objects.create_user(username="reader", password=self.password)
        self.manager = get_user_model().objects.create_user(username="manager", password=self.password, is_staff=True)

    def test_role_matrix_protects_every_write_route_and_hides_actions(self):
        before = list(ICSetting.objects.values())
        for account, expected in ((None, 302), (self.user, 403), (self.manager, 200)):
            self.client.logout()
            if account:
                self.client.force_login(account)
            for kind in ("rx", "charger"):
                item = ICSetting.objects.filter(kind=kind).first()
                urls = [reverse("ICmanage:ic-import", args=[kind])]
                urls += [reverse("ICmanage:" + action, args=[kind, item.pk])
                         for action in ("ic-edit", "ic-delete")]
                page = self.client.get(reverse("ICmanage:ic-list", args=[kind]))
                self.assertEqual(page.status_code, 200)
                for url in urls:
                    with self.subTest(account=str(account), url=url):
                        self.assertEqual(self.client.get(url).status_code, expected)
                        if account != self.manager:
                            self.assertEqual(self.client.post(url, {}).status_code, expected)
                            self.assertNotContains(page, url)
                        else:
                            self.assertContains(page, url)
                if account is None:
                    self.assertContains(page, "登入</a>")
        self.assertEqual(list(ICSetting.objects.values()), before)

    def test_login_next_validation_inactive_account_and_post_logout(self):
        login = reverse("login")
        calculation = reverse("main:index")
        page = self.client.get(calculation)
        self.assertEqual(page.status_code, 200)
        self.assertNotContains(page, "登出")
        for field in ("chargeCurrentA", "chargeCurrentmA", "batVoltage"):
            self.assertContains(page, f'id="{field}"')
        bad = self.client.post(login, {"username": self.manager.username, "password": token_urlsafe(24)})
        self.assertTrue(bad.context["form"].errors)
        non_staff = self.client.post(login, {"username": self.user.username, "password": self.password})
        self.assertTrue(non_staff.context["form"].errors)
        for next_url, target in (("/ics/rx/", "/ics/rx/"), ("https://example.org/", calculation)):
            self.client.logout()
            response = self.client.post(login, {
                "username": self.manager.username, "password": self.password, "next": next_url,
            })
            self.assertRedirects(response, target)
        page = self.client.get(calculation)
        for field in ("chargeCurrentA", "chargeCurrentmA", "batVoltage"):
            self.assertContains(page, f'id="{field}"')
        self.assertEqual(self.client.get(reverse("logout")).status_code, 405)
        self.assertRedirects(self.client.post(reverse("logout")), calculation)
        self.assertEqual(self.client.get(calculation).status_code, 200)
        self.assertEqual(self.client.get(reverse("ICmanage:ic-import", args=["rx"])).status_code, 302)
        self.manager.is_active = False
        self.manager.save()
        response = self.client.post(login, {"username": self.manager.username, "password": self.password})
        self.assertTrue(response.context["form"].errors)

    def test_csrf_is_required_for_login_logout_and_manager_writes(self):
        client = Client(enforce_csrf_checks=True)
        self.assertEqual(client.post(reverse("login"), {}).status_code, 403)
        client.force_login(self.manager)
        item = ICSetting.objects.filter(kind="rx").first()
        urls = [reverse("logout"), reverse("ICmanage:ic-import", args=["rx"])]
        urls += [reverse("ICmanage:" + action, args=["rx", item.pk])
                 for action in ("ic-edit", "ic-delete")]
        for url in urls:
            self.assertEqual(client.post(url, {}).status_code, 403)

    def test_auth_redirects_through_prefix_rewriting_proxy(self):
        prefix = "/proxy/8000"
        self.addCleanup(set_script_prefix, get_script_prefix())

        def follow_proxy(response, source, expected):
            self.assertEqual(response.status_code, 302)
            location = response["Location"]
            # The deployment proxy prepends its mount to root-relative Locations.
            target = prefix + location if location.startswith("/") else urljoin(prefix + source, location)
            self.assertEqual(target, prefix + expected)
            self.assertEqual(self.client.get(target[len(prefix):]).status_code, 200)
            return target

        with self.settings(FORCE_SCRIPT_NAME=prefix):
            set_script_prefix(prefix)
            protected = self.client.get("/ics/rx/import/")
            target = follow_proxy(protected, "/ics/rx/import/",
                                  "/accounts/login/?next=/proxy/8000/ics/rx/import/")
            protected_next = parse_qs(urlsplit(target).query)["next"][0]
            for next_url, expected in ((protected_next, "/ics/rx/import/"),
                                       (prefix + "/ics/rx/?q=test", "/ics/rx/?q=test"),
                                       ("", "/"), ("https://example.org/", "/")):
                logged_in = self.client.post("/accounts/login/", {
                    "username": self.manager.username, "password": self.password, "next": next_url,
                })
                follow_proxy(logged_in, "/accounts/login/", expected)
                logged_out = self.client.post("/accounts/logout/")
                follow_proxy(logged_out, "/accounts/logout/", "/")
                self.assertNotIn("_auth_user_id", self.client.session)
