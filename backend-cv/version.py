"""Single source of truth for the Aegis version."""
import os

VERSION = "3.1.0"


def get_version() -> str:
    """Read version from VERSION file if available, otherwise return constant."""
    version_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "VERSION")
    if os.path.exists(version_path):
        with open(version_path) as f:
            return f.read().strip()
    return VERSION
