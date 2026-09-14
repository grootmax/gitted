import os
from typing import Dict, List, Optional, Tuple

from contextbuilder.inference.ast_parser import FastASTParser
from contextbuilder.inference.directory_analyzer import DirectoryAnalyzer
from contextbuilder.models import ContextStatus, FeatureAssociation, FeatureRegistry


class DynamicFeatureResolver:
    """Dynamically maps new, moved, or renamed files to features using AST import graph and directory proximity."""

    def __init__(self, repo_dir: str, registry: FeatureRegistry):
        self.repo_dir = os.path.abspath(repo_dir)
        self.registry = registry

    def resolve_path(self, target_path: str) -> FeatureAssociation:
        normalized_path = target_path.replace("\\", "/").strip("/")

        # 1. Exact match in registry
        existing_assoc = self.registry.get_association(normalized_path)
        if existing_assoc and existing_assoc.status == ContextStatus.VERIFIED:
            return existing_assoc

        # 2. Match directory prefix in verified features
        for feat in self.registry.features.values():
            if feat.status == ContextStatus.VERIFIED:
                for p in feat.paths:
                    p_norm = p.replace("\\", "/").strip("/")
                    if normalized_path == p_norm or normalized_path.startswith(p_norm + "/"):
                        return FeatureAssociation(
                            path=normalized_path,
                            feature_id=feat.id,
                            status=ContextStatus.VERIFIED,
                            score=1.0,
                            reason="Matched verified path directory override",
                        )

        # 3. Dynamic resolution using AST imports and directory proximity
        scores: Dict[str, float] = {}
        reasons: Dict[str, str] = {}

        abs_path = os.path.join(self.repo_dir, normalized_path)
        imports = FastASTParser.extract_imports(abs_path, normalized_path) if os.path.exists(abs_path) else set()

        for fid, feat in self.registry.features.items():
            # Calculate directory proximity score
            proximity = self._calculate_directory_proximity(normalized_path, feat.paths)
            
            # Calculate import connectivity score
            import_score = self._calculate_import_connectivity(fid, imports, feat.paths)

            # Composite score: 60% import connectivity + 40% directory proximity
            composite_score = (import_score * 0.6) + (proximity * 0.4)
            scores[fid] = composite_score
            reasons[fid] = f"Scored via import connectivity ({import_score:.2f}) and directory proximity ({proximity:.2f})"

        # Fallback heuristic if all scores are zero
        inferred_dir_fid = DirectoryAnalyzer.infer_feature_from_path(normalized_path)
        if inferred_dir_fid in self.registry.features:
            scores[inferred_dir_fid] = max(scores.get(inferred_dir_fid, 0.0), 0.5)

        if scores:
            best_fid = max(scores.keys(), key=lambda k: scores[k])
            best_score = max(0.1, round(scores[best_fid], 2))
            
            # Determine status: if the feature itself was verified by user override, association is derived dynamic
            feature_obj = self.registry.features.get(best_fid)
            status = ContextStatus.DERIVED

            assoc = FeatureAssociation(
                path=normalized_path,
                feature_id=best_fid,
                status=status,
                score=best_score,
                reason=reasons.get(best_fid, "Dynamic AST import and directory inference"),
            )
            # Register newly resolved association
            self.registry.register_association(
                path=normalized_path,
                feature_id=best_fid,
                status=status,
                score=best_score,
                reason=assoc.reason,
            )
            return assoc

        # Default fallback
        fallback_assoc = FeatureAssociation(
            path=normalized_path,
            feature_id="core",
            status=ContextStatus.DERIVED,
            score=0.5,
            reason="Fallback core feature assignment",
        )
        self.registry.register_association(
            path=normalized_path,
            feature_id="core",
            status=ContextStatus.DERIVED,
            score=0.5,
            reason=fallback_assoc.reason,
        )
        return fallback_assoc

    @staticmethod
    def _calculate_directory_proximity(target_path: str, feature_paths: set) -> float:
        if not feature_paths:
            return 0.0

        target_parts = target_path.split("/")
        max_proximity = 0.0

        for fpath in feature_paths:
            f_norm = fpath.replace("\\", "/").strip("/")
            f_parts = f_norm.split("/")
            
            common_parts = 0
            for p1, p2 in zip(target_parts, f_parts):
                if p1.lower() == p2.lower():
                    common_parts += 1
                else:
                    break
            
            if common_parts > 0:
                proximity = common_parts / max(len(target_parts), len(f_parts))
                if proximity > max_proximity:
                    max_proximity = proximity

        return max_proximity

    @staticmethod
    def _calculate_import_connectivity(feature_id: str, imports: set, feature_paths: set) -> float:
        if not imports or not feature_paths:
            return 0.0

        match_count = 0
        for imp in imports:
            imp_clean = imp.lower().replace("-", "_")
            fid_clean = feature_id.lower().replace("-", "_")
            if imp_clean == fid_clean or fid_clean in imp_clean:
                match_count += 1
                continue
            for fpath in feature_paths:
                if imp_clean in fpath.lower():
                    match_count += 1
                    break

        return min(1.0, match_count / max(1, len(imports)))
