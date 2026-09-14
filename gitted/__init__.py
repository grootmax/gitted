"""
gitted - Automated AST code anchor validation and active status lifecycle engine
"""

from .models import ADRStatus, CodeAnchor, ADR, ValidationResult
from .adr_parser import ADRParser
from .ast_indexer import ASTIndexer
from .context_builder import ContextBuilder
from .linter import ADRLinter

__version__ = "0.1.0"

__all__ = [
    "ADRStatus",
    "CodeAnchor",
    "ADR",
    "ValidationResult",
    "ADRParser",
    "ASTIndexer",
    "ContextBuilder",
    "ADRLinter",
]
