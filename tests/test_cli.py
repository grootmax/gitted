import json
import os
import sys
import tempfile
from unittest.mock import patch
import pytest
from pathlib import Path
from gitted.cli import main


def test_cli_lint_clean():
    with tempfile.TemporaryDirectory() as repo_dir:
        src_dir = os.path.join(repo_dir, "src")
        adr_dir = os.path.join(repo_dir, "docs", "adr")
        os.makedirs(src_dir, exist_ok=True)
        os.makedirs(adr_dir, exist_ok=True)

        with open(os.path.join(src_dir, "app.py"), "w") as f:
            f.write("def run_server(): pass\n")

        with open(os.path.join(adr_dir, "0001-server.md"), "w") as f:
            f.write("""---
id: ADR-001
title: Server Setup
status: Accepted
anchors:
  - file: src/app.py
    symbol: run_server
---
Body
""")

        test_args = ["gitted", "lint", "--repo", repo_dir, "--adr-dir", "docs/adr"]
        with patch.object(sys, "argv", test_args):
            main()  # Should complete without error / exit(1)


def test_cli_view_panel(capsys):
    with tempfile.TemporaryDirectory() as repo_dir:
        src_dir = os.path.join(repo_dir, "src")
        adr_dir = os.path.join(repo_dir, "docs", "adr")
        os.makedirs(src_dir, exist_ok=True)
        os.makedirs(adr_dir, exist_ok=True)

        with open(os.path.join(src_dir, "app.py"), "w") as f:
            f.write("def run_server(): pass\n")

        with open(os.path.join(adr_dir, "0001-server.md"), "w") as f:
            f.write("""---
id: ADR-001
title: Server Setup
status: Accepted
anchors:
  - file: src/app.py
    symbol: run_server
---
Body
""")

        test_args = ["gitted", "view", "src/app.py", "--repo", repo_dir, "--adr-dir", "docs/adr"]
        with patch.object(sys, "argv", test_args):
            main()

        captured = capsys.readouterr()
        assert "Before You Change This: src/app.py" in captured.out
        assert "ADR-001: Server Setup" in captured.out


def test_cli_detail_rendering(capsys):
    with tempfile.TemporaryDirectory() as repo_dir:
        src_dir = os.path.join(repo_dir, "src")
        adr_dir = os.path.join(repo_dir, "docs", "adr")
        os.makedirs(src_dir, exist_ok=True)
        os.makedirs(adr_dir, exist_ok=True)

        with open(os.path.join(src_dir, "app.py"), "w") as f:
            f.write("def run_server(): pass\n")

        with open(os.path.join(adr_dir, "0001-server.md"), "w") as f:
            f.write("""---
id: ADR-001
title: Server Setup
status: Accepted
anchors:
  - file: src/app.py
    symbol: run_server
---
Body content here
""")

        test_args = ["gitted", "detail", "ADR-001", "--repo", repo_dir, "--adr-dir", "docs/adr"]
        with patch.object(sys, "argv", test_args):
            main()

        captured = capsys.readouterr()
        assert "# ADR-001: Server Setup" in captured.out
        assert "**Status:** [Active]" in captured.out
        assert "src/app.py#run_server" in captured.out


def test_cli_init(tmp_path, monkeypatch, capsys):
    monkeypatch.chdir(tmp_path)
    sys_argv = ["gitted", "init"]
    monkeypatch.setattr("sys.argv", sys_argv)

    main()
    captured = capsys.readouterr()
    assert "Created" in captured.out or "already exists" in captured.out
    assert (tmp_path / ".contextbuilder" / "features.yml").exists()


def test_cli_analyze_json(tmp_path, monkeypatch, capsys):
    features_yml = tmp_path / "features.yml"
    features_yml.write_text("""
features:
  - name: Payments
    paths: ["services/payment/**"]
""", encoding="utf-8")

    sys_argv = [
        "gitted", "analyze",
        "--branch", "feature/PAY-482",
        "--commit-msg", "feat: add payment support",
        "--file", "services/payment/pay.py",
        "--features-file", str(features_yml),
        "--json"
    ]
    monkeypatch.setattr("sys.argv", sys_argv)

    main()
    captured = capsys.readouterr()
    data = json.loads(captured.out)
    assert data["change_type"] == "Feature"
    assert "Payments" in data["affected_areas"]
    assert "PAY-482" in data["ticket_references"]
