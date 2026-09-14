from typing import List, Optional
from contextbuilder.models import ContextStatus, FeatureAssociation, FeatureRegistry


class UIFormatter:
    """Formats feature mappings and status indicators for display."""

    @staticmethod
    def format_registry_tree(registry: FeatureRegistry) -> str:
        lines = []
        lines.append("Context Builder Feature Map")
        lines.append("===========================")

        sorted_features = sorted(registry.features.values(), key=lambda f: f.id)
        if not sorted_features:
            lines.append("No features mapped.")
            return "\n".join(lines)

        for feat in sorted_features:
            tag = feat.status.display_tag
            lines.append(f"\nFeature: {feat.id} ({feat.name}) {tag}")
            if feat.description:
                lines.append(f"  Description: {feat.description}")
            lines.append(f"  Confidence: {feat.confidence_score:.2f}")
            lines.append("  Mapped Paths:")

            sorted_paths = sorted(list(feat.paths))
            if not sorted_paths:
                lines.append("    (no paths)")
            else:
                for path in sorted_paths:
                    assoc = registry.get_association(path)
                    assoc_tag = assoc.status.display_tag if assoc else tag
                    score_str = f" (score: {assoc.score:.2f})" if assoc and assoc.score < 1.0 else ""
                    lines.append(f"    - {path} {assoc_tag}{score_str}")

        return "\n".join(lines)

    @staticmethod
    def format_resolution(assoc: FeatureAssociation) -> str:
        tag = assoc.status.display_tag
        return (
            f"Path: {assoc.path}\n"
            f"Mapped Feature: {assoc.feature_id}\n"
            f"Context Status: {assoc.status.value} {tag}\n"
            f"Association Score: {assoc.score:.2f}\n"
            f"Reason: {assoc.reason}"
        )
