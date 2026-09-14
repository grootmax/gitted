import os
import tempfile
import pytest

from contextbuilder.inference.clustering import FeatureClusterer
from contextbuilder.models import ContextStatus
from contextbuilder.ui.formatter import UIFormatter


def test_status_indicators_display():
    """Verify inferred features and paths display clear derived/verified status indicators."""
    with tempfile.TemporaryDirectory() as tmp_dir:
        # Create .contextbuilder/features.yml override
        cb_dir = os.path.join(tmp_dir, ".contextbuilder")
        os.makedirs(cb_dir, exist_ok=True)
        with open(os.path.join(cb_dir, "features.yml"), "w") as f:
            f.write("""
features:
  billing:
    name: Verified Billing Feature
    paths:
      - src/billing/invoice.py
""")

        # Create source files
        os.makedirs(os.path.join(tmp_dir, "src/billing"), exist_ok=True)
        os.makedirs(os.path.join(tmp_dir, "src/search"), exist_ok=True)

        with open(os.path.join(tmp_dir, "src/billing/invoice.py"), "w") as f:
            f.write("def invoice(): pass\n")
        with open(os.path.join(tmp_dir, "src/search/query.py"), "w") as f:
            f.write("def search(): pass\n")

        clusterer = FeatureClusterer(tmp_dir)
        registry = clusterer.infer_registry()

        # Verified feature check
        billing = registry.features["billing"]
        assert billing.status == ContextStatus.VERIFIED
        assert billing.status.display_tag == "[VERIFIED]"

        # Derived feature check
        search = registry.features["search"]
        assert search.status == ContextStatus.DERIVED
        assert search.status.display_tag == "[DERIVED]"

        # UI output check
        formatted_output = UIFormatter.format_registry_tree(registry)
        assert "[VERIFIED]" in formatted_output
        assert "[DERIVED]" in formatted_output
        assert "Verified Billing Feature" in formatted_output
