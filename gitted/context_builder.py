"""
Context Builder for developer warning views and ADR detail views.
"""

import json
import yaml
from pathlib import Path
from typing import List, Dict, Any, Optional, Union
from .models import ADR, ADRStatus, CodeAnchor
from .ast_indexer import ASTIndexer


class ContextBuilder:
    """
    Builds context warnings and "Before You Change This" panels for developers,
    along with database schema lineage tracking across feature timelines.
    """

    def __init__(self, adrs: List[ADR], indexer: Optional[ASTIndexer] = None):
        self.adrs = adrs
        self.indexer = indexer
        if self.indexer:
            self._validate_all_adrs()

    def _validate_all_adrs(self) -> None:
        if not self.indexer:
            return
        for adr in self.adrs:
            self.indexer.validate_adr(adr)

    def refresh(self) -> None:
        if self.indexer:
            self._validate_all_adrs()

    def get_file_context(self, file_path: str) -> Dict[str, Any]:
        """
        Retrieves active ADRs, stale anchor warnings, and suppressed ADRs for a given file.
        """
        norm_path = file_path.replace("\\", "/").strip()

        active_adrs: List[ADR] = []
        stale_adrs: List[ADR] = []
        suppressed_adrs: List[ADR] = []

        for adr in self.adrs:
            eff_status = adr.effective_status

            # Check if ADR is relevant to this file
            matches_file = False
            if not adr.is_anchored:
                # Unanchored general ADRs apply repo-wide
                matches_file = True
            else:
                for anchor in adr.anchors:
                    if anchor.file_path.replace("\\", "/").strip() == norm_path:
                        matches_file = True
                        break
                    # Also match if file_path ends with anchor file path or vice versa
                    elif norm_path.endswith(anchor.file_path.strip()) or anchor.file_path.strip().endswith(norm_path):
                        matches_file = True
                        break

            if not matches_file:
                continue

            # Filtering logic according to Requirement 3:
            # Filter out Superseded or Deprecated ADRs from primary alerts
            if eff_status in (ADRStatus.SUPERSEDED, ADRStatus.DEPRECATED):
                suppressed_adrs.append(adr)
            elif eff_status == ADRStatus.STALE:
                stale_adrs.append(adr)
            elif eff_status == ADRStatus.ACCEPTED:
                active_adrs.append(adr)

        return {
            "file_path": norm_path,
            "active_adrs": active_adrs,
            "stale_adrs": stale_adrs,
            "suppressed_adrs": suppressed_adrs,
        }

    def render_before_you_change_panel(self, file_path: str) -> str:
        """
        Renders the "Before You Change This" panel string for a file.
        """
        context = self.get_file_context(file_path)
        lines = [f"=== Before You Change This: {context['file_path']} ==="]

        # 1. Stale Anchor Warnings (High Priority Flag)
        if context["stale_adrs"]:
            lines.append("\n⚠️  STALE ANCHOR WARNINGS:")
            for adr in context["stale_adrs"]:
                lines.append(f"  • [{adr.status_badge}] {adr.id}: {adr.title}")
                for res in adr.validation_results:
                    if not res.is_valid:
                        lines.append(f"    - Broken Anchor: {res.anchor} ({res.reason})")
                lines.append("    -> Action Required: Update code anchor, declare replacement ADR, or deprecate record.")

        # 2. Active Architectural Decision Records
        if context["active_adrs"]:
            lines.append("\n📋 ACTIVE ARCHITECTURAL DECISIONS:")
            for adr in context["active_adrs"]:
                badge = f"[{adr.status_badge}]"
                lines.append(f"  • {badge} {adr.id}: {adr.title}")

        # 3. Summary of suppressed ADRs
        if context["suppressed_adrs"]:
            lines.append(f"\n🙈 SUPPRESSED OUTDATED DECISIONS ({len(context['suppressed_adrs'])}):")
            for adr in context["suppressed_adrs"]:
                lines.append(f"  - [{adr.status_badge}] {adr.id}: {adr.title}")

        if not context["active_adrs"] and not context["stale_adrs"] and not context["suppressed_adrs"]:
            lines.append("\nNo active architectural decision records associated with this file.")

        return "\n".join(lines)

    @staticmethod
    def render_adr_detail(adr: ADR) -> str:
        """
        Renders an ADR detail view with clear visual status badges and replacement links.
        """
        lines = []
        lines.append(f"# {adr.id}: {adr.title}")
        lines.append(f"**Status:** [{adr.status_badge}]")

        if adr.superseded_by:
            lines.append(f"**Superseded By:** {adr.superseded_by}")

        if adr.anchors:
            lines.append("\n### Code Anchors")
            for anchor in adr.anchors:
                lines.append(f"- `{anchor}`")

        if adr.validation_results:
            lines.append("\n### Anchor Verification Status")
            for res in adr.validation_results:
                status_str = "✅ Valid" if res.is_valid else "❌ Stale / Invalid"
                lines.append(f"- `{res.anchor}`: {status_str} — {res.reason}")

        if adr.content:
            lines.append("\n### Content")
            lines.append(adr.content.strip())

        return "\n".join(lines)

    @staticmethod
    def get_schema_lineage(table_name: str, timeline_path: Union[str, Path] = ".contextbuilder/timeline.json") -> List[Dict[str, Any]]:
        """
        Retrieves database schema evolution timeline and change history for a table across feature timeline records.
        """
        clean_tbl = table_name.lower().strip()
        path = Path(timeline_path) if isinstance(timeline_path, (str, Path)) else None
        
        events: List[Dict[str, Any]] = []
        if not path or not path.exists():
            return events

        try:
            if path.suffix in [".yml", ".yaml"]:
                with open(path, "r", encoding="utf-8") as f:
                    data = yaml.safe_load(f) or {}
            else:
                with open(path, "r", encoding="utf-8") as f:
                    data = json.load(f) or {}
            
            entries = data.get("entries", [])
            for entry in entries:
                changes = entry.get("db_schema_changes", [])
                context = entry.get("db_schema_context", {})
                
                table_matched = False
                for ch in changes:
                    if ch.get("table", "").lower() == clean_tbl:
                        events.append({
                            "timestamp": entry.get("timestamp"),
                            "pr_number": entry.get("pr_number"),
                            "commit_sha": entry.get("commit_sha"),
                            "operation": ch.get("operation", "ALTER"),
                            "table": clean_tbl,
                            "affected_areas": entry.get("affected_areas", []),
                            "reason": entry.get("reason", "")
                        })
                        table_matched = True
                        break
                
                if not table_matched and context:
                    tbls = [t.lower() for t in context.get("tables", [])]
                    if clean_tbl in tbls:
                        events.append({
                            "timestamp": entry.get("timestamp"),
                            "pr_number": entry.get("pr_number"),
                            "commit_sha": entry.get("commit_sha"),
                            "operation": "MODIFY",
                            "table": clean_tbl,
                            "affected_areas": entry.get("affected_areas", []),
                            "reason": entry.get("reason", "")
                        })
        except Exception:
            pass

        return events
