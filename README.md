# gitted — Automated AST Code Anchor Validation and Active Status Lifecycle Engine

`gitted` provides automated code anchor verification and lifecycle status tracking for Architecture Decision Records (ADRs). It ensures developer warning views (e.g. "Before You Change This" panels) present active, accurate architectural rules while automatically detecting broken/stale code references when underlying codebase symbols are refactored or removed.

## Features

- **Automated AST Code Anchor Verification**: Parses repository source files (Python, JavaScript/TypeScript, Go, etc.) using AST and regex tokenizers to verify that linked files and symbols (functions, methods, classes) exist in the active codebase.
- **ADR Lifecycle Management**: Supports explicit ADR lifecycle states (`Accepted`, `Superseded`, `Deprecated`, `Stale`) and tracks replacement relationships (`superseded_by: ADR-XXX`).
- **Fuzzy Symbol Matching & History Fallback**: Attempts fuzzy matching and git blame history tracking when code is renamed or moved before flagging anchors as stale.
- **General Project ADRs Support**: General architectural guidelines without specific code anchors remain active (`Accepted`) unless explicitly superseded or deprecated.
- **Developer Warning Views ("Before You Change This")**: Automatically filters out `Superseded` and `Deprecated` ADRs from primary file alerts while prominently flagging `Stale Anchor` records with distinct warning banners.
- **ADR Detail Rendering**: Clearly displays visual status badges (`Active`, `Superseded by ADR-XXX`, `Stale Anchor`, `Deprecated`) and links to replacement ADRs.
- **PR & CI Linting Engine**: Command-line linter to fail PR builds when linked functions/files have been removed without updating ADR status.

## Quick Start & CLI Usage

### Lint ADR Code Anchors in Repository
```bash
python3 -m gitted.cli lint --repo . --adr-dir docs/adr
```

### View "Before You Change This" Panel for a File
```bash
python3 -m gitted.cli view src/payment.py --repo . --adr-dir docs/adr
```

### Render ADR Detail View
```bash
python3 -m gitted.cli detail ADR-082 --repo . --adr-dir docs/adr
```

## ADR Markdown Format

ADR documents use YAML frontmatter or header annotations:

```yaml
---
id: ADR-082
title: Payment Gateway Interface Standard
status: Accepted
superseded_by: null
anchors:
  - file: src/payment.py
    symbol: PaymentProcessor
  - src/checkout.py#process_order
---

# ADR-082: Payment Gateway Interface Standard

This decision standardizes payment gateway calls across services.
```

## Running Tests

```bash
python3 -m pytest -v
```
