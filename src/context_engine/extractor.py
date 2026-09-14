import ast
import json
import os
import re
from typing import Dict, List, Optional, Set, Tuple

# Requirement 1: Issue keys matching regex [A-Z]+-\d+
ISSUE_KEY_REGEX = re.compile(r"[A-Z]+-\d+")

PACKAGE_JSON_NAME = re.compile(r'"name"\s*:\s*"([^"]+)"')
PYPROJECT_NAME = re.compile(r'(?:\[(?:project|tool\.poetry)\][\s\S]*?)?name\s*=\s*["\']([^"\']+)["\']')
CARGO_NAME = re.compile(r'\[package\][\s\S]*?name\s*=\s*["\']([^"\']+)["\']')
GO_MOD_NAME = re.compile(r'^\s*module\s+([^\s]+)', re.MULTILINE)

JS_TS_IMPORT_REGEX = re.compile(r'(?:import|from|require\()\s*[\'"]([^\'"]+)[\'"]')
GO_IMPORT_REGEX = re.compile(r'import\s+\(?\s*([\s\S]*?)\s*\)?', re.MULTILINE)
GO_SINGLE_IMPORT = re.compile(r'["\']([^"\']+)["\']')
PY_IMPORT_REGEX = re.compile(r'^\s*(?:import|from)\s+([a-zA-Z0-9_\-\.\@]+)', re.MULTILINE)


def extract_issue_keys(text: Optional[str]) -> List[str]:
    r"""
    Extract issue keys (e.g., PAY-482, CHECKOUT-381) matching regex [A-Z]+-\d+ from a string.
    Returns a deduplicated list of issue keys in order of appearance.
    """
    if not text:
        return []

    matches = ISSUE_KEY_REGEX.findall(text)
    seen = set()
    unique_keys = []
    for key in matches:
        key_upper = key.upper()
        if key_upper not in seen:
            seen.add(key_upper)
            unique_keys.append(key_upper)
    return unique_keys


def extract_entity_issue_keys(
    title: Optional[str] = None,
    branch: Optional[str] = None,
    commit_messages: Optional[List[str]] = None,
) -> List[str]:
    """
    Extract issue keys from PR title, branch name, and commit messages.
    Combines and deduplicates keys across all sources.
    """
    seen = set()
    keys = []

    # Helper to collect
    def collect_from_text(t: Optional[str]):
        for k in extract_issue_keys(t):
            if k not in seen:
                seen.add(k)
                keys.append(k)

    collect_from_text(title)
    collect_from_text(branch)

    if commit_messages:
        for msg in commit_messages:
            collect_from_text(msg)

    return keys


def parse_package_manifest(filename: str, content: str) -> Tuple[Optional[str], List[str]]:
    """
    Parses package dependency manifest files (package.json, pyproject.toml, go.mod, Cargo.toml).
    Returns (self_package_name, list_of_dependency_package_names).
    """
    basename = os.path.basename(filename).lower()
    self_pkg: Optional[str] = None
    deps: List[str] = []

    if basename == "package.json":
        try:
            data = json.loads(content)
            if isinstance(data, dict):
                self_pkg = data.get("name")
                for key in ("dependencies", "devDependencies", "peerDependencies", "optionalDependencies"):
                    if key in data and isinstance(data[key], dict):
                        deps.extend(data[key].keys())
        except Exception:
            m = PACKAGE_JSON_NAME.search(content)
            if m:
                self_pkg = m.group(1)
            dep_matches = re.findall(r'"(@?[a-zA-Z0-9_\-\.\/]+)"\s*:\s*"[^"]+"', content)
            for d in dep_matches:
                if d != "name" and d != self_pkg:
                    deps.append(d)

    elif basename == "pyproject.toml":
        m = PYPROJECT_NAME.search(content)
        if m:
            self_pkg = m.group(1)
        raw_deps = re.findall(r'["\']([a-zA-Z0-9_\-\.]+)(?:[><=~^!].*?)?["\']', content)
        for d in raw_deps:
            if d != self_pkg and d not in ("project", "tool", "poetry", "build-system"):
                deps.append(d)

    elif basename == "go.mod":
        m = GO_MOD_NAME.search(content)
        if m:
            self_pkg = m.group(1)
        req_lines = re.findall(r'(?:require\s+([^\s]+)|^\s+([^\s]+)\s+v[0-9])', content, re.MULTILINE)
        for r1, r2 in req_lines:
            pkg = r1 or r2
            if pkg and pkg != "go" and pkg != self_pkg:
                deps.append(pkg)

    elif basename == "cargo.toml":
        m = CARGO_NAME.search(content)
        if m:
            self_pkg = m.group(1)
        in_deps = False
        for line in content.splitlines():
            line_str = line.strip()
            if line_str.startswith("[dependencies]") or line_str.startswith("[dev-dependencies]"):
                in_deps = True
                continue
            elif line_str.startswith("["):
                in_deps = False
            if in_deps and "=" in line_str:
                k = line_str.split("=")[0].strip()
                if k and k != self_pkg:
                    deps.append(k)

    return self_pkg, list(dict.fromkeys(deps))


def extract_ast_imports(filename: str, content: str) -> List[str]:
    """
    Extracts AST import specifiers and module references from source files.
    """
    ext = os.path.splitext(filename)[1].lower()
    imports: Set[str] = set()

    if ext == ".py":
        try:
            tree = ast.parse(content, filename=filename)
            for node in ast.walk(tree):
                if isinstance(node, ast.Import):
                    for alias in node.names:
                        top_mod = alias.name.split('.')[0]
                        imports.add(top_mod)
                        imports.add(alias.name)
                elif isinstance(node, ast.ImportFrom):
                    if node.module:
                        top_mod = node.module.split('.')[0]
                        imports.add(top_mod)
                        imports.add(node.module)
        except Exception:
            for m in PY_IMPORT_REGEX.finditer(content):
                mod = m.group(1)
                imports.add(mod.split('.')[0])
                imports.add(mod)

    elif ext in (".js", ".jsx", ".ts", ".tsx"):
        for m in JS_TS_IMPORT_REGEX.finditer(content):
            specifier = m.group(1)
            if not specifier.startswith("."):
                imports.add(specifier)
                if "/" in specifier and not specifier.startswith("@"):
                    imports.add(specifier.split("/")[0])
                elif specifier.startswith("@") and specifier.count("/") > 1:
                    parts = specifier.split("/")
                    imports.add(f"{parts[0]}/{parts[1]}")

    elif ext == ".go":
        for block in GO_IMPORT_REGEX.finditer(content):
            inner = block.group(1)
            for m in GO_SINGLE_IMPORT.finditer(inner):
                pkg = m.group(1)
                imports.add(pkg)

    return sorted(list(imports))

