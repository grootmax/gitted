"""
PR Linting and Repository ADR Verification Engine.
"""

from dataclasses import dataclass, field
from typing import List, Dict, Any, Optional
from .models import ADR, ADRStatus
from .adr_parser import ADRParser
from .ast_indexer import ASTIndexer


@dataclass
class LintReport:
    total_adrs: int = 0
    active_count: int = 0
    superseded_count: int = 0
    deprecated_count: int = 0
    stale_count: int = 0
    stale_adrs: List[ADR] = field(default_factory=list)
    errors: List[str] = field(default_factory=list)

    @property
    def is_clean(self) -> bool:
        return self.stale_count == 0 and len(self.errors) == 0

    def format_report(self) -> str:
        lines = ["=== ADR Lifecycle & AST Anchor Lint Report ==="]
        lines.append(f"Total ADRs indexed: {self.total_adrs}")
        lines.append(f"  • Active: {self.active_count}")
        lines.append(f"  • Superseded: {self.superseded_count}")
        lines.append(f"  • Deprecated: {self.deprecated_count}")
        lines.append(f"  • Stale Anchors: {self.stale_count}")

        if self.errors:
            lines.append("\n❌ Lint Errors:")
            for err in self.errors:
                lines.append(f"  - {err}")

        if self.stale_adrs:
            lines.append("\n🚨 ORPHANED / STALE CODE ANCHORS DETECTED:")
            for adr in self.stale_adrs:
                lines.append(f"  • [{adr.status_badge}] {adr.id}: {adr.title}")
                for res in adr.validation_results:
                    if not res.is_valid:
                        lines.append(f"    - Anchor: `{res.anchor}`")
                        lines.append(f"      Reason: {res.reason}")
                        if res.suggested_symbol or res.suggested_file:
                            sugg = []
                            if res.suggested_symbol:
                                sugg.append(f"symbol: `{res.suggested_symbol}`")
                            if res.suggested_file:
                                sugg.append(f"file: `{res.suggested_file}`")
                            lines.append(f"      Suggestion: Consider updating anchor to {', '.join(sugg)}")
                lines.append("    -> Fix: Update code anchor in ADR, declare a replacement ADR (`superseded_by`), or set status to `Deprecated`.")

        if self.is_clean:
            lines.append("\n✅ All ADR code anchors are valid and lifecycle statuses are up to date!")

        return "\n".join(lines)


class ADRLinter:
    """
    Linter engine to verify ADR code anchors and lifecycle transitions during CI / PR checks.
    """

    def __init__(self, repo_root: str, adr_dir: str):
        self.repo_root = repo_root
        self.adr_dir = adr_dir
        self.indexer = ASTIndexer(repo_root)

    def lint(self) -> LintReport:
        adrs = ADRParser.parse_directory(self.adr_dir)
        report = LintReport(total_adrs=len(adrs))

        adr_map: Dict[str, ADR] = {adr.id: adr for adr in adrs}

        for adr in adrs:
            self.indexer.validate_adr(adr)
            eff_status = adr.effective_status

            if eff_status == ADRStatus.ACCEPTED:
                report.active_count += 1
            elif eff_status == ADRStatus.SUPERSEDED:
                report.superseded_count += 1
                # Check superseded_by reference validity
                if adr.superseded_by and adr.superseded_by not in adr_map:
                    report.errors.append(
                        f"{adr.id} points to replacing ADR '{adr.superseded_by}' which was not found in repo."
                    )
            elif eff_status == ADRStatus.DEPRECATED:
                report.deprecated_count += 1
            elif eff_status == ADRStatus.STALE:
                report.stale_count += 1
                report.stale_adrs.append(adr)

        return report
