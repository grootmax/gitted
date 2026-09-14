"""
Command Line Interface for gitted.
"""

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path
from typing import List, Optional

from .linter import ADRLinter
from .adr_parser import ADRParser
from .ast_indexer import ASTIndexer
from .context_builder import ContextBuilder
from .models import PRIntent
from .intent_synthesizer import analyze_pr_context
from .intent_card import generate_intent_card, parse_intent_card_overrides
from .timeline import append_to_timeline

DEFAULT_FEATURES_YML = """# Context Builder Features Registry
features:
  - name: Payments
    description: Payment processing and checkout flows
    paths:
      - "services/payment/**"
      - "src/payments/**"
      - "pkg/payments/**"

  - name: Refunds
    description: Partial and full refund workflows
    paths:
      - "services/refund/**"
      - "src/refunds/**"
      - "pkg/refunds/**"

  - name: Core
    description: Shared modules and core infrastructure
    paths:
      - "src/core/**"
      - "pkg/core/**"
      - "lib/**"
"""

def run_git_cmd(args: List[str]) -> str:
    """Run git command and return stdout."""
    try:
        res = subprocess.run(["git"] + args, capture_output=True, text=True, check=True)
        return res.stdout.strip()
    except Exception:
        return ""

def auto_detect_git_branch() -> str:
    return run_git_cmd(["rev-parse", "--abbrev-ref", "HEAD"])

def auto_detect_git_commits(base_branch: str = "main") -> List[str]:
    out = run_git_cmd(["log", f"origin/{base_branch}..HEAD", "--pretty=format:%B%x1e"])
    if not out:
        out = run_git_cmd(["log", f"{base_branch}..HEAD", "--pretty=format:%B%x1e"])
    if not out:
        out = run_git_cmd(["log", "-n", "10", "--pretty=format:%B%x1e"])

    if not out:
        return []

    commits = [c.strip() for c in out.split("\x1e") if c.strip()]
    return commits

def auto_detect_modified_files(base_branch: str = "main") -> List[str]:
    out = run_git_cmd(["diff", "--name-only", f"origin/{base_branch}..HEAD"])
    if not out:
        out = run_git_cmd(["diff", "--name-only", f"{base_branch}..HEAD"])
    if not out:
        out = run_git_cmd(["diff", "--name-only", "HEAD~1"])
    if not out:
        out = run_git_cmd(["status", "--porcelain"])
        if out:
            lines = out.splitlines()
            out = "\n".join([line[3:] for line in lines if len(line) > 3])

    if not out:
        return []

    return [f.strip() for f in out.splitlines() if f.strip()]

def main():
    parser = argparse.ArgumentParser(
        prog="gitted",
        description="gitted - Automated AST code anchor validation and intent enrichment engine"
    )
    subparsers = parser.add_subparsers(dest="command", help="Subcommands")

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

    # Command: init
    p_init = subparsers.add_parser("init", help="Initialize .contextbuilder directory and features.yml")
    p_init.add_argument("--dir", default=".contextbuilder", help="Directory path for contextbuilder config")

    # Command: analyze
    p_analyze = subparsers.add_parser("analyze", help="Analyze branch, commits, and files to produce PR intent")
    p_analyze.add_argument("--branch", help="Branch name (auto-detected if omitted)")
    p_analyze.add_argument("--pr-title", default="", help="PR title")
    p_analyze.add_argument("--pr-body", default="", help="PR body text")
    p_analyze.add_argument("--commit-msg", action="append", help="Commit message(s)")
    p_analyze.add_argument("--file", action="append", help="Modified file path(s)")
    p_analyze.add_argument("--features-file", default=".contextbuilder/features.yml", help="Path to features.yml")
    p_analyze.add_argument("--base-branch", default="main", help="Git base branch for auto-detection")
    p_analyze.add_argument("--json", action="store_true", help="Output JSON format")

    # Command: card
    p_card = subparsers.add_parser("card", help="Generate Markdown PR Intent preview card")
    p_card.add_argument("--branch", help="Branch name")
    p_card.add_argument("--pr-title", default="", help="PR title")
    p_card.add_argument("--pr-body", default="", help="PR body text")
    p_card.add_argument("--commit-msg", action="append", help="Commit message(s)")
    p_card.add_argument("--file", action="append", help="Modified file path(s)")
    p_card.add_argument("--features-file", default=".contextbuilder/features.yml", help="Path to features.yml")
    p_card.add_argument("--output", help="Save card to file")

    # Command: parse-card
    p_parse = subparsers.add_parser("parse-card", help="Parse edited intent card and extract overrides")
    p_parse.add_argument("card_file", help="Path to intent card markdown file")
    p_parse.add_argument("--json", action="store_true", help="Output JSON format")

    # Command: merge
    p_merge = subparsers.add_parser("merge", help="Persist intent metadata to feature timeline on PR merge")
    p_merge.add_argument("--intent-json", help="JSON string or file path containing intent data")
    p_merge.add_argument("--card-file", help="Intent card Markdown file path")
    p_merge.add_argument("--timeline-file", default=".contextbuilder/timeline.json", help="Timeline file path")
    p_merge.add_argument("--pr-number", type=int, help="PR number")
    p_merge.add_argument("--commit-sha", help="Merged commit SHA")
    p_merge.add_argument("--branch", help="Branch name for auto-analysis if intent/card omitted")
    p_merge.add_argument("--features-file", default=".contextbuilder/features.yml", help="Path to features.yml")

    args = parser.parse_args()

    if not args.command:
        parser.print_help()
        sys.exit(0)

    try:
        if args.command == "lint":
            repo_root = os.path.abspath(args.repo)
            adr_dir = os.path.abspath(os.path.join(repo_root, args.adr_dir)) if not os.path.isabs(args.adr_dir) else args.adr_dir
            linter = ADRLinter(repo_root=repo_root, adr_dir=adr_dir)
            report = linter.lint()
            print(report.format_report())
            if not report.is_clean:
                sys.exit(1)

        elif args.command == "view":
            repo_root = os.path.abspath(args.repo)
            adr_dir = os.path.abspath(os.path.join(repo_root, args.adr_dir)) if not os.path.isabs(args.adr_dir) else args.adr_dir
            adrs = ADRParser.parse_directory(adr_dir)
            indexer = ASTIndexer(repo_root=repo_root)
            cb = ContextBuilder(adrs=adrs, indexer=indexer)
            panel = cb.render_before_you_change_panel(args.file)
            print(panel)

        elif args.command == "detail":
            repo_root = os.path.abspath(args.repo)
            adr_dir = os.path.abspath(os.path.join(repo_root, args.adr_dir)) if not os.path.isabs(args.adr_dir) else args.adr_dir
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

        elif args.command == "init":
            cb_dir = Path(args.dir)
            cb_dir.mkdir(parents=True, exist_ok=True)
            feat_file = cb_dir / "features.yml"
            if not feat_file.exists():
                feat_file.write_text(DEFAULT_FEATURES_YML, encoding="utf-8")
                print(f"Created {feat_file}")
            else:
                print(f"{feat_file} already exists.")

        elif args.command in ("analyze", "card"):
            branch = args.branch or auto_detect_git_branch()
            commits = args.commit_msg if args.commit_msg else auto_detect_git_commits(args.base_branch)
            files = args.file if args.file else auto_detect_modified_files(args.base_branch)

            intent = analyze_pr_context(
                branch_name=branch,
                pr_title=args.pr_title,
                pr_body=args.pr_body,
                commit_messages=commits,
                modified_files=files,
                features_config_path=args.features_file
            )

            if args.command == "analyze":
                if args.json:
                    print(json.dumps(intent.to_dict(), indent=2))
                else:
                    print(f"Reason: {intent.reason}")
                    print(f"Change Type: {intent.change_type}")
                    print(f"Affected Areas: {', '.join(intent.affected_areas)}")
                    print(f"Ticket References: {', '.join(intent.ticket_references)}")

            elif args.command == "card":
                card_text = generate_intent_card(intent)
                if args.output:
                    Path(args.output).write_text(card_text, encoding="utf-8")
                    print(f"Generated intent card saved to {args.output}")
                else:
                    print(card_text)

        elif args.command == "parse-card":
            card_path = Path(args.card_file)
            if not card_path.exists():
                print(f"Error: Card file '{args.card_file}' not found.", file=sys.stderr)
                sys.exit(1)

            card_content = card_path.read_text(encoding="utf-8")
            intent = parse_intent_card_overrides(card_content)
            if args.json:
                print(json.dumps(intent.to_dict(), indent=2))
            else:
                print(f"Reason: {intent.reason}")
                print(f"Change Type: {intent.change_type}")
                print(f"Affected Areas: {', '.join(intent.affected_areas)}")
                print(f"Manual Override: {intent.manual_override}")

        elif args.command == "merge":
            intent: Optional[PRIntent] = None

            if args.card_file and Path(args.card_file).exists():
                card_content = Path(args.card_file).read_text(encoding="utf-8")
                intent = parse_intent_card_overrides(card_content)
            elif args.intent_json:
                json_str = args.intent_json
                if Path(json_str).exists():
                    json_str = Path(json_str).read_text(encoding="utf-8")
                data = json.loads(json_str)
                intent = PRIntent(
                    reason=data.get("reason", "Unclassified change updated in codebase."),
                    change_type=data.get("change_type", "Unclassified Change"),
                    affected_areas=data.get("affected_areas", ["General"]),
                    ticket_references=data.get("ticket_references", []),
                    manual_override=data.get("manual_override", False)
                )
            else:
                branch = args.branch or auto_detect_git_branch()
                commits = auto_detect_git_commits()
                files = auto_detect_modified_files()
                intent = analyze_pr_context(
                    branch_name=branch,
                    commit_messages=commits,
                    modified_files=files,
                    features_config_path=args.features_file
                )

            entry = append_to_timeline(
                timeline_path=args.timeline_file,
                intent=intent,
                pr_number=args.pr_number,
                commit_sha=args.commit_sha
            )
            print(f"Successfully appended intent metadata to timeline at {args.timeline_file}")
            print(json.dumps(entry, indent=2))

    except Exception as e:
        # Guarantee non-blocking execution for intent commands if any unhandled error occurs
        if args.command in ("init", "analyze", "card", "parse-card", "merge"):
            print(f"gitted execution completed with non-blocking warning: {e}", file=sys.stderr)
            sys.exit(0)
        else:
            raise e

if __name__ == "__main__":
    main()
