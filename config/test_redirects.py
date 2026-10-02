from urllib.parse import urljoin

from django.http import HttpResponseRedirect
from django.test import RequestFactory, SimpleTestCase

from .middleware import RelativeRedirectMiddleware


class RelativeRedirectTests(SimpleTestCase):
    def test_only_redirects_inside_the_mount_are_rewritten(self):
        for prefix in ("", "/proxy/8000"):
            request = RequestFactory().get("/accounts/login/", SCRIPT_NAME=prefix)
            for target in ("https://example.org/proxy/8000/", "//example.org/proxy/8000/",
                           "/proxy/80001/", "/elsewhere/", "../../",
                           "/proxy/8000/ics/rx/?q=a%20b#results"):
                with self.subTest(prefix=prefix, target=target):
                    response = RelativeRedirectMiddleware(lambda req, target=target: HttpResponseRedirect(target))(request)
                    if prefix and target.startswith(prefix + "/"):
                        self.assertFalse(response["Location"].startswith("/"))
                        self.assertEqual(urljoin(request.path, response["Location"]), target)
                    else:
                        self.assertEqual(response["Location"], target)
