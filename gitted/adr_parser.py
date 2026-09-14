"""
ADR Markdown file and metadata parser.
"""

import os
import re
from typing import List, Dict, Any, Optional
from .models import ADR, ADRStatus, CodeAnchor


class ADRParser:
    """
    Parses Markdown ADR files with YAML frontmatter or structured header metadata.
    """

    @staticmethod
    def parse_string(content: str, file_path: str = "") -> ADR:
        metadata, body = ADRParser._extract_frontmatter(content)

        # Title extraction fallback if not in metadata
        title = metadata.get("title")
        if not title:
            title_match = re.search(r"^#\s+(.+)$", body, re.MULTILINE)
            if title_match:
                title = title_match.group(1).strip()
            else:
                title = os.path.basename(file_path) if file_path else "Untitled ADR"

        # ID extraction fallback
        adr_id = metadata.get("id")
        if not adr_id:
            # Check title or filename e.g., ADR-024 or 0024
            id_match = re.search(r"\b(ADR-\d+|\b\d{3,4}\b)", title, re.IGNORECASE) or \
                       re.search(r"\b(ADR-\d+|\b\d{3,4}\b)", os.path.basename(file_path), re.IGNORECASE)
            if id_match:
                raw_id = id_match.group(1)
                adr_id = raw_id.upper() if raw_id.upper().startswith("ADR-") else f"ADR-{raw_id}"
            else:
                adr_id = "ADR-UNKNOWN"

        # Status
        raw_status = metadata.get("status", "Accepted")
        status = ADRStatus.from_str(raw_status)

        # Superseded by
        superseded_by = metadata.get("superseded_by") or metadata.get("superseded-by")
        if superseded_by and not str(superseded_by).upper().startswith("ADR-") and str(superseded_by).isdigit():
            superseded_by = f"ADR-{superseded_by}"

        # Anchors from metadata or body
        raw_anchors = metadata.get("anchors", [])
        anchors = ADRParser._parse_anchors(raw_anchors)

        # If no frontmatter anchors, search body for "Anchors: ..." or "Code Anchors: ..."
        if not anchors:
            body_anchors = ADRParser._extract_anchors_from_body(body)
            anchors.extend(body_anchors)

        # If status says superseded, extract replacing ADR from body if not in metadata
        if status == ADRStatus.SUPERSEDED and not superseded_by:
            sup_match = re.search(r"superseded\s+by\s+(ADR-\d+|\d{3,4})", body, re.IGNORECASE)
            if sup_match:
                raw_sup = sup_match.group(1)
                superseded_by = raw_sup.upper() if raw_sup.upper().startswith("ADR-") else f"ADR-{raw_sup}"

        return ADR(
            id=adr_id,
            title=title,
            status=status,
            superseded_by=superseded_by,
            anchors=anchors,
            content=body,
            metadata=metadata
        )

    @staticmethod
    def parse_file(file_path: str) -> ADR:
        with open(file_path, "r", encoding="utf-8") as f:
            content = f.read()
        return ADRParser.parse_string(content, file_path=file_path)

    @staticmethod
    def parse_directory(dir_path: str) -> List[ADR]:
        adrs = []
        if not os.path.exists(dir_path):
            return adrs

        for root, _, files in os.walk(dir_path):
            for file in sorted(files):
                if file.endswith(".md"):
                    full_path = os.path.join(root, file)
                    try:
                        adrs.append(ADRParser.parse_file(full_path))
                    except Exception:
                        pass
        return adrs

    @staticmethod
    def _extract_frontmatter(content: str) -> (Dict[str, Any], str):
        metadata = {}
        body = content

        # Check for YAML frontmatter between ---
        frontmatter_match = re.match(r"^\s*---\s*\n(.*?)\n\s*---\s*\n(.*)$", content, re.DOTALL)
        if frontmatter_match:
            yaml_block = frontmatter_match.group(1)
            body = frontmatter_match.group(2)
            try:
                import yaml
                parsed = yaml.safe_load(yaml_block)
                if isinstance(parsed, dict):
                    metadata = parsed
            except Exception:
                metadata = ADRParser._parse_simple_yaml(yaml_block)
        else:
            # Check for header metadata in Markdown comments or bullet lists
            header_meta = ADRParser._extract_header_metadata(content)
            if header_meta:
                metadata.update(header_meta)

        return metadata, body

    @staticmethod
    def _parse_simple_yaml(yaml_text: str) -> Dict[str, Any]:
        """
        Lightweight YAML parser for frontmatter metadata without external dependencies.
        """
        data: Dict[str, Any] = {}
        lines = yaml_text.splitlines()
        current_key = None
        last_item_indent = 0

        for line in lines:
            raw_indent = len(line) - len(line.lstrip())
            line_str = line.strip()
            if not line_str or line_str.startswith("#"):
                continue

            # List item under a key
            if line_str.startswith("-") and current_key:
                val = line_str[1:].strip()
                if current_key not in data or not isinstance(data[current_key], list):
                    data[current_key] = []
                # Check dict inside list: - file: foo, symbol: bar
                if ":" in val:
                    kv_parts = val.split(":", 1)
                    item_key = kv_parts[0].strip()
                    item_val = kv_parts[1].strip().strip("\"'")
                    data[current_key].append({item_key: item_val})
                else:
                    data[current_key].append(val.strip("\"'"))
                last_item_indent = raw_indent
                continue

            # Key-value pair
            if ":" in line_str:
                parts = line_str.split(":", 1)
                key = parts[0].strip()
                val = parts[1].strip().strip("\"'")
                if (current_key in data and isinstance(data[current_key], list)
                        and data[current_key] and isinstance(data[current_key][-1], dict)
                        and raw_indent > last_item_indent):
                    data[current_key][-1][key] = val
                else:
                    current_key = key
                    last_item_indent = raw_indent
                    if val:
                        data[key] = val
                    else:
                        data[key] = []

        return data

    @staticmethod
    def _extract_header_metadata(content: str) -> Dict[str, Any]:
        meta = {}
        # Parse lines like "Status: Accepted", "Superseded by: ADR-082", "Anchors: file.py#func"
        for line in content.splitlines()[:20]:
            match = re.match(r"^[\*\-]?\s*(Status|Superseded by|ID|Anchors|Title):\s*(.+)$", line, re.IGNORECASE)
            if match:
                key = match.group(1).lower().replace(" ", "_")
                val = match.group(2).strip()
                meta[key] = val
        return meta

    @staticmethod
    def _parse_anchors(raw_anchors: Any) -> List[CodeAnchor]:
        anchors = []
        if isinstance(raw_anchors, str):
            raw_anchors = [raw_anchors]

        if isinstance(raw_anchors, list):
            for item in raw_anchors:
                if isinstance(item, str):
                    anchors.append(ADRParser._string_to_anchor(item))
                elif isinstance(item, dict):
                    file_path = item.get("file_path") or item.get("file", "")
                    symbol = item.get("symbol")
                    line_no = item.get("line_number") or item.get("line")
                    if line_no is not None:
                        try:
                            line_no = int(line_no)
                        except ValueError:
                            line_no = None
                    if file_path:
                        anchors.append(CodeAnchor(file_path=file_path, symbol=symbol, line_number=line_no))
        return anchors

    @staticmethod
    def _string_to_anchor(anchor_str: str) -> CodeAnchor:
        anchor_str = anchor_str.strip()
        if "#" in anchor_str:
            file_path, symbol = anchor_str.split("#", 1)
            line_no = None
            if ":" in symbol:
                symbol_parts = symbol.split(":", 1)
                symbol = symbol_parts[0]
                try:
                    line_no = int(symbol_parts[1])
                except ValueError:
                    pass
            return CodeAnchor(file_path=file_path.strip(), symbol=symbol.strip(), line_number=line_no)
        elif ":" in anchor_str and not anchor_str.startswith("http"):
            parts = anchor_str.split(":", 1)
            file_path = parts[0].strip()
            try:
                line_no = int(parts[1].strip())
                return CodeAnchor(file_path=file_path, line_number=line_no)
            except ValueError:
                return CodeAnchor(file_path=file_path, symbol=parts[1].strip())
        return CodeAnchor(file_path=anchor_str)

    @staticmethod
    def _extract_anchors_from_body(body: str) -> List[CodeAnchor]:
        anchors = []
        matches = re.findall(r"(?:Anchors?|Code Anchors?):\s*([^\n]+)", body, re.IGNORECASE)
        for match in matches:
            items = re.split(r"[,\s]+", match.strip())
            for item in items:
                item_clean = item.strip("`'\"")
                if item_clean:
                    anchors.append(ADRParser._string_to_anchor(item_clean))
        return anchors
