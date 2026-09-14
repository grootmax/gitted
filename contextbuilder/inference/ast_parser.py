import ast
import os
import re
from typing import Set


# Common import patterns for standard regex extraction
JS_TS_IMPORT_RE = re.compile(
    r'(?:import\s+[\s\S]*?\s+from\s+[\'"]([^\'"]+)[\'"]|require\s*\(\s*[\'"]([^\'"]+)[\'"]\s*\)|import\s*\(\s*[\'"]([^\'"]+)[\'"]\s*\))'
)
GO_IMPORT_RE = re.compile(r'import\s+(?:\(\s*([\s\S]*?)\s*\)|[\'"]([^\'"]+)[\'"])')
RUST_USE_RE = re.compile(r'use\s+([^;]+);')


class FastASTParser:
    """Deterministic, fast import parser for AST import graph construction across languages."""

    @staticmethod
    def extract_imports(abs_file_path: str, rel_file_path: str) -> Set[str]:
        imports: Set[str] = set()
        ext = os.path.splitext(rel_file_path)[1].lower()

        if not os.path.isfile(abs_file_path):
            return imports

        try:
            with open(abs_file_path, "r", encoding="utf-8", errors="ignore") as f:
                content = f.read(100_000)  # Read up to first 100KB for imports
        except Exception:
            return imports

        if ext == ".py":
            imports.update(FastASTParser._extract_python_ast_imports(content))
        elif ext in (".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"):
            imports.update(FastASTParser._extract_js_ts_imports(content))
        elif ext == ".go":
            imports.update(FastASTParser._extract_go_imports(content))
        elif ext == ".rs":
            imports.update(FastASTParser._extract_rust_imports(content))
        else:
            # General fallback regex for generic import lines
            imports.update(FastASTParser._extract_generic_imports(content))

        return imports

    @staticmethod
    def _extract_python_ast_imports(content: str) -> Set[str]:
        imports = set()
        try:
            tree = ast.parse(content)
            for node in ast.walk(tree):
                if isinstance(node, ast.Import):
                    for alias in node.names:
                        imports.add(alias.name.split(".")[0])
                elif isinstance(node, ast.ImportFrom):
                    if node.module:
                        imports.add(node.module.split(".")[0])
                    elif node.level and node.level > 0:
                        # Relative import
                        imports.add("relative_import")
        except Exception:
            # Fallback to regex if syntax error
            for line in content.splitlines():
                line = line.strip()
                if line.startswith("import ") or line.startswith("from "):
                    parts = line.split()
                    if len(parts) >= 2:
                        imports.add(parts[1].split(".")[0])
        return imports

    @staticmethod
    def _extract_js_ts_imports(content: str) -> Set[str]:
        imports = set()
        for match in JS_TS_IMPORT_RE.finditer(content):
            target = match.group(1) or match.group(2) or match.group(3)
            if target:
                imports.add(target)
        return imports

    @staticmethod
    def _extract_go_imports(content: str) -> Set[str]:
        imports = set()
        for match in GO_IMPORT_RE.finditer(content):
            block = match.group(1)
            single = match.group(2)
            if single:
                imports.add(single)
            elif block:
                for line in block.splitlines():
                    clean_line = line.strip().strip('"').strip('`')
                    if clean_line:
                        imports.add(clean_line.split("/")[-1])
        return imports

    @staticmethod
    def _extract_rust_imports(content: str) -> Set[str]:
        imports = set()
        for match in RUST_USE_RE.finditer(content):
            mod_path = match.group(1).strip()
            first_segment = mod_path.split("::")[0]
            imports.add(first_segment)
        return imports

    @staticmethod
    def _extract_generic_imports(content: str) -> Set[str]:
        imports = set()
        for line in content.splitlines():
            line = line.strip()
            if line.startswith(("import ", "from ", "include ", "require ", "#include ")):
                parts = line.split()
                if len(parts) >= 2:
                    imports.add(parts[1].strip('"\';<>'))
        return imports
