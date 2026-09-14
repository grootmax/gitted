# gitted — Automated AST Code Anchor Validation, Ticket Correlation & Intent Enrichment Engine

`gitted` provides automated code anchor verification and lifecycle status tracking for Architecture Decision Records (ADRs), ticket-based cross-repository correlation via shared issue keys across enterprise microservices, dynamic feature inference, and intent enrichment for pull requests.

---

## Table of Contents

- [Features](#features)
- [Tech Stack & Prerequisites](#tech-stack--prerequisites)
  - [Language Runtimes & Tools](#language-runtimes--tools)
  - [Python Ecosystem Dependencies](#python-ecosystem-dependencies)
  - [Node.js & TypeScript Ecosystem Dependencies](#nodejs--typescript-ecosystem-dependencies)
  - [Supported Code Targets](#supported-code-targets)
- [How to Update Everything](#how-to-update-everything)
  - [1. How to Update ADRs & Code Anchors](#1-how-to-update-adrs--code-anchors)
  - [2. How to Update Project Dependencies & Tech Stack](#2-how-to-update-project-dependencies--tech-stack)
  - [3. How to Update Features Configuration & Feature Timelines](#3-how-to-update-features-configuration--feature-timelines)
  - [4. How to Update and Rebuild Code](#4-how-to-update-and-rebuild-code)
  - [5. How to Update and Run Tests](#5-how-to-update-and-run-tests)
- [CLI Reference](#cli-reference)
  - [`gitted` CLI Commands](#gitted-cli-commands)
  - [`contextbuilder` CLI Commands](#contextbuilder-cli-commands)
- [Architecture & Repository Directory Map](#architecture--repository-directory-map)
- [CI/CD Integration](#cicd-integration)
- [License](#license)

---

## Features

- **Automated AST Code Anchor Verification**: Parses repository source files (Python, JavaScript/TypeScript, Go, etc.) using AST and regex fallback tokenizers to verify that linked files and symbols (functions, methods, classes) exist in the active codebase.
- **ADR Lifecycle Management**: Supports explicit ADR lifecycle states (`Accepted`, `Superseded`, `Deprecated`, `Stale`) and tracks replacement relationships (`superseded_by: ADR-XXX`).
- **Fuzzy Symbol Matching & Git Move Tracking**: Attempts fuzzy symbol matching, AST fingerprinting, and git move tracking when code is renamed or relocated before flagging anchors as stale.
- **Developer Warning Views ("Before You Change This")**: Automatically filters out `Superseded` and `Deprecated` ADRs from primary file alerts while prominently flagging `Stale Anchor` records with distinct warning banners.
- **ADR Detail Rendering**: Clearly displays visual status badges (`Active`, `Superseded by ADR-XXX`, `Stale Anchor`, `Deprecated`) and links to replacement ADRs.
- **PR & CI Linting Engine**: Command-line linter to fail PR builds when linked functions/files have been removed without updating ADR status.
- **Ticket-Based Cross-Repository Correlation**: Extracts Jira-style issue keys (`PAY-482`, `CHECKOUT-381`) matching `[A-Z]+-\d+` from PR titles, branch names, and commit messages to correlate PRs across split repositories.
- **PR Intent Synthesizer & Intent Cards**: Analyzes modified files, branch names, commit messages, and PR descriptions to generate structured PR intent cards with change classification and feature mapping.
- **Dynamic Feature Inference & Directory Mapping**: Heuristically clusters codebase file paths into feature boundaries and dynamically resolves file associations with confidence scores.
- **VS Code Extension & Off-Thread SQLite Indexer**: Background indexer using `better-sqlite3` and `chokidar` for off-thread code graph indexing, adhering strictly to <16ms frame budget guardrails.

---

## Tech Stack & Prerequisites

### Language Runtimes & Tools

| Technology | Required Version | Description |
| :--- | :--- | :--- |
| **Python** | `>= 3.9` (Tested on 3.10, 3.11, 3.12) | Core execution engine for CLI, ADR parser, PR intent synthesizer, and feature clusterer |
| **Node.js** | `>= 20.0.0` (npm `>= 10.0.0`) | JavaScript/TypeScript runtime for VS Code extension, background indexer, and code graph engine |
| **TypeScript** | `5.7.3` | Typed JavaScript compiler (`tsc`) for building source files in `src/` to `out/` or `dist/` |

### Python Ecosystem Dependencies

Defined in [`pyproject.toml`](./pyproject.toml):

- **`pyyaml` (`>= 6.0`)**: Parses YAML frontmatter in ADR files and `.contextbuilder/features.yml` configuration files.
- **`pytest` (`>= 7.0`, `dev: >= 8.0`)**: Python test runner for unit and integration testing.
- **`pytest-cov` (`dev`)**: Test coverage reporter for Pytest.
- **`setuptools` (`>= 61.0`)**: Build system backend for packaging `gitted` and `contextbuilder` CLI entry points.

### Node.js & TypeScript Ecosystem Dependencies

Defined in [`package.json`](./package.json):

- **`better-sqlite3` (`^11.8.1`)**: High-performance synchronous SQLite database driver used for caching AST symbols, file hashes, and code graph indexes on disk.
- **`chokidar` (`^4.0.3`)**: Cross-platform file system watcher used by the background indexer to detect source file changes in real time.
- **`vitest` (`^3.0.7`)**: Modern, fast unit testing framework for TypeScript files.
- **`@types/better-sqlite3` (`^7.6.12`)**: TypeScript type definitions for `better-sqlite3`.
- **`@types/node` (`^22.13.10`)**: TypeScript type definitions for Node.js APIs.

### Supported Code Targets

The AST parser and fallback tokenizer support scanning symbols across multiple programming languages:
- **Python**: (`.py`) — Class, function, and method signatures via Python AST.
- **TypeScript / JavaScript**: (`.ts`, `.tsx`, `.js`, `.jsx`) — Classes, functions, exports, methods, arrow functions.
- **Go**: (`.go`) — Functions, methods, and struct definitions via regex fallback tokenizer.

---

## How to Update Everything

This section provides complete instructions for updating ADRs, code anchors, project dependencies, features, build targets, and test suites.

### 1. How to Update ADRs & Code Anchors

ADRs are stored as Markdown files in the repository (default directory: `docs/adr/`).

#### ADR Format Standard
Each ADR file must begin with YAML frontmatter:

```markdown
---
id: ADR-024
title: Asynchronous Event Bus for Payment Notifications
status: Accepted
anchors:
  - file: src/payment.py
    symbol: process_payment
  - file: src/events.py
    symbol: PaymentEventPublisher
---

# ADR-024: Asynchronous Event Bus for Payment Notifications

## Context
...
```

#### ADR Lifecycle States
- **`Accepted`**: Active architectural decision. Code anchors are validated against the codebase.
- **`Superseded`**: Replaced by a newer ADR. Must include `superseded_by: ADR-XXX` in frontmatter.
- **`Deprecated`**: Phased out without a direct replacement.
- **`Stale`**: Automatically assigned by the linter if any linked `file` or `symbol` no longer exists in the codebase.

#### Step-by-Step: Updating an ADR when Code Changes

1. **When Renaming or Refactoring Symbols/Files**:
   - Update the `file` or `symbol` fields in the ADR frontmatter to match the new location/name.
   - Example: If `process_payment` was renamed to `execute_payment_flow` in `src/payment.py`:
     ```yaml
     anchors:
       - file: src/payment.py
         symbol: execute_payment_flow
     ```

2. **When Replacing an ADR with a New ADR**:
   - Update the old ADR status to `Superseded` and add `superseded_by`:
     ```yaml
     status: Superseded
     superseded_by: ADR-082
     ```
   - Create the new ADR file (e.g. `docs/adr/ADR-082.md`) with `status: Accepted`.

3. **Verifying ADR Validity**:
   - Run the linter locally:
     ```bash
     python3 -m gitted.cli lint --repo . --adr-dir docs/adr
     ```

### 2. How to Update Project Dependencies & Tech Stack

#### Updating Python Dependencies
1. Open `pyproject.toml`.
2. To add or modify runtime dependencies, edit `dependencies` under `[project]`:
   ```toml
   dependencies = [
       "pyyaml>=6.0",
       "new-package>=1.0.0",
   ]
   ```
3. To add or modify development tools, edit `[project.optional-dependencies] dev`.
4. Reinstall the package in editable mode:
   ```bash
   pip install -e .
   # or with dev extras:
   pip install -e .[dev]
   ```

#### Updating Node.js / TypeScript Dependencies
1. Open `package.json`.
2. Add or update packages in `dependencies` or `devDependencies`.
3. Install and update `package-lock.json`:
   ```bash
   npm install
   ```
4. If upgrading TypeScript or compiler options, update `tsconfig.json` accordingly.

### 3. How to Update Features Configuration & Feature Timelines

`gitted` and `contextbuilder` use `.contextbuilder/features.yml` to map source files to functional features.

#### Step-by-Step: Updating Features Registry
1. Initialize or reset config:
   ```bash
   python3 -m gitted.cli init --dir .contextbuilder
   ```
2. Edit `.contextbuilder/features.yml`:
   ```yaml
   features:
     - name: Payments
       description: Payment processing and checkout flows
       paths:
         - "services/payment/**"
         - "src/payments/**"

     - name: Authentication
       description: User authentication and token validation
       paths:
         - "src/auth/**"
   ```
3. Check feature mappings:
   ```bash
   python3 -m contextbuilder.cli status .
   ```

#### Step-by-Step: Updating Feature Timeline
Timeline events are stored in `.contextbuilder/timeline.json`. Append new PR intent entries via CLI:
```bash
python3 -m gitted.cli merge --pr-number 101 --commit-sha "abc1234" --branch "feature/PAY-123"
```

### 4. How to Update and Rebuild Code

#### Rebuilding TypeScript / Extension Code
- Build all TypeScript files from `src/` to `out/` or `dist/`:
  ```bash
  npm run build
  ```
- Run watch mode during development (auto-recompiles on file change):
  ```bash
  npm run watch
  ```

#### Updating Python Package Entry Points
If new CLI subcommands or modules are added, update `[project.scripts]` in `pyproject.toml` and reinstall:
```bash
pip install -e .
```

### 5. How to Update and Run Tests

#### Running TypeScript / Node Tests (Vitest)
- Run all TypeScript tests once:
  ```bash
  npm test
  # or
  npx vitest run
  ```
- Run TypeScript test coverage:
  ```bash
  npm run test:coverage
  ```

#### Running Python Tests (Pytest)
- Run all Python unit tests with verbose output:
  ```bash
  pytest -v
  # or
  python3 -m pytest -v
  ```
- Run Python test coverage:
  ```bash
  pytest --cov=gitted --cov=contextbuilder
  ```

#### Running Self-Verification / Linting
- Verify repository ADR anchors:
  ```bash
  python3 -m gitted.cli lint --repo . --adr-dir docs/adr
  ```

---

## CLI Reference

### `gitted` CLI Commands

Executable entry point: `gitted` (or `python3 -m gitted.cli`)

| Command | Description | Example Usage |
| :--- | :--- | :--- |
| **`lint`** | Validates code anchors in ADR markdown files against codebase symbols. | `python3 -m gitted.cli lint --repo . --adr-dir docs/adr` |
| **`view`** | Renders "Before You Change This" context panel for a specific source file. | `python3 -m gitted.cli view src/payment.py --repo .` |
| **`detail`** | Displays detailed view and anchor validation state for an ADR. | `python3 -m gitted.cli detail ADR-024 --repo .` |
| **`init`** | Initializes `.contextbuilder/` directory with default `features.yml`. | `python3 -m gitted.cli init --dir .contextbuilder` |
| **`analyze`**| Analyzes git branch, commits, and files to synthesize PR intent. | `python3 -m gitted.cli analyze --branch feature/PAY-482 --json` |
| **`card`** | Generates Markdown PR Intent Card preview for PR descriptions. | `python3 -m gitted.cli card --branch feature/PAY-482 --output INTENT.md` |
| **`parse-card`**| Parses edited Intent Card Markdown file to extract user overrides. | `python3 -m gitted.cli parse-card INTENT.md --json` |
| **`merge`** | Appends PR intent metadata into `.contextbuilder/timeline.json` on merge. | `python3 -m gitted.cli merge --pr-number 42 --commit-sha a1b2c3d` |

### `contextbuilder` CLI Commands

Executable entry point: `contextbuilder` (or `python3 -m contextbuilder.cli`)

| Command | Description | Example Usage |
| :--- | :--- | :--- |
| **`scan`** | Scans repository and infers dynamic feature boundaries and clusters. | `python3 -m contextbuilder.cli scan .` |
| **`resolve`**| Dynamically resolves feature mapping and confidence score for a file path. | `python3 -m contextbuilder.cli resolve src/ast/fingerprinter.ts` |
| **`status`** | Displays current feature registry status and file associations. | `python3 -m contextbuilder.cli status . --json` |

---

## Architecture & Repository Directory Map

```
gitted/
├── .contextbuilder/          # Local feature registry (features.yml) and timeline (timeline.json)
├── .github/
│   └── workflows/
│       └── ci.yml            # CI matrix workflow (Python 3.10/3.11/3.12, Node 20)
├── contextbuilder/           # Python engine for heuristic directory mapping & feature inference
│   ├── cli.py                # contextbuilder CLI entrypoint
│   ├── config.py             # Feature registry loader & YAML parser
│   ├── models.py             # Data models for feature associations & confidence scores
│   ├── inference/            # AST parsing, directory clustering & dynamic resolver
│   └── ui/                   # Formatter for registry tree & resolution outputs
├── gitted/                   # Python core engine for AST indexing, ADRs, & PR intent
│   ├── __main__.py           # Package executable entrypoint
│   ├── adr_parser.py         # Markdown frontmatter & ADR model parser
│   ├── ast_indexer.py        # Python/JS/TS/Go symbol validator & AST indexer
│   ├── cli.py                # gitted CLI subcommand dispatcher
│   ├── commit_parser.py     # Commit message tokenizer & ticket key extractor ([A-Z]+-\d+)
│   ├── context_builder.py    # "Before You Change This" warning view generator
│   ├── intent_card.py        # Markdown PR Intent Card builder & override parser
│   ├── intent_synthesizer.py # PR Intent analyzer & rule evaluator
│   ├── linter.py             # CI ADR linter engine
│   ├── models.py             # Core ADR, PRIntent, & CodeAnchor models
│   ├── path_scorer.py        # Path correlation & distance scoring
│   ├── ticket_parser.py      # Ticket key extractor for cross-repo correlation
│   └── timeline.py           # Feature timeline JSON persistence manager
├── src/                      # TypeScript engine & VS Code Extension
│   ├── extension.ts          # VS Code extension entry point
│   ├── graph.ts              # Code graph data structures
│   ├── index.ts              # Main library export
│   ├── scorer.ts             # Inverse reference frequency & graph scoring engine
│   ├── ast/                  # Symbol fingerprinter
│   ├── cache/                # SqliteCache implementation via better-sqlite3
│   ├── context/              # TypeScript context builder engine
│   ├── context_engine/       # Multi-repo relationship indexer (Python)
│   ├── git/                  # Git move and rename analyzer
│   ├── indexer/              # Off-thread BackgroundIndexer with Chokidar watchers
│   ├── parsers/              # AST parser & regex fallback parser
│   ├── pipeline/             # Static analysis pipeline executor
│   ├── sidebar/              # VS Code Webview Sidebar provider
│   ├── ui/                   # Tree view & warning UI renderers
│   ├── vscode_extension/     # Python context provider for editor extension
│   └── web_app/              # Timeline web app & GitHub App context formatter
├── tests/                    # Combined test suite (pytest + Vitest)
├── package.json              # Node.js dependencies, scripts, & metadata
├── pyproject.toml            # Python packaging, script entrypoints, & pytest config
├── tsconfig.json             # TypeScript compiler configuration
└── vitest.config.ts          # Vitest testing configuration
```

---

## CI/CD Integration

To automatically validate ADR code anchors on every pull request, add `gitted lint` to your GitHub Actions workflow:

```yaml
name: ADR Lint CI

on:
  pull_request:
    branches: [ main ]

jobs:
  adr-lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: "3.11"

      - name: Install gitted
        run: |
          pip install --upgrade pip
          pip install pyyaml
          pip install -e .

      - name: Run ADR Code Anchor Linter
        run: |
          python3 -m gitted.cli lint --repo . --adr-dir docs/adr
```

---

## License

MIT License. See [LICENSE](LICENSE) for details.
