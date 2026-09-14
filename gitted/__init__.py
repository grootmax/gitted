"""
gitted - Automated AST code anchor validation and intent enrichment engine
"""

from .models import (
    ADR,
    CodeAnchor,
    ADRStatus,
    ValidationResult,
    TicketData,
    CommitData,
    PRIntent,
    FeatureRule,
    FeatureRegistry,
)
from .adr_parser import ADRParser
from .ast_indexer import ASTIndexer
from .linter import ADRLinter
from .context_builder import ContextBuilder
from .intent_synthesizer import analyze_pr_context
from .intent_card import generate_intent_card, parse_intent_card_overrides
from .timeline import append_to_timeline

__version__ = "0.1.0"
__all__ = [
    "ADR",
    "CodeAnchor",
    "ADRStatus",
    "ValidationResult",
    "TicketData",
    "CommitData",
    "PRIntent",
    "FeatureRule",
    "FeatureRegistry",
    "ADRParser",
    "ASTIndexer",
    "ADRLinter",
    "ContextBuilder",
    "analyze_pr_context",
    "generate_intent_card",
    "parse_intent_card_overrides",
    "append_to_timeline",
]
