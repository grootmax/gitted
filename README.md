# gitted — Automated AST Code Anchor Validation and Ticket-Based Cross-Repository Correlation

`gitted` provides automated code anchor verification and lifecycle status tracking for Architecture Decision Records (ADRs), as well as ticket-based cross-repository correlation via shared issue keys across enterprise microservices.

## Features

- **Automated AST Code Anchor Verification**: Parses repository source files (Python, JavaScript/TypeScript, Go, etc.) using AST and regex tokenizers to verify that linked files and symbols (functions, methods, classes) exist in the active codebase.
- **ADR Lifecycle Management**: Supports explicit ADR lifecycle states (`Accepted`, `Superseded`, `Deprecated`, `Stale`) and tracks replacement relationships (`superseded_by: ADR-XXX`).
- **Fuzzy Symbol Matching & History Fallback**: Attempts fuzzy matching and git blame history tracking when code is renamed or moved before flagging anchors as stale.
- **General Project ADRs Support**: General architectural guidelines without specific code anchors remain active (`Accepted`) unless explicitly superseded or deprecated.
- **Developer Warning Views ("Before You Change This")**: Automatically filters out `Superseded` and `Deprecated` ADRs from primary file alerts while prominently flagging `Stale Anchor` records with distinct warning banners.
- **ADR Detail Rendering**: Clearly displays visual status badges (`Active`, `Superseded by ADR-XXX`, `Stale Anchor`, `Deprecated`) and links to replacement ADRs.
- **PR & CI Linting Engine**: Command-line linter to fail PR builds when linked functions/files have been removed without updating ADR status.
- **Ticket-Based Cross-Repository Correlation**: Extracts Jira-style issue keys (`PAY-482`, `CHECKOUT-381`) from PR titles, branch names, and commit messages to correlate PRs across split repositories (`checkout-web`, `checkout-api`, `payment-service`).
- **Global Ticket Index & Multi-Repo Timelines**: Maintains cross-repository relationship index and renders unified multi-repository Feature Timelines and VS Code context tree views.

## Architecture & Overview

### Core Components
1. **AST & ADR Engine (`gitted.cli`, `gitted.lifecycle`)**: AST parser and CLI engine for ADR verification and warnings.
2. **Context Engine (`src/context_engine`)**:
   - Parses issue keys matching regex `[A-Z]+-\d+` from PR titles, branch names, and commit messages.
   - Maintains global relationship index mapping issue keys to PRs, commits, and features across repositories.
   - Processes single-repository webhooks in < 50ms.
3. **Web App (`src/web_app`)**:
   - Renders unified multi-repository Feature Timelines grouping changes chronologically across microservices.
   - Formats "Cross-Repository Context" markdown blocks for GitHub App PR views.
4. **VS Code Extension (`src/vscode_extension`)**:
   - Displays linked cross-repository PRs and ticket context tree views in editor context.

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

## Running Tests

```bash
python3 -m pytest -v
```

