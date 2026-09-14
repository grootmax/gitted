import os
import tempfile
from gitted.linter import ADRLinter


def test_adr_linter_clean_repository():
    with tempfile.TemporaryDirectory() as repo_dir:
        src_dir = os.path.join(repo_dir, "src")
        adr_dir = os.path.join(repo_dir, "docs", "adr")
        os.makedirs(src_dir, exist_ok=True)
        os.makedirs(adr_dir, exist_ok=True)

        with open(os.path.join(src_dir, "main.py"), "w") as f:
            f.write("def start_app(): pass\n")

        with open(os.path.join(adr_dir, "0001-app-start.md"), "w") as f:
            f.write("""---
id: ADR-001
title: App Startup
status: Accepted
anchors:
  - file: src/main.py
    symbol: start_app
---
Body content
""")

        linter = ADRLinter(repo_root=repo_dir, adr_dir=adr_dir)
        report = linter.lint()

        assert report.is_clean is True
        assert report.total_adrs == 1
        assert report.active_count == 1
        assert report.stale_count == 0


def test_adr_linter_stale_anchor_detection():
    with tempfile.TemporaryDirectory() as repo_dir:
        src_dir = os.path.join(repo_dir, "src")
        adr_dir = os.path.join(repo_dir, "docs", "adr")
        os.makedirs(src_dir, exist_ok=True)
        os.makedirs(adr_dir, exist_ok=True)

        with open(os.path.join(src_dir, "main.py"), "w") as f:
            f.write("def new_start_app(): pass\n")

        with open(os.path.join(adr_dir, "0001-app-start.md"), "w") as f:
            f.write("""---
id: ADR-001
title: App Startup
status: Accepted
anchors:
  - file: src/main.py
    symbol: old_start_app
---
Body content
""")

        linter = ADRLinter(repo_root=repo_dir, adr_dir=adr_dir)
        report = linter.lint()

        assert report.is_clean is False
        assert report.stale_count == 1
        assert len(report.stale_adrs) == 1
        assert report.stale_adrs[0].id == "ADR-001"

        formatted = report.format_report()
        assert "ORPHANED / STALE CODE ANCHORS DETECTED" in formatted
        assert "old_start_app" in formatted
