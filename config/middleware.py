import posixpath
from urllib.parse import urlsplit, urlunsplit

from django.utils.encoding import iri_to_uri


class RelativeRedirectMiddleware:
    """Keep mounted redirects relative so proxies cannot add the prefix twice."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        prefix = iri_to_uri(request.META.get("SCRIPT_NAME", "")).rstrip("/")
        if prefix and response.status_code in (301, 302, 303, 307, 308) and response.has_header("Location"):
            target = urlsplit(response["Location"])
            if not target.scheme and not target.netloc and target.path.startswith(prefix + "/"):
                directory = posixpath.dirname(iri_to_uri(request.path))
                relative = "./" + posixpath.relpath(target.path, directory)
                if target.path.endswith("/"):
                    relative += "/"
                response["Location"] = urlunsplit(("", "", relative, target.query, target.fragment))
        return response
