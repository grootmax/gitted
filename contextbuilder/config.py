import os
from pathlib import Path
from typing import Dict, Optional
import yaml

from contextbuilder.models import ContextStatus, Feature, FeatureRegistry


CONFIG_FILE_NAME = ".contextbuilder/features.yml"


class ConfigLoader:
    """Loads explicit feature configurations from .contextbuilder/features.yml as verified context."""

    @staticmethod
    def load_verified_registry(repo_dir: str) -> FeatureRegistry:
        registry = FeatureRegistry()
        config_path = os.path.join(repo_dir, CONFIG_FILE_NAME)
        
        if not os.path.isfile(config_path):
            # Also check alternative path without subfolder or features.yaml
            alt_paths = [
                os.path.join(repo_dir, ".contextbuilder/features.yaml"),
                os.path.join(repo_dir, "features.yml"),
            ]
            for alt in alt_paths:
                if os.path.isfile(alt):
                    config_path = alt
                    break
            else:
                # No config file exists - onboarding proceeds with derived context only
                return registry

        try:
            with open(config_path, "r", encoding="utf-8") as f:
                content = yaml.safe_load(f)
        except Exception:
            return registry

        if not content or not isinstance(content, dict):
            return registry

        features_data = content.get("features", {})
        if isinstance(features_data, dict):
            for feature_id, details in features_data.items():
                if isinstance(details, dict):
                    name = details.get("name", feature_id.replace("_", " ").title())
                    desc = details.get("description", "")
                    paths = set(details.get("paths", []))
                elif isinstance(details, list):
                    name = feature_id.replace("_", " ").title()
                    desc = ""
                    paths = set(details)
                else:
                    continue

                feat = Feature(
                    id=feature_id,
                    name=name,
                    description=desc,
                    status=ContextStatus.VERIFIED,
                    paths=paths,
                    confidence_score=1.0,
                )
                registry.add_feature(feat)

        return registry
