import os
import tempfile
import pytest

from contextbuilder.inference.clustering import FeatureClusterer
from contextbuilder.inference.resolver import DynamicFeatureResolver


def test_file_refactoring_and_moving_resolution():
    """Verify moving or renaming source files updates feature association scoring without broken path references."""
    with tempfile.TemporaryDirectory() as tmp_dir:
        # Set up repository with auth feature
        os.makedirs(os.path.join(tmp_dir, "src/auth"), exist_ok=True)
        os.makedirs(os.path.join(tmp_dir, "src/security"), exist_ok=True)

        with open(os.path.join(tmp_dir, "src/auth/tokens.py"), "w") as f:
            f.write("def create_token(): return 'token'\n")

        # Refactored / moved file into src/security/login.py that imports tokens from auth
        moved_file = os.path.join(tmp_dir, "src/security/login.py")
        with open(moved_file, "w") as f:
            f.write("import src.auth.tokens\nfrom src.auth.tokens import create_token\n")

        # Build registry
        clusterer = FeatureClusterer(tmp_dir)
        registry = clusterer.infer_registry()

        # Resolve moved file path
        resolver = DynamicFeatureResolver(tmp_dir, registry)
        assoc = resolver.resolve_path("src/security/login.py")

        # Must map to auth or security feature with valid association score (> 0)
        assert assoc.feature_id in ("auth", "security")
        assert assoc.score > 0.0
        assert assoc.path == "src/security/login.py"
        assert assoc.reason != ""
