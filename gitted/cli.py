"""
Command Line Interface for gitted.
"""

import argparse
import os
import sys
from .linter import ADRLinter
from .adr_parser import ADRParser
from .ast_indexer import ASTIndexer
from .context_builder import ContextBuilder


def main():
    parser = argparse.ArgumentParser(
        description="gitted - Automated AST code anchor validation and active status lifecycle engine"
    )
    subparsers = parser.add_subparsers(dest="command", help="Subcommand to execute")

    # Command: lint
    lint_parser = subparsers.add_parser("lint", help="Lint ADR code anchors and verify lifecycle statuses")
    lint_parser.add_argument("--repo", default=".", help="Path to repository root")
    lint_parser.add_argument("--adr-dir", default="docs/adr", help="Path to ADR directory")

    # Command: view
    view_parser = subparsers.add_parser("view", help="View 'Before You Change This' panel for a file")
    view_parser.add_argument("file", help="File path to query context for")
    view_parser.add_argument("--repo", default=".", help="Path to repository root")
    view_parser.add_argument("--adr-dir", default="docs/adr", help="Path to ADR directory")

    # Command: detail
    detail_parser = subparsers.add_parser("detail", help="Render detail view for an ADR")
    detail_parser.add_argument("adr_id", help="ADR ID (e.g. ADR-024) or path to ADR markdown file")
    detail_parser.add_argument("--repo", default=".", help="Path to repository root")
    detail_parser.add_argument("--adr-dir", default="docs/adr", help="Path to ADR directory")

    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        sys.exit(0)

    repo_root = os.path.abspath(args.repo)
    adr_dir = os.path.abspath(os.path.join(repo_root, args.adr_dir)) if not os.path.isabs(args.adr_dir) else args.adr_dir

    if args.command == "lint":
        linter = ADRLinter(repo_root=repo_root, adr_dir=adr_dir)
        report = linter.lint()
        print(report.format_report())
        if not report.is_clean:
            sys.exit(1)

    elif args.command == "view":
        adrs = ADRParser.parse_directory(adr_dir)
        indexer = ASTIndexer(repo_root=repo_root)
        cb = ContextBuilder(adrs=adrs, indexer=indexer)
        panel = cb.render_before_you_change_panel(args.file)
        print(panel)

    elif args.command == "detail":
        adrs = ADRParser.parse_directory(adr_dir)
        indexer = ASTIndexer(repo_root=repo_root)
        target_adr = None

        if os.path.isfile(args.adr_id):
            target_adr = ADRParser.parse_file(args.adr_id)
        else:
            norm_id = args.adr_id.upper()
            if not norm_id.startswith("ADR-") and norm_id.isdigit():
                norm_id = f"ADR-{norm_id}"
            for a in adrs:
                if a.id.upper() == norm_id:
                    target_adr = a
                    break

        if not target_adr:
            print(f"Error: ADR '{args.adr_id}' not found.")
            sys.exit(1)

        indexer.validate_adr(target_adr)
        print(ContextBuilder.render_adr_detail(target_adr))


if __name__ == "__main__":
    main()
