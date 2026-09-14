"""
AST Codebase Indexer and Code Anchor Validation Engine.
"""

import ast
import difflib
import os
import re
import subprocess
from typing import Dict, Set, List, Optional, Tuple
from .models import CodeAnchor, ValidationResult, ADR, ADRStatus


class ASTIndexer:
    """
    Parses repository files to build an AST symbol index and validates ADR code anchors.
    """

    def __init__(self, repo_root: str):
        self.repo_root = os.path.abspath(repo_root)
        self.file_index: Set[str] = set()
        self.symbol_index: Dict[str, Set[str]] = {}
        self.global_symbol_index: Dict[str, Set[str]] = {}
        self._index_repo()

    def _index_repo(self) -> None:
        """
        Traverse repo_root, collecting file paths and parsing symbols into indices.
        """

        skip_dirs = {".git", "__pycache__", ".pytest_cache", "node_modules", "venv", ".venv"}

        for root, dirs, files in os.walk(self.repo_root):
            dirs[:] = [d for d in dirs if d not in skip_dirs]

            for file in files:
                full_path = os.path.join(root, file)
                rel_path = os.path.relpath(full_path, self.repo_root).replace("\\", "/")

                self.file_index.add(rel_path)
                symbols = self._extract_symbols_from_file(full_path, rel_path)
                self.symbol_index[rel_path] = symbols

                for sym in symbols:
                    if sym not in self.global_symbol_index:
                        self.global_symbol_index[sym] = set()
                    self.global_symbol_index[sym].add(rel_path)

    def _extract_symbols_from_file(self, full_path: str, rel_path: str) -> Set[str]:
        symbols: Set[str] = set()

        if rel_path.endswith(".py"):
            try:
                with open(full_path, "r", encoding="utf-8") as f:
                    source = f.read()
                tree = ast.parse(source, filename=full_path)
                symbols.update(self._extract_python_symbols(tree))
            except Exception:
                # Fallback to regex if parsing fails
                symbols.update(self._extract_regex_symbols(full_path))
        else:
            symbols.update(self._extract_regex_symbols(full_path))

        return symbols

    def _extract_python_symbols(self, tree: ast.AST) -> Set[str]:
        symbols: Set[str] = set()

        for node in ast.walk(tree):
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                symbols.add(node.name)
            elif isinstance(node, ast.ClassDef):
                symbols.add(node.name)
                # Method names as Class.method
                for item in node.body:
                    if isinstance(item, (ast.FunctionDef, ast.AsyncFunctionDef)):
                        symbols.add(f"{node.name}.{item.name}")
                        symbols.add(item.name)  # Also allow standalone method name

        return symbols

    def _extract_regex_symbols(self, full_path: str) -> Set[str]:
        symbols: Set[str] = set()
        try:
            with open(full_path, "r", encoding="utf-8", errors="ignore") as f:
                content = f.read()

            # Matches function/class/method patterns across languages
            patterns = [
                r"(?:function|def|fn|func|class|interface|type|struct)\s+([A-Za-z0-9_]+)",
                r"(?:const|let|var)\s+([A-Za-z0-9_]+)\s*=\s*(?:function|\([^)]*\)\s*=>)",
                r"([A-Za-z0-9_]+)\s*\([^)]*\)\s*\{",  # standard function defs
            ]

            for pattern in patterns:
                matches = re.findall(pattern, content)
                for m in matches:
                    if len(m) > 1 and not m in ("if", "for", "while", "switch", "catch"):
                        symbols.add(m)
        except Exception:
            pass

        return symbols

    def validate_anchor(self, anchor: CodeAnchor) -> ValidationResult:
        rel_path = anchor.file_path.replace("\\", "/")

        # 1. File path check
        if rel_path not in self.file_index:
            # File missing - search for moved/renamed file or git history
            suggested_file = self._find_renamed_file(rel_path, anchor.symbol)
            reason = f"File '{rel_path}' not found in repository"
            if suggested_file:
                reason += f" (suggested file: '{suggested_file}')"
            return ValidationResult(
                anchor=anchor,
                is_valid=False,
                reason=reason,
                suggested_file=suggested_file
            )

        # 2. File exists, check symbol
        if not anchor.symbol:
            return ValidationResult(
                anchor=anchor,
                is_valid=True,
                reason=f"File '{rel_path}' exists"
            )

        file_symbols = self.symbol_index.get(rel_path, set())

        # Exact match check
        if anchor.symbol in file_symbols:
            return ValidationResult(
                anchor=anchor,
                is_valid=True,
                reason=f"Symbol '{anchor.symbol}' exists in '{rel_path}'"
            )

        # 3. Exact symbol match failed -> attempt fuzzy matching & git blame resolution
        suggested_symbol, suggested_file = self._resolve_renamed_or_moved_symbol(rel_path, anchor.symbol)

        reason = f"Symbol '{anchor.symbol}' not found in '{rel_path}'"
        if suggested_symbol or suggested_file:
            sugg_str = []
            if suggested_symbol:
                sugg_str.append(f"symbol '{suggested_symbol}'")
            if suggested_file and suggested_file != rel_path:
                sugg_str.append(f"file '{suggested_file}'")
            reason += f" (fuzzy match: {', '.join(sugg_str)})"

        return ValidationResult(
            anchor=anchor,
            is_valid=False,
            reason=reason,
            suggested_symbol=suggested_symbol,
            suggested_file=suggested_file
        )

    def validate_adr(self, adr: ADR) -> List[ValidationResult]:
        """
        Validates all anchors for an ADR and attaches results to adr.validation_results.
        """
        results = []
        if not adr.is_anchored:
            # Unanchored general ADRs remain active
            res = ValidationResult(
                anchor=CodeAnchor(file_path="[General]"),
                is_valid=True,
                reason="General ADR (unanchored)"
            )
            results.append(res)
        else:
            for anchor in adr.anchors:
                res = self.validate_anchor(anchor)
                results.append(res)

        adr.validation_results = results

        # If any anchor failed and status is ACCEPTED, effective status becomes STALE
        if adr.is_stale_anchor and adr.status == ADRStatus.ACCEPTED:
            # Note: We do not overwrite adr.status in place if we want to preserve metadata status,
            # but effective_status will report STALE.
            pass

        return results

    def _resolve_renamed_or_moved_symbol(
        self, file_path: str, symbol: str
    ) -> Tuple[Optional[str], Optional[str]]:
        """
        Attempts fuzzy matching within the file, global symbol index lookup, or git blame tracking.
        """
        # A. Fuzzy match within file
        file_symbols = list(self.symbol_index.get(file_path, set()))
        if file_symbols:
            matches = difflib.get_close_matches(symbol, file_symbols, n=1, cutoff=0.6)
            if matches:
                return matches[0], file_path

        # B. Global search: symbol exists in another file
        if symbol in self.global_symbol_index:
            other_files = list(self.global_symbol_index[symbol])
            if other_files:
                return symbol, other_files[0]

        # C. Global fuzzy match across all symbols
        all_symbols = list(self.global_symbol_index.keys())
        if all_symbols:
            global_matches = difflib.get_close_matches(symbol, all_symbols, n=1, cutoff=0.7)
            if global_matches:
                match_sym = global_matches[0]
                target_file = list(self.global_symbol_index[match_sym])[0]
                return match_sym, target_file

        # D. Git history tracking fallback
        git_sym, git_file = self._check_git_history(file_path, symbol)
        if git_sym or git_file:
            return git_sym, git_file

        return None, None

    def _find_renamed_file(self, file_path: str, symbol: Optional[str]) -> Optional[str]:
        # Fuzzy match path against existing files
        all_files = list(self.file_index)
        if all_files:
            matches = difflib.get_close_matches(file_path, all_files, n=1, cutoff=0.6)
            if matches:
                return matches[0]

        # Check if symbol exists elsewhere
        if symbol and symbol in self.global_symbol_index:
            return list(self.global_symbol_index[symbol])[0]

        # Git follow check
        _, git_file = self._check_git_history(file_path, symbol)
        return git_file

    def _check_git_history(self, file_path: str, symbol: Optional[str]) -> Tuple[Optional[str], Optional[str]]:
        """
        Executes git log commands to track renamed files or moved symbols locally without external networks.
        """
        try:
            # Check git log for file renames
            cmd = ["git", "-C", self.repo_root, "log", "--follow", "--name-status", "--oneline", "-n", "5", "--", file_path]
            output = subprocess.check_output(cmd, stderr=subprocess.DEVNULL, text=True)
            for line in output.splitlines():
                if line.startswith("R"): # Rename line e.g. R100 old_path new_path
                    parts = line.split()
                    if len(parts) >= 3:
                        new_file = parts[2]
                        if new_file in self.file_index:
                            return symbol, new_file
        except Exception:
            pass

        return None, None
