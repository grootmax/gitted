# gitted — Automated AST Code Anchor Validation, Ticket Correlation & Intent Enrichment Engine

`gitted` provides automated code anchor verification and lifecycle status tracking for Architecture Decision Records (ADRs), ticket-based cross-repository correlation via shared issue keys across enterprise microservices, dynamic feature inference, and intent enrichment for pull requests. It includes a native **VS Code Extension** with an off-thread SQLite background indexer to display context and warning views directly inside the editor sidebar without blocking the main event loop.

---

## Table of Contents

- [Features](#features)
- [Tech Stack & Prerequisites](#tech-stack--prerequisites)
  - [System & Language Runtimes](#system--language-runtimes)
  - [Recommended VS Code Extensions](#recommended-vs-code-extensions)
  - [Python Ecosystem Dependencies](#python-ecosystem-dependencies)
  - [Node.js & TypeScript Ecosystem Dependencies](#nodejs--typescript-ecosystem-dependencies)
  - [Supported Code Targets](#supported-code-targets)
- [Local VS Code Setup & Execution Guide](#local-vs-code-setup--execution-guide)
  - [Step 1: Clone & Open Repository in VS Code](#step-1-clone--open-repository-in-vs-code)
  - [Step 2: Configure Python Virtual Environment](#step-2-configure-python-virtual-environment)
  - [Step 3: Configure Node.js & Compile TypeScript](#step-3-configure-nodejs--compile-typescript)
  - [Step 4: Launch & Debug VS Code Extension Host](#step-4-launch--debug-vs-code-extension-host)
  - [Step 5: VS Code Launch Configurations (`launch.json`)](#step-5-vs-code-launch-configurations-launchjson)
  - [Step 6: VS Code Build & Test Tasks (`tasks.json`)](#step-6-vs-code-build--test-tasks-tasksjson)
  - [Step 7: Workspace Settings (`settings.json`)](#step-7-workspace-settings-settingsjson)
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
- [Troubleshooting & FAQ](#troubleshooting--faq)
- [License](#license)

---

## Features

- **VS Code Extension & Webview Sidebar**: Native extension integration rendering a Webview sidebar ("Before You Change This") with active feature ownership, PR history, related tests, ADR warnings, and AST summaries.
- **Off-Thread SQLite Indexer & Main Thread Non-Blocking Guardrails**: Uses `better-sqlite3` and `chokidar` for off-thread workspace indexing. Active editor changes (`onDidChangeActiveTextEditor`) query SQLite in `<5ms`, guaranteeing zero synchronous subprocesses or blocking AST parsing on the main thread.
- **Automated AST Code Anchor Verification**: Parses source files (Python, JavaScript/TypeScript, Go) using AST engines and regex fallback tokenizers to verify that linked files and symbols exist in the active branch.
- **ADR Lifecycle Management**: Supports explicit ADR lifecycle states (`Accepted`, `Superseded`, `Deprecated`, `Stale`) and replacement tracking (`superseded_by: ADR-XXX`). Filters out superseded records while flagging stale anchors with warning banners.
- **Fuzzy Symbol Matching & Git Move Tracking**: Uses AST fingerprinting (`src/ast/fingerprinter.ts`), close-match string distances, and `git log --follow` to track renamed or moved symbols before flagging anchors as broken.
- **PR Intent Synthesizer & Intent Cards**: Analyzes modified files, branch names, commit messages, and PR descriptions to generate structured PR intent cards with change classification and feature mapping.
- **Ticket-Based Cross-Repository Correlation**: Extracts Jira-style issue keys (`PAY-482`, `CHECKOUT-381`) matching `[A-Z]+-\d+` from PR titles, branch names, and commit messages to correlate PRs across microservices.
- **Dynamic Feature Inference & Directory Mapping**: Heuristically clusters codebase file paths into feature boundaries and dynamically resolves file associations with confidence scores.

---

## Tech Stack & Prerequisites

### System & Language Runtimes

| Technology | Required Version | Purpose |
| :--- | :--- | :--- |
| **VS Code** | `>= 1.80.0` | Primary IDE for extension execution, debugging, and sidebar Webview rendering |
| **Node.js** | `>= 20.0.0` (npm `>= 10.0.0`) | Extension runtime, background indexer, and TypeScript compilation |
| **Python** | `>= 3.9` (3.10, 3.11, 3.12 verified) | Core execution engine for CLI tools, ADR parser, PR intent synthesizer, and feature clusterer |
| **TypeScript** | `5.7.3` | Exact pinned compiler version (`tsc`) for building source files from `src/` to `out/` |
| **C++ Build Tools** | `gcc` / `g++` / `make` / MSVC | Required for compiling native C++ Node addons (`better-sqlite3`) during `npm install` |

### Recommended VS Code Extensions

For optimal local development inside VS Code, install the following extensions from the VS Code Marketplace:

1. **Python Extension** (`ms-python.python`): IntelliSense, virtual environment auto-detection, and Pytest debugging.
2. **Pylance** (`ms-python.vscode-pylance`): High-performance Python language server for type checking.
3. **TypeScript and JavaScript Language Features** (Builtin): TypeScript IntelliSense and refactoring support.

### Python Ecosystem Dependencies

Configured in [`pyproject.toml`](./pyproject.toml):

- **`pyyaml` (`>= 6.0`)**: Parses YAML frontmatter in ADR markdown files and `.contextbuilder/features.yml`.
- **`pytest` (`>= 7.0`)**: Test runner for Python unit and integration test suites.
- **`pytest-cov`**: Test coverage reporting for Python modules.
- **`setuptools` (`>= 61.0`)**: Package build backend for `gitted` and `contextbuilder` CLI commands.

### Node.js & TypeScript Ecosystem Dependencies

Configured in [`package.json`](./package.json):

- **`better-sqlite3` (`^11.8.1`)**: Synchronous C++ SQLite database driver for AST symbol cache (`.contextbuilder/cache.db`).
- **`chokidar` (`^4.0.3`)**: File system watcher for off-thread background indexing.
- **`vitest` (`^3.0.7`)**: Ultra-fast unit testing framework for TypeScript files.
- **`@types/better-sqlite3` & `@types/node`**: Type definitions for Node.js APIs and SQLite.

### Supported Code Targets

- **Python**: (`.py`) — Class, function, and method signatures via Python AST (`ast`).
- **TypeScript / JavaScript**: (`.ts`, `.tsx`, `.js`, `.jsx`) — Classes, functions, exports, methods, arrow functions via TypeScript AST (`typescript`).
- **Go**: (`.go`) — Functions, methods, and struct definitions via regex fallback tokenizer.

---

## Local VS Code Setup & Execution Guide

Follow these step-by-step instructions to clone, configure, build, run, and debug `gitted` and its VS Code extension locally inside VS Code.

### Step 1: Clone & Open Repository in VS Code

1. Clone the repository to your local machine:
   ```bash
   git clone https://github.com/grootmax/gitted.git
   cd gitted
   ```
2. Launch VS Code in the project workspace root:
   ```bash
   code .
   ```

---

### Step 2: Configure Python Virtual Environment

1. Open the integrated terminal in VS Code (`Ctrl+\`` / `Cmd+\`` or **Terminal -> New Terminal**).
2. Create a Python virtual environment in the workspace root:
   ```bash
   python3 -m venv .venv
   ```
3. Activate the virtual environment:
   - **Linux / macOS**:
     ```bash
     source .venv/bin/activate
     ```
   - **Windows (PowerShell)**:
     ```powershell
     .\.venv\Scripts\Activate.ps1
     ```
   - **Windows (CMD)**:
     ```cmd
     .\.venv\Scripts\activate.bat
     ```
4. Set the active Python interpreter in VS Code:
   - Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on macOS) to open the Command Palette.
   - Type and select **`Python: Select Interpreter`**.
   - Choose `./.venv/bin/python` (or `.\.venv\Scripts\python.exe`).
5. Upgrade `pip` and install Python dependencies in editable mode:
   ```bash
   pip install --upgrade pip
   pip install pyyaml pytest pytest-cov
   pip install -e .
   ```
6. Verify CLI commands are accessible in the terminal:
   ```bash
   python3 -m gitted.cli --help
   python3 -m contextbuilder.cli --help
   ```

---

### Step 3: Configure Node.js & Compile TypeScript

1. Install Node.js dependencies (this will automatically compile native C++ bindings for `better-sqlite3`):
   ```bash
   npm install
   ```
   *Note: If you change Node.js versions later, rebuild native bindings with `npm rebuild better-sqlite3`.*

2. Compile TypeScript source files (`src/` -> `out/`):
   ```bash
   npm run build
   ```

3. Enable TypeScript watch mode during active development to automatically recompile files on change:
   ```bash
   npm run watch
   ```

---

### Step 4: Launch & Debug VS Code Extension Host

`gitted` includes a VS Code Extension (`src/extension.ts`) that runs inside VS Code to provide live context, warning banners, and sidebar panels.

#### How to Run the Extension Locally:

1. Open VS Code in the repository root (`code .`).
2. Ensure you have run `npm run build` or have `npm run watch` running in a terminal.
3. Switch to the **Run & Debug** view in VS Code (`Ctrl+Shift+D` / `Cmd+Shift+D` or click the play icon on the left sidebar).
4. In the dropdown at the top of the Run & Debug view, select **`Extension: Run Extension Host`**.
5. Press **`F5`** (or click the green Play button).
6. A new VS Code window titled **`[Extension Development Host]`** will open.

#### Verifying the Extension in Action:

1. In the **Extension Development Host** window, open any workspace containing source code and ADR files (such as opening the `gitted` workspace itself).
2. Look for the **gitted** icon on the VS Code Activity Bar (left sidebar). Click it to open the **gitted Context** Webview panel.
3. Open a source file (e.g. `src/payment.py` or `src/ast/fingerprinter.ts`).
4. Whenever you switch active text editors, the extension triggers `onDidChangeActiveTextEditor`. It performs a instant SQLite cache look-up (`<5ms`) and renders the file's feature ownership, related tests, PR history, and ADR warning banners in the sidebar.
5. Set breakpoints in `src/extension.ts`, `src/sidebar/SidebarProvider.ts`, or `src/indexer/BackgroundIndexer.ts` in your main VS Code window to debug extension logic step-by-step.

---

### Step 5: VS Code Launch Configurations (`launch.json`)

The workspace includes pre-configured launch settings in `.vscode/launch.json` for debugging all components:

| Launch Profile Name | Description | Target / Command |
| :--- | :--- | :--- |
| **`Extension: Run Extension Host`** | Launches VS Code Extension Host window with the extension loaded | `${workspaceFolder}/out/extension.js` |
| **`Python: gitted CLI (lint)`** | Debugs `gitted` linter subcommand with breakpoints | `python3 -m gitted.cli lint --repo . --adr-dir docs/adr` |
| **`Python: contextbuilder CLI (status)`** | Debugs `contextbuilder` status subcommand | `python3 -m contextbuilder.cli status .` |
| **`Python: Debug Current Test File (pytest)`** | Debugs the currently active Python test file in editor | `pytest ${file} -v` |
| **`TypeScript: Debug Vitest Tests`** | Debugs TypeScript Vitest test suite with Node inspector | `vitest run` |

To run any profile, open the **Run & Debug** panel (`Ctrl+Shift+D`), choose the profile from the dropdown menu, and press **`F5`**.

---

### Step 6: VS Code Build & Test Tasks (`tasks.json`)

Pre-configured workspace tasks in `.vscode/tasks.json` enable one-key builds and test execution:

- **Run Default Build Task (`Ctrl+Shift+B` / `Cmd+Shift+B`)**: Runs `npm: build` (`tsc`).
- **Run Tasks Menu**: Press `Ctrl+Shift+P` -> `Tasks: Run Task` and select:
  - **`npm: build`**: Compiles TypeScript files once.
  - **`npm: watch`**: Runs TypeScript watch mode compiler in background.
  - **`npm: test (Vitest)`**: Executes all TypeScript unit tests.
  - **`pytest: run tests`**: Executes all Python unit tests with verbose logging.
  - **`gitted: lint ADRs`**: Executes local ADR code anchor validation.

---

### Step 7: Workspace Settings (`settings.json`)

Workspace settings in `.vscode/settings.json` automatically configure VS Code options for this project:

```json
{
  "python.defaultInterpreterPath": "${workspaceFolder}/.venv/bin/python",
  "python.testing.pytestArgs": [
    "tests"
  ],
  "python.testing.unittestEnabled": false,
  "python.testing.pytestEnabled": true,
  "typescript.tsdk": "node_modules/typescript/lib",
  "editor.formatOnSave": true
}
```

---

## How to Update Everything

This section provides complete instructions for updating ADRs, code anchors, project dependencies, features, build targets, and test suites.

### 1. How to Update ADRs & Code Anchors

ADRs are stored as Markdown files in `docs/adr/`.

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
   - Update `file` or `symbol` fields in the ADR frontmatter to match the new location/name:
     ```yaml
     anchors:
       - file: src/payment.py
         symbol: execute_payment_flow
     ```
2. **When Replacing an ADR with a New ADR**:
   - Update old ADR status to `Superseded` and set `superseded_by`:
     ```yaml
     status: Superseded
     superseded_by: ADR-082
     ```
   - Create the new ADR file (`docs/adr/ADR-082.md`) with `status: Accepted`.
3. **Verifying ADR Validity**:
   - Run the linter locally:
     ```bash
     python3 -m gitted.cli lint --repo . --adr-dir docs/adr
     ```

---

### 2. How to Update Project Dependencies & Tech Stack

#### Updating Python Dependencies
1. Open `pyproject.toml`.
2. Add or update packages in `dependencies` under `[project]`:
   ```toml
   dependencies = [
       "pyyaml>=6.0",
       "new-package>=1.0.0",
   ]
   ```
3. Reinstall package in editable mode inside your virtual environment:
   ```bash
   pip install -e .
   ```

#### Updating Node.js / TypeScript Dependencies
1. Open `package.json`.
2. Add or update packages in `dependencies` or `devDependencies`.
3. Run install and update lockfile:
   ```bash
   npm install
   ```
4. If modifying TypeScript compiler configurations, update `tsconfig.json`.

---

### 3. How to Update Features Configuration & Feature Timelines

`gitted` and `contextbuilder` use `.contextbuilder/features.yml` to map source files to functional features.

#### Step-by-Step: Updating Features Registry
1. Initialize or reset configuration:
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

---

### 4. How to Update and Rebuild Code

#### Rebuilding TypeScript / Extension Code
- Compile TypeScript from `src/` to `out/`:
  ```bash
  npm run build
  ```
- Run watch mode during active development:
  ```bash
  npm run watch
  ```

#### Updating Python Package Entry Points
When adding new CLI subcommands or modules, update `[project.scripts]` in `pyproject.toml` and reinstall:
```bash
pip install -e .
```

---

### 5. How to Update and Run Tests

#### Running TypeScript / Node Tests (Vitest)
- Run all TypeScript unit tests once:
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

#### Running Full Test Suite & Self-Verification
- Execute both Node.js and Python test suites:
  ```bash
  npm run build && npm run test && pytest -v
  ```
- Run ADR linter:
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
├── .vscode/                  # VS Code Launch Configurations, Tasks, & Settings
│   ├── launch.json           # Extension host & CLI debug configurations
│   ├── settings.json         # Python interpreter & test runner workspace settings
│   └── tasks.json            # One-key build, watch, and test task definitions
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
│   ├── extension.ts          # VS Code extension entry point (activate / deactivate)
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
├── package.json              # Node.js dependencies, scripts, extension metadata
├── pyproject.toml            # Python packaging, script entrypoints, & pytest config
├── tsconfig.json             # TypeScript compiler configuration (outDir: ./out)
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

      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'

      - name: Install Node dependencies & Build
        run: |
          npm ci
          npm run build

      - name: Set up Python
        uses: actions/setup-python@v5
        with:
          python-version: "3.11"

      - name: Install gitted Python Package
        run: |
          pip install --upgrade pip
          pip install pyyaml
          pip install -e .

      - name: Run ADR Code Anchor Linter
        run: |
          python3 -m gitted.cli lint --repo . --adr-dir docs/adr
```

---

## Troubleshooting & FAQ

#### Q: How do I fix native module compilation errors for `better-sqlite3`?
If you see errors related to `better-sqlite3.node` when running tests or activating the extension host in VS Code, execute:
```bash
npm rebuild better-sqlite3
```
Ensure you have C++ build tools installed (`build-essential` on Ubuntu/Debian, Xcode Command Line Tools on macOS, or Visual Studio C++ Build Tools on Windows).

#### Q: Why does VS Code say `ModuleNotFoundError: No module named 'yaml'`?
Ensure you created and activated the virtual environment (`source .venv/bin/activate`) and installed dependencies (`pip install pyyaml -e .`). Make sure VS Code is using the virtual environment interpreter (`Ctrl+Shift+P` -> `Python: Select Interpreter` -> `./.venv/bin/python`).

#### Q: Why is the sidebar empty in the Extension Development Host?
Make sure you compiled the TypeScript code (`npm run build`) before launching the Extension Development Host window with `F5`.

---

## License

MIT License. See [LICENSE](LICENSE) for details.
