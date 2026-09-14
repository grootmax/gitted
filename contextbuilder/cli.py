import argparse
import json
import os
import sys

from contextbuilder.inference.clustering import FeatureClusterer
from contextbuilder.inference.resolver import DynamicFeatureResolver
from contextbuilder.ui.formatter import UIFormatter


def main():
    parser = argparse.ArgumentParser(
        prog="contextbuilder",
        description="Automated heuristic directory mapping and dynamic feature inference engine",
    )
    subparsers = parser.add_subparsers(dest="command", help="Command to run")

    # Scan command
    scan_parser = subparsers.add_parser("scan", help="Scan repository and infer feature boundaries")
    scan_parser.add_argument("repo_dir", nargs="?", default=".", help="Target repository directory (default: current directory)")
    scan_parser.add_argument("--json", action="store_true", help="Output results in JSON format")

    # Resolve command
    resolve_parser = subparsers.add_parser("resolve", help="Dynamically resolve feature mapping for a target file path")
    resolve_parser.add_argument("file_path", help="Relative path of file to resolve")
    resolve_parser.add_argument("--repo", default=".", help="Target repository directory")
    resolve_parser.add_argument("--json", action="store_true", help="Output results in JSON format")

    # Status command
    status_parser = subparsers.add_parser("status", help="Show current feature registry status")
    status_parser.add_argument("repo_dir", nargs="?", default=".", help="Target repository directory")
    status_parser.add_argument("--json", action="store_true", help="Output results in JSON format")

    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        sys.exit(0)

    if args.command == "scan" or args.command == "status":
        repo_dir = os.path.abspath(args.repo_dir)
        clusterer = FeatureClusterer(repo_dir)
        registry = clusterer.infer_registry()

        if args.json:
            print(json.dumps(registry.to_dict(), indent=2))
        else:
            print(UIFormatter.format_registry_tree(registry))

    elif args.command == "resolve":
        repo_dir = os.path.abspath(args.repo)
        clusterer = FeatureClusterer(repo_dir)
        registry = clusterer.infer_registry()

        resolver = DynamicFeatureResolver(repo_dir, registry)
        assoc = resolver.resolve_path(args.file_path)

        if args.json:
            res_dict = {
                "path": assoc.path,
                "feature_id": assoc.feature_id,
                "status": assoc.status.value,
                "score": assoc.score,
                "reason": assoc.reason,
            }
            print(json.dumps(res_dict, indent=2))
        else:
            print(UIFormatter.format_resolution(assoc))


if __name__ == "__main__":
    main()
