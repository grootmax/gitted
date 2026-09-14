import os
import re
from pathlib import Path
from typing import Dict, List, Set, Tuple


IGNORED_DIRS = {
    ".git", ".svn", ".hg", "__pycache__", "node_modules", "venv", ".venv",
    "env", ".env", "dist", "build", "target", ".idea", ".vscode",
    ".pytest_cache", ".contextbuilder", "eggs", ".eggs", "coverage", ".next"
}

PACKAGE_MANIFEST_FILES = {
    "package.json", "pyproject.toml", "Cargo.toml", "go.mod",
    "pom.xml", "build.gradle", "setup.py", "mix.exs", "Gemfile"
}

SOURCE_CONTAINERS = {"src", "lib", "pkg", "app", "packages", "services", "modules", "components", "pages", "apps"}


class DirectoryAnalyzer:
    """Analyzes directory hierarchy and package manifests to infer initial feature boundaries."""

    def __init__(self, repo_dir: str):
        self.repo_dir = os.path.abspath(repo_dir)

    def scan_repository(self) -> Tuple[List[str], Dict[str, str], Set[str]]:
        """
        Scans repository fast.
        Returns:
            all_files: Relative paths of all source files.
            file_to_dir_feature: Mapping from rel_path to inferred feature_id based on directory structure.
            package_manifests: Relative paths of found package manifests.
        """
        all_files: List[str] = []
        file_to_dir_feature: Dict[str, str] = {}
        package_manifests: Set[str] = set()

        self._fast_walk(
            current_abs_path=self.repo_dir,
            rel_path="",
            all_files=all_files,
            file_to_dir_feature=file_to_dir_feature,
            package_manifests=package_manifests,
        )

        return all_files, file_to_dir_feature, package_manifests

    def _fast_walk(
        self,
        current_abs_path: str,
        rel_path: str,
        all_files: List[str],
        file_to_dir_feature: Dict[str, str],
        package_manifests: Set[str],
    ) -> None:
        try:
            entries = list(os.scandir(current_abs_path))
        except (PermissionError, FileNotFoundError):
            return

        has_manifest = False
        subdirs = []
        files = []

        for entry in entries:
            name = entry.name
            if name in IGNORED_DIRS or name.startswith(".") or name.endswith(".egg-info"):
                continue

            if entry.is_dir(follow_symlinks=False):
                subdirs.append(entry)
            elif entry.is_file(follow_symlinks=False):
                files.append(entry)
                if name in PACKAGE_MANIFEST_FILES:
                    has_manifest = True

        for file_entry in files:
            f_rel = os.path.join(rel_path, file_entry.name) if rel_path else file_entry.name
            # Normalize path slashes
            f_rel = f_rel.replace("\\", "/")
            all_files.append(f_rel)

            if file_entry.name in PACKAGE_MANIFEST_FILES:
                package_manifests.add(f_rel)

            feature_id = self.infer_feature_from_path(f_rel)
            file_to_dir_feature[f_rel] = feature_id

        for dir_entry in subdirs:
            d_rel = os.path.join(rel_path, dir_entry.name) if rel_path else dir_entry.name
            self._fast_walk(
                current_abs_path=dir_entry.path,
                rel_path=d_rel,
                all_files=all_files,
                file_to_dir_feature=file_to_dir_feature,
                package_manifests=package_manifests,
            )

    @staticmethod
    def infer_feature_from_path(rel_path: str) -> str:
        """
        Infers feature ID from directory structure.
        e.g. src/auth/login.py -> auth
        services/payments/checkout.ts -> payments
        packages/ui-components/button.tsx -> ui_components
        root_file.py -> core
        """
        parts = rel_path.replace("\\", "/").split("/")
        if len(parts) == 1:
            return "core"

        # Check for source containers like src/, lib/, packages/, etc.
        if parts[0].lower() in SOURCE_CONTAINERS:
            if len(parts) > 2:
                feature_name = parts[1]
            else:
                feature_name = parts[0]
        else:
            feature_name = parts[0]

        # Sanitize feature_name to a clean identifier
        feature_id = re.sub(r"[^a-zA-Z0-9_]+", "_", feature_name.lower()).strip("_")
        return feature_id if feature_id else "core"
