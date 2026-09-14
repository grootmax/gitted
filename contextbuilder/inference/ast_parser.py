import ast
import os
import re
from typing import Set, Dict, List, Any, Optional


# Common import patterns for standard regex extraction
JS_TS_IMPORT_RE = re.compile(
    r'(?:import\s+[\s\S]*?\s+from\s+[\'"]([^\'"]+)[\'"]|require\s*\(\s*[\'"]([^\'"]+)[\'"]\s*\)|import\s*\(\s*[\'"]([^\'"]+)[\'"]\s*\))'
)
GO_IMPORT_RE = re.compile(r'import\s+(?:\(\s*([\s\S]*?)\s*\)|[\'"]([^\'"]+)[\'"])')
RUST_USE_RE = re.compile(r'use\s+([^;]+);')


class FastASTParser:
    """Deterministic, fast import and DB schema parser for AST import graph construction across languages."""

    @staticmethod
    def extract_db_schema(abs_file_path: str = "", rel_file_path: str = "", content: Optional[str] = None) -> Dict[str, Any]:
        """
        Extracts database tables, DDL operations (CREATE, ALTER, DROP), and ORM model entity definitions
        from SQL files, Alembic/Django migration scripts, and Python AST source code.
        """
        tables: Set[str] = set()
        models: Set[str] = set()
        ddl_ops: List[Dict[str, str]] = []
        seen_ops: Set[str] = set()

        if content is None:
            if abs_file_path and os.path.isfile(abs_file_path):
                try:
                    with open(abs_file_path, "r", encoding="utf-8", errors="ignore") as f:
                        content = f.read(100_000)
                except Exception:
                    content = ""
            else:
                content = ""

        target_path = rel_file_path or abs_file_path
        ext = os.path.splitext(target_path)[1].lower() if target_path else ""

        def add_op(op_type: str, table_name: str):
            clean_tbl = table_name.strip("`'\" \t;")
            if not clean_tbl:
                return
            tables.add(clean_tbl)
            key = f"{op_type.upper()}:{clean_tbl}"
            if key not in seen_ops:
                seen_ops.add(key)
                ddl_ops.append({"operation": op_type.upper(), "table": clean_tbl})

        # 1. SQL DDL Statements (CREATE, ALTER, DROP)
        sql_ddl_patterns = [
            (r'CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?["`\']?([a-zA-Z0-9_]+)["`\']?', 'CREATE'),
            (r'ALTER\s+TABLE\s+(?:ONLY\s+)?["`\']?([a-zA-Z0-9_]+)["`\']?', 'ALTER'),
            (r'DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?["`\']?([a-zA-Z0-9_]+)["`\']?', 'DROP'),
        ]
        for pattern, op_type in sql_ddl_patterns:
            for match in re.finditer(pattern, content, re.IGNORECASE):
                add_op(op_type, match.group(1))

        # General SQL queries: INSERT INTO, UPDATE, DELETE FROM, FROM, JOIN
        query_table_patterns = [
            r'INSERT\s+INTO\s+["`\']?([a-zA-Z0-9_]+)["`\']?',
            r'UPDATE\s+["`\']?([a-zA-Z0-9_]+)["`\']?',
            r'DELETE\s+FROM\s+["`\']?([a-zA-Z0-9_]+)["`\']?',
            r'FROM\s+["`\']?([a-zA-Z0-9_]+)["`\']?',
            r'JOIN\s+["`\']?([a-zA-Z0-9_]+)["`\']?',
        ]
        for pattern in query_table_patterns:
            for match in re.finditer(pattern, content, re.IGNORECASE):
                tbl = match.group(1).strip("`'\" \t;")
                if tbl.upper() not in ("SELECT", "WHERE", "SET", "VALUES", "INNER", "LEFT", "RIGHT", "OUTER", "TABLE"):
                    tables.add(tbl)

        # 2. Alembic Migrations (Python)
        alembic_patterns = [
            (r'op\.create_table\(\s*["\']([a-zA-Z0-9_]+)["\']', 'CREATE'),
            (r'op\.(?:add_column|alter_column|drop_column|create_index|create_foreign_key|create_check_constraint)\(\s*["\']([a-zA-Z0-9_]+)["\']', 'ALTER'),
            (r'op\.drop_table\(\s*["\']([a-zA-Z0-9_]+)["\']', 'DROP'),
            (r'op\.rename_table\(\s*["\']([a-zA-Z0-9_]+)["\']\s*,\s*["\']([a-zA-Z0-9_]+)["\']', 'ALTER'),
        ]
        for pattern, op_type in alembic_patterns:
            for match in re.finditer(pattern, content):
                add_op(op_type, match.group(1))
                if len(match.groups()) > 1 and match.group(2):
                    add_op(op_type, match.group(2))

        # 3. Django Migrations (Python)
        django_patterns = [
            (r'migrations\.CreateModel\(\s*name\s*=\s*["\']([a-zA-Z0-9_]+)["\']', 'CREATE'),
            (r'migrations\.(?:AddField|AlterField|RemoveField|RenameField|AlterModelTable)\(\s*model_name\s*=\s*["\']([a-zA-Z0-9_]+)["\']', 'ALTER'),
            (r'migrations\.DeleteModel\(\s*name\s*=\s*["\']([a-zA-Z0-9_]+)["\']', 'DROP'),
        ]
        for pattern, op_type in django_patterns:
            for match in re.finditer(pattern, content):
                tbl_or_model = match.group(1)
                models.add(tbl_or_model)
                add_op(op_type, tbl_or_model)

        # 4. Python AST Parsing (Django / SQLAlchemy / ORM models)
        if ext == ".py" or "class " in content:
            try:
                tree = ast.parse(content)
                for node in ast.walk(tree):
                    if isinstance(node, ast.ClassDef):
                        is_orm = False
                        for base in node.bases:
                            base_str = ""
                            if isinstance(base, ast.Name):
                                base_str = base.id
                            elif isinstance(base, ast.Attribute):
                                base_str = base.attr
                            if base_str in ("Model", "Base", "Entity", "DeclarativeBase"):
                                is_orm = True
                                break

                        table_name = None
                        for item in node.body:
                            if isinstance(item, ast.Assign):
                                for target in item.targets:
                                    if isinstance(target, ast.Name) and target.id == "__tablename__":
                                        if isinstance(item.value, ast.Constant) and isinstance(item.value.value, str):
                                            table_name = item.value.value

                        if is_orm or table_name or node.name.endswith(("Model", "Entity", "Table")):
                            models.add(node.name)
                            if table_name:
                                tables.add(table_name)
                            else:
                                tables.add(node.name.lower())
            except Exception:
                pass

        return {
            "tables": sorted(list(tables)),
            "models": sorted(list(models)),
            "ddlOperations": ddl_ops,
        }

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
