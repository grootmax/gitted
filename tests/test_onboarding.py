import os
import tempfile
import pytest

from contextbuilder.inference.clustering import FeatureClusterer
from contextbuilder.models import ContextStatus


def test_zero_touch_onboarding_without_config():
    """Verify onboarding completes cleanly on a repository without .contextbuilder/features.yml."""
    with tempfile.TemporaryDirectory() as tmp_dir:
        # Create sample project structure without .contextbuilder/features.yml
        os.makedirs(os.path.join(tmp_dir, "src/auth"), exist_ok=True)
        os.makedirs(os.path.join(tmp_dir, "src/payments"), exist_ok=True)

        with open(os.path.join(tmp_dir, "src/auth/login.py"), "w") as f:
            f.write("def login(): pass\n")
        with open(os.path.join(tmp_dir, "src/payments/checkout.py"), "w") as f:
            f.write("def checkout(): pass\n")

        # Scan repository
        clusterer = FeatureClusterer(tmp_dir)
        registry = clusterer.infer_registry()

        # Check features were inferred
        assert "auth" in registry.features
        assert "payments" in registry.features

        auth_feature = registry.features["auth"]
        assert auth_feature.status == ContextStatus.DERIVED
        assert "src/auth/login.py" in auth_feature.paths

        payments_feature = registry.features["payments"]
        assert payments_feature.status == ContextStatus.DERIVED
        assert "src/payments/checkout.py" in payments_feature.paths
