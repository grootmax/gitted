import os
import tempfile
import pytest

from contextbuilder.inference.clustering import FeatureClusterer
from contextbuilder.models import ContextStatus


def test_yaml_overrides_precedence():
    """Verify explicit YAML configurations override derived feature boundaries."""
    with tempfile.TemporaryDirectory() as tmp_dir:
        # Create directory src/auth/login.py which would naturally be derived as 'auth'
        os.makedirs(os.path.join(tmp_dir, "src/auth"), exist_ok=True)
        login_path = os.path.join(tmp_dir, "src/auth/login.py")
        with open(login_path, "w") as f:
            f.write("def login(): pass\n")

        # Explicit YAML override mapping src/auth/login.py to 'identity' feature
        cb_dir = os.path.join(tmp_dir, ".contextbuilder")
        os.makedirs(cb_dir, exist_ok=True)
        with open(os.path.join(cb_dir, "features.yml"), "w") as f:
            f.write("""
features:
  identity:
    name: Identity Service
    description: Custom verified override
    paths:
      - src/auth/login.py
""")

        clusterer = FeatureClusterer(tmp_dir)
        registry = clusterer.infer_registry()

        # Check 'identity' feature is verified and owns src/auth/login.py
        assert "identity" in registry.features
        identity_feat = registry.features["identity"]
        assert identity_feat.status == ContextStatus.VERIFIED
        assert "src/auth/login.py" in identity_feat.paths

        assoc = registry.get_association("src/auth/login.py")
        assert assoc is not None
        assert assoc.feature_id == "identity"
        assert assoc.status == ContextStatus.VERIFIED
