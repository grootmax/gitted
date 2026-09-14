"""
Data models for ADRs, Code Anchors, Lifecycle Statuses, Ticket Metadata, and PR Intent.
"""

from dataclasses import dataclass, field
from enum import Enum
from typing import List, Optional, Dict, Any


class ADRStatus(str, Enum):
    ACCEPTED = "Accepted"
    SUPERSEDED = "Superseded"
    DEPRECATED = "Deprecated"
    STALE = "Stale"

    @classmethod
    def from_str(cls, val: str) -> "ADRStatus":
        if not val:
            return cls.ACCEPTED
        str_val = str(val).strip().lower()
        for member in cls:
            if member.value.lower() == str_val:
                return member
        return cls.ACCEPTED


@dataclass
class CodeAnchor:
    file_path: str
    symbol: Optional[str] = None
    line_number: Optional[int] = None

    def __str__(self) -> str:
        if self.symbol:
            return f"{self.file_path}#{self.symbol}"
        return self.file_path

    def to_dict(self) -> Dict[str, Any]:
        res = {"file_path": self.file_path}
        if self.symbol:
            res["symbol"] = self.symbol
        if self.line_number is not None:
            res["line_number"] = self.line_number
        return res


@dataclass
class ValidationResult:
    anchor: CodeAnchor
    is_valid: bool
    reason: str
    suggested_symbol: Optional[str] = None
    suggested_file: Optional[str] = None


@dataclass
class ADR:
    id: str
    title: str
    status: ADRStatus = ADRStatus.ACCEPTED
    superseded_by: Optional[str] = None
    anchors: List[CodeAnchor] = field(default_factory=list)
    content: str = ""
    metadata: Dict[str, Any] = field(default_factory=dict)
    validation_results: List[ValidationResult] = field(default_factory=list)

    @property
    def is_anchored(self) -> bool:
        return len(self.anchors) > 0

    @property
    def is_stale_anchor(self) -> bool:
        """
        Returns True if the ADR has code anchors and at least one anchor failed verification
        while the declared status is ACCEPTED (or STALE).
        """
        if not self.is_anchored:
            return False
        if self.status in (ADRStatus.SUPERSEDED, ADRStatus.DEPRECATED):
            return False
        if self.status == ADRStatus.STALE:
            return True
        return any(not res.is_valid for res in self.validation_results)

    @property
    def effective_status(self) -> ADRStatus:
        """
        Computes the active lifecycle status considering metadata and AST anchor verification.
        """
        if self.status in (ADRStatus.SUPERSEDED, ADRStatus.DEPRECATED):
            return self.status
        if self.is_stale_anchor:
            return ADRStatus.STALE
        return ADRStatus.ACCEPTED

    @property
    def status_badge(self) -> str:
        """
        Returns visual status badge string for UI display.
        """
        eff_status = self.effective_status
        if eff_status == ADRStatus.ACCEPTED:
            return "Active"
        elif eff_status == ADRStatus.SUPERSEDED:
            if self.superseded_by:
                return f"Superseded by {self.superseded_by}"
            return "Superseded"
        elif eff_status == ADRStatus.DEPRECATED:
            return "Deprecated"
        elif eff_status == ADRStatus.STALE:
            return "Stale Anchor"
        return eff_status.value


@dataclass
class TicketData:
    key: str
    title: str
    description: str = ""
    issue_type: str = "Task"
    url: Optional[str] = None
    source: str = "jira"  # 'jira' or 'github'


@dataclass
class CommitData:
    hash: str = ""
    raw_message: str = ""
    commit_type: Optional[str] = None  # e.g. 'feat', 'fix', 'refactor'
    scope: Optional[str] = None
    description: str = ""
    body: str = ""
    is_breaking: bool = False


@dataclass
class PRIntent:
    reason: str
    change_type: str
    affected_areas: List[str] = field(default_factory=list)
    ticket_references: List[str] = field(default_factory=list)
    raw_commits: List[CommitData] = field(default_factory=list)
    tickets: List[TicketData] = field(default_factory=list)
    manual_override: bool = False
    db_schema_context: Dict[str, Any] = field(default_factory=dict)
    db_schema_changes: List[Dict[str, Any]] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        res = {
            "reason": self.reason,
            "change_type": self.change_type,
            "affected_areas": self.affected_areas,
            "ticket_references": self.ticket_references,
            "manual_override": self.manual_override,
        }
        if self.db_schema_context:
            res["db_schema_context"] = self.db_schema_context
        if self.db_schema_changes:
            res["db_schema_changes"] = self.db_schema_changes
        return res


@dataclass
class FeatureRule:
    name: str
    paths: List[str]
    description: str = ""


@dataclass
class FeatureRegistry:
    features: List[FeatureRule] = field(default_factory=list)
