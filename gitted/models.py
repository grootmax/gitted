"""
Data models for ADRs, Code Anchors, and Lifecycle Statuses.
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
