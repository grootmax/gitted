import pytest
import tempfile
from pathlib import Path
from gitted.path_scorer import (
    load_feature_registry,
    match_path_pattern,
    score_affected_areas
)
from gitted.models import FeatureRegistry, FeatureRule

def test_match_path_pattern():
    assert match_path_pattern("services/payment/handler.py", "services/payment/**")
    assert match_path_pattern("src/refunds/api.py", "src/refunds/**")
    assert match_path_pattern("lib/core/util.py", "lib/**")
    assert not match_path_pattern("services/user/profile.py", "services/payment/**")

def test_score_affected_areas():
    registry = FeatureRegistry(features=[
        FeatureRule(name="Payments", paths=["services/payment/**", "src/payments/**"]),
        FeatureRule(name="Refunds", paths=["services/refund/**", "src/refunds/**"]),
        FeatureRule(name="Users", paths=["services/user/**"])
    ])

    modified = [
        "services/payment/handler.py",
        "services/payment/models.py",
        "services/refund/calculator.py"
    ]

    affected = score_affected_areas(modified, registry)
    assert "Payments" in affected
    assert "Refunds" in affected
    assert affected[0] == "Payments"  # higher score (2 matches vs 1 match)
    assert "Users" not in affected

def test_score_affected_areas_empty():
    registry = FeatureRegistry(features=[
        FeatureRule(name="Payments", paths=["services/payment/**"])
    ])
    assert score_affected_areas(["readme.md"], registry) == []
