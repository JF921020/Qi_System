import secrets
import string
from zoneinfo import ZoneInfo


def generate_public_id(verified_at):
    """First verification hour in Taiwan, followed by four secure random characters."""
    prefix = verified_at.astimezone(ZoneInfo("Asia/Taipei")).strftime("%y%m%d%H")
    return prefix + "".join(secrets.choice(string.ascii_letters + string.digits) for _ in range(4))
