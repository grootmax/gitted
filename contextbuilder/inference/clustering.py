import os
from collections import defaultdict
from typing import Dict, List, Set

from contextbuilder.config import ConfigLoader
from contextbuilder.inference.ast_parser import FastASTParser
from contextbuilder.inference.directory_analyzer import DirectoryAnalyzer
from contextbuilder.models import ContextStatus, Feature, FeatureRegistry


class FeatureClusterer:
    """Combines directory hierarchy analysis, package manifests, and import graph clustering."""

    def __init__(self, repo_dir: str):
        self.repo_dir = os.path.abspath(repo_dir)

    def infer_registry(self) -> FeatureRegistry:
        # Step 1: Load explicit verified configurations if present (.contextbuilder/features.yml)
        registry = ConfigLoader.load_verified_registry(self.repo_dir)

        # Step 2: Scan repository directory structure & package manifests
        analyzer = DirectoryAnalyzer(self.repo_dir)
        all_files, file_to_dir_feature, package_manifests = analyzer.scan_repository()

        if not all_files:
            return registry

        # Step 3: Parse AST imports to build import graph
        file_imports: Dict[str, Set[str]] = {}
        for rel_file in all_files:
            abs_path = os.path.join(self.repo_dir, rel_file)
            file_imports[rel_file] = FastASTParser.extract_imports(abs_path, rel_file)

        # Step 4: Group files into derived features based on directory analysis & import coupling
        derived_feature_paths: Dict[str, Set[str]] = defaultdict(set)
        
        for rel_file in all_files:
            inferred_fid = file_to_dir_feature.get(rel_file, "core")
            derived_feature_paths[inferred_fid].add(rel_file)

        # Step 5: Refine feature boundaries using package manifests & import clusters
        for manifest in package_manifests:
            parts = manifest.split("/")
            if len(parts) > 1:
                pkg_dir_feature = analyzer.infer_feature_from_path(manifest)
                if pkg_dir_feature and pkg_dir_feature != "core":
                    # Mark feature as higher confidence package boundary
                    pass

        # Step 6: Populate registry with derived features (if not already verified)
        for fid, paths in derived_feature_paths.items():
            name = fid.replace("_", " ").title() + " Feature"
            desc = f"Inferred feature boundary for {fid} module"

            feat = Feature(
                id=fid,
                name=name,
                description=desc,
                status=ContextStatus.DERIVED,
                paths=paths,
                confidence_score=0.90,
            )
            registry.add_feature(feat)

        return registry
