import fnmatch
from pathlib import Path
from typing import List, Dict, Union, Optional
import yaml
from .models import FeatureRegistry, FeatureRule

def load_feature_registry(registry_path: Union[str, Path]) -> FeatureRegistry:
    """Load feature rules from a YAML file (.contextbuilder/features.yml)."""
    p = Path(registry_path)
    if not p.exists():
        return FeatureRegistry()

    try:
        with open(p, "r", encoding="utf-8") as f:
            data = yaml.safe_load(f) or {}
    except Exception:
        return FeatureRegistry()

    features_list = data.get("features", [])
    rules = []
    for item in features_list:
        if isinstance(item, dict) and "name" in item:
            name = item["name"]
            paths = item.get("paths", [])
            desc = item.get("description", "")
            if isinstance(paths, str):
                paths = [paths]
            rules.append(FeatureRule(name=name, paths=paths, description=desc))

    return FeatureRegistry(features=rules)

def match_path_pattern(file_path: str, pattern: str) -> bool:
    """Match a file path against glob patterns like 'services/payment/**' or 'src/*.py'."""
    clean_file = file_path.lstrip("/")
    clean_pattern = pattern.lstrip("/")

    # Direct equality or fnmatch
    if fnmatch.fnmatch(clean_file, clean_pattern):
        return True

    # Handle double asterisk wildcards e.g. services/payment/**
    if clean_pattern.endswith("/**"):
        prefix = clean_pattern[:-3]
        if clean_file.startswith(prefix + "/") or clean_file == prefix:
            return True

    if "/**/" in clean_pattern:
        parts = clean_pattern.split("/**/")
        if len(parts) == 2:
            start_pat, end_pat = parts[0], parts[1]
            if (clean_file.startswith(start_pat + "/") or not start_pat) and fnmatch.fnmatch(clean_file, f"*{end_pat}"):
                return True

    # Simple prefix match if pattern ends with /
    if clean_pattern.endswith("/"):
        if clean_file.startswith(clean_pattern):
            return True

    return False

def score_affected_areas(modified_files: List[str], registry: FeatureRegistry) -> List[str]:
    """Score modified files against feature registry rules and return affected feature names."""
    if not modified_files or not registry.features:
        return []

    scores: Dict[str, int] = {}
    for rule in registry.features:
        scores[rule.name] = 0
        for f_path in modified_files:
            for pattern in rule.paths:
                if match_path_pattern(f_path, pattern):
                    scores[rule.name] += 1
                    break  # count each file at most once per feature rule

    # Filter features with score > 0
    matched = [(name, count) for name, count in scores.items() if count > 0]
    if not matched:
        return []

    # Sort by score descending, then by feature definition order
    feature_order = {rule.name: i for i, rule in enumerate(registry.features)}
    matched.sort(key=lambda x: (-x[1], feature_order.get(x[0], 999)))

    return [name for name, _ in matched]
