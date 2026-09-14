import time
from datetime import datetime, timezone
from src.context_engine.indexer import (
    GlobalTicketIndex,
    handle_single_repo_pr_webhook,
)
from src.context_engine.models import (
    PullRequest,
    POSTGRES_SCHEMA_SQL,
    PackageDependency,
    CrossRepoPackageLink,
)
from src.context_engine.extractor import (
    parse_package_manifest,
    extract_ast_imports,
)


def test_schema_includes_package_tables():
    """Requirement 4: DDL Schema in models.py includes package_dependencies and cross_repo_package_links tables."""
    assert "CREATE TABLE IF NOT EXISTS package_dependencies" in POSTGRES_SCHEMA_SQL
    assert "CREATE TABLE IF NOT EXISTS cross_repo_package_links" in POSTGRES_SCHEMA_SQL
    assert "idx_package_deps_pkg" in POSTGRES_SCHEMA_SQL
    assert "idx_cross_repo_pkg" in POSTGRES_SCHEMA_SQL


def test_package_manifest_parsing():
    """Requirement 1: Manifest parsing extracts package name & dependencies for package.json, pyproject.toml, go.mod, Cargo.toml."""
    # package.json
    pkg_json_content = """{
      "name": "@org/auth-service",
      "dependencies": {
        "@org/core-utils": "^2.1.0",
        "express": "^4.18.0"
      }
    }"""
    self_pkg, deps = parse_package_manifest("package.json", pkg_json_content)
    assert self_pkg == "@org/auth-service"
    assert "@org/core-utils" in deps
    assert "express" in deps

    # pyproject.toml
    pyproject_content = """[project]
name = "payment-lib"
dependencies = [
    "common-models>=1.2.0",
    "requests>=2.28.0"
]"""
    self_pkg, deps = parse_package_manifest("pyproject.toml", pyproject_content)
    assert self_pkg == "payment-lib"
    assert "common-models" in deps

    # go.mod
    go_mod_content = """module github.com/org/checkout-service

go 1.20

require (
    github.com/org/payment-sdk v1.4.0
)"""
    self_pkg, deps = parse_package_manifest("go.mod", go_mod_content)
    assert self_pkg == "github.com/org/checkout-service"
    assert "github.com/org/payment-sdk" in deps

    # Cargo.toml
    cargo_content = """[package]
name = "cargo-service"

[dependencies]
shared-crate = "0.5.0"
"""
    self_pkg, deps = parse_package_manifest("Cargo.toml", cargo_content)
    assert self_pkg == "cargo-service"
    assert "shared-crate" in deps


def test_ast_import_extraction():
    """Requirement 2: AST import extraction identifies cross-repo module imports."""
    # Python AST import
    py_code = """
import sys
from shared_payment_sdk.client import PaymentClient
from core_auth import verify_token

def process():
    pass
"""
    py_imports = extract_ast_imports("service.py", py_code)
    assert "shared_payment_sdk" in py_imports
    assert "core_auth" in py_imports

    # JS/TS import
    ts_code = """
import { PaymentProcessor } from '@org/payment-lib';
import auth from 'shared-auth';
const util = require('common-utils');
"""
    ts_imports = extract_ast_imports("index.ts", ts_code)
    assert "@org/payment-lib" in ts_imports
    assert "shared-auth" in ts_imports
    assert "common-utils" in ts_imports


def test_non_ticketed_pr_package_manifest_correlation():
    """Requirement 1 & 3: Non-ticketed PRs modifying package manifests establish cross-repo links in GlobalTicketIndex."""
    index = GlobalTicketIndex()

    # Step 1: Provider PR registers provider package export
    provider_pr = PullRequest(
        pr_id="auth-provider-service#1",
        repo_name="auth-provider-service",
        number=1,
        title="Initial release of auth library",
        branch="main",
        author="alice",
        state="merged",
        created_at=datetime.now(timezone.utc),
        files=["package.json"],
    )
    provider_json = '{"name": "@org/auth-lib", "dependencies": {}}'
    index.index_pull_request(provider_pr, file_contents={"package.json": provider_json})

    # Step 2: Non-ticketed Consumer PR updates package.json to depend on @org/auth-lib
    consumer_pr = PullRequest(
        pr_id="checkout-web#42",
        repo_name="checkout-web",
        number=42,
        title="Upgrade dependencies",
        branch="chore/deps-update",
        author="bob",
        state="open",
        created_at=datetime.now(timezone.utc),
        files=["package.json"],
    )
    consumer_json = '{"name": "checkout-web", "dependencies": {"@org/auth-lib": "^2.0.0"}}'
    index.index_pull_request(consumer_pr, file_contents={"package.json": consumer_json})

    # Verify GlobalTicketIndex package mappings
    assert "@org/auth-lib" in index.package_to_prs
    assert "checkout-web#42" in index.package_to_prs["@org/auth-lib"]
    assert "auth-provider-service#1" in index.package_to_prs["@org/auth-lib"]

    # Verify get_linked_repositories for non-ticketed package changes
    linked_repos = index.get_linked_repositories("@org/auth-lib")
    assert "auth-provider-service" in linked_repos
    assert "checkout-web" in linked_repos


def test_non_ticketed_ast_import_correlation():
    """Requirement 2 & 3: AST imports in non-ticketed PR correlate downstream consumer and provider repos."""
    index = GlobalTicketIndex()

    # Provider repo exports module shared_billing
    index.register_package_export("shared_billing", "billing-service")

    # Non-ticketed PR in consumer repo import shared_billing module
    consumer_pr = PullRequest(
        pr_id="invoice-service#15",
        repo_name="invoice-service",
        number=15,
        title="Refactor invoice formatting",
        branch="refactor/invoice-format",
        author="charlie",
        state="open",
        created_at=datetime.now(timezone.utc),
        files=["src/invoice.py"],
    )
    py_code = "from shared_billing import calculate_tax\n\ndef generate(): pass\n"
    index.index_pull_request(consumer_pr, file_contents={"src/invoice.py": py_code})

    # Verify get_linked_repositories returns consuming and providing repositories
    linked = index.get_linked_repositories("shared_billing")
    assert "billing-service" in linked
    assert "invoice-service" in linked


def test_webhook_handler_sla_and_payload_contract():
    """Requirement 5 & Guardrails: handle_single_repo_pr_webhook completes within 50ms SLA and preserves payload contract."""
    payload = {
        "action": "opened",
        "pull_request": {
            "number": 101,
            "title": "Chore: Update dependencies in package.json",
            "head": {"ref": "chore/update-deps"},
            "user": {"login": "dev1"},
            "state": "open",
            "created_at": "2026-09-14T10:00:00Z",
            "files": [
                {
                    "filename": "package.json",
                    "content": '{"name": "service-a", "dependencies": {"@org/shared-module": "^1.0.0"}}',
                }
            ],
        },
        "repository": {"name": "service-a"},
    }

    start = time.perf_counter()
    res = handle_single_repo_pr_webhook(payload)
    elapsed_ms = (time.perf_counter() - start) * 1000.0

    # Contract verification
    assert res["status"] == "success"
    assert res["action"] == "opened"
    assert res["repository"] == "service-a"
    assert res["pull_request_number"] == 101
    assert "indexed_issue_keys" in res
    assert "processing_time_ms" in res

    # SLA requirement < 50ms
    assert elapsed_ms < 50.0
    assert res["processing_time_ms"] < 50.0
