from dataclasses import dataclass, field
from enum import Enum
from typing import Dict, List, Optional, Set


class ContextStatus(str, Enum):
    DERIVED = "derived"
    VERIFIED = "verified"

    @property
    def display_tag(self) -> str:
        if self == ContextStatus.VERIFIED:
            return "[VERIFIED]"
        return "[DERIVED]"


@dataclass
class FeatureAssociation:
    path: str
    feature_id: str
    status: ContextStatus
    score: float = 1.0
    reason: str = ""


@dataclass
class Feature:
    id: str
    name: str
    description: str = ""
    status: ContextStatus = ContextStatus.DERIVED
    paths: Set[str] = field(default_factory=set)
    confidence_score: float = 1.0
    metadata: Dict[str, str] = field(default_factory=dict)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "status": self.status.value,
            "paths": sorted(list(self.paths)),
            "confidence_score": round(self.confidence_score, 2),
            "metadata": self.metadata,
        }


@dataclass
class FeatureRegistry:
    features: Dict[str, Feature] = field(default_factory=dict)
    path_to_feature: Dict[str, FeatureAssociation] = field(default_factory=dict)

    def add_feature(self, feature: Feature) -> None:
        if feature.id in self.features:
            existing = self.features[feature.id]
            # Verified context overrides derived context
            if feature.status == ContextStatus.VERIFIED:
                existing.status = ContextStatus.VERIFIED
                if feature.description:
                    existing.description = feature.description
            existing.paths.update(feature.paths)
        else:
            self.features[feature.id] = feature

        for path in feature.paths:
            self.register_association(
                path=path,
                feature_id=feature.id,
                status=feature.status,
                score=feature.confidence_score,
                reason="Explicit path assignment" if feature.status == ContextStatus.VERIFIED else "Inferred directory mapping",
            )

    def register_association(self, path: str, feature_id: str, status: ContextStatus, score: float = 1.0, reason: str = "") -> None:
        # Verified context takes precedence over derived context for the same path
        if path in self.path_to_feature:
            current = self.path_to_feature[path]
            if current.status == ContextStatus.VERIFIED and status == ContextStatus.DERIVED:
                return  # Do not overwrite verified association with derived
        self.path_to_feature[path] = FeatureAssociation(
            path=path,
            feature_id=feature_id,
            status=status,
            score=score,
            reason=reason,
        )

    def get_association(self, path: str) -> Optional[FeatureAssociation]:
        return self.path_to_feature.get(path)

    def to_dict(self) -> dict:
        return {
            "features": {fid: feat.to_dict() for fid, feat in sorted(self.features.items())}
        }
