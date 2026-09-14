from datetime import datetime, timezone
import pytest
from src.context_engine.models import PullRequest, Commit
from src.context_engine.indexer import (
    GlobalTicketIndex,
    handle_single_repo_pr_webhook,
    handle_single_repo_push_webhook,
    ticket_index,
)


def test_global_ticket_index_pr_and_commit():
    index = GlobalTicketIndex()
    index.register_repository("1", "checkout-web")
    index.register_repository("2", "checkout-api")
    index.register_repository("3", "payment-service")

    # Ingest PR in payment-service
    pr_payment = PullRequest(
        pr_id="payment-service#89",
        repo_name="payment-service",
        number=89,
        title="[PAY-482] Refund processing endpoint",
        branch="feature/PAY-482-refunds",
        author="dev1",
        state="merged",
        created_at=datetime(2026, 9, 10, 10, 0, tzinfo=timezone.utc),
        merged_at=datetime(2026, 9, 10, 11, 0, tzinfo=timezone.utc),
    )
    keys_pr = index.index_pull_request(pr_payment)
    assert keys_pr == ["PAY-482"]

    # Ingest PR in checkout-web
    pr_web = PullRequest(
        pr_id="checkout-web#204",
        repo_name="checkout-web",
        number=204,
        title="[PAY-482] Add refund confirmation modal",
        branch="feature/PAY-482-refund-ui",
        author="dev2",
        state="merged",
        created_at=datetime(2026, 9, 10, 12, 0, tzinfo=timezone.utc),
        merged_at=datetime(2026, 9, 10, 13, 0, tzinfo=timezone.utc),
    )
    index.index_pull_request(pr_web)

    # Ingest commit in checkout-api
    commit_api = Commit(
        sha="abc1234",
        repo_name="checkout-api",
        message="[PAY-482] Route refund request to payment-service",
        author="dev3",
        committed_at=datetime(2026, 9, 10, 11, 30, tzinfo=timezone.utc),
    )
    index.index_commit(commit_api)

    # Verify global ticket correlation
    linked_prs = index.get_prs_for_ticket("PAY-482")
    assert len(linked_prs) == 2
    assert [p.repo_name for p in linked_prs] == ["payment-service", "checkout-web"]

    linked_commits = index.get_commits_for_ticket("PAY-482")
    assert len(linked_commits) == 1
    assert linked_commits[0].sha == "abc1234"

    linked_repos = index.get_linked_repositories("PAY-482")
    assert linked_repos == ["checkout-api", "checkout-web", "payment-service"]


def test_single_repo_webhook_handlers():
    pr_payload = {
        "action": "closed",
        "repository": {"name": "checkout-api"},
        "pull_request": {
            "number": 101,
            "title": "[PAY-482] Connect API to payment service",
            "head": {"ref": "feature/PAY-482-api"},
            "user": {"login": "alice"},
            "state": "closed",
            "created_at": "2026-09-11T10:00:00Z",
            "merged_at": "2026-09-11T10:30:00Z",
            "html_url": "https://github.com/org/checkout-api/pull/101",
            "files": [{"filename": "src/routes/refunds.ts"}],
        },
        "commit_messages": ["[PAY-482] Initial handler setup"],
    }

    res_pr = handle_single_repo_pr_webhook(pr_payload)
    assert res_pr["status"] == "success"
    assert res_pr["repository"] == "checkout-api"
    assert res_pr["pull_request_number"] == 101
    assert "PAY-482" in res_pr["indexed_issue_keys"]

    push_payload = {
        "repository": {"name": "payment-service"},
        "commits": [
            {
                "id": "def5678",
                "message": "[PAY-482] Add database migration for refunds",
                "author": {"name": "bob"},
                "timestamp": "2026-09-11T09:00:00Z",
                "url": "https://github.com/org/payment-service/commit/def5678",
            }
        ]
    }

    res_push = handle_single_repo_push_webhook(push_payload)
    assert res_push["status"] == "success"
    assert res_push["commits_processed"] == 1
    assert "PAY-482" in res_push["indexed_issue_keys"]
