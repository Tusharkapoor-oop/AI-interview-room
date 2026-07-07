"""Single source of truth for the Aegis version."""
import importlib.metadata
import os

VERSION = "3.1.0"


def get_version() -> str:
    """Read version from installed package metadata, then VERSION file, then fallback."""
    try:
        return importlib.metadata.version("aegis-backend")
    except importlib.metadata.PackageNotFoundError:
        pass
    version_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "VERSION")
    if os.path.exists(version_path):
        with open(version_path) as f:
            return f.read().strip()
    return VERSION
