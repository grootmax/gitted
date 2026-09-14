import json
from datetime import datetime, timezone
import pytest
from src.context_engine.indexer import GlobalTicketIndex
from src.context_engine.models import PullRequest
from src.web_app.timeline import FeatureTimelineGenerator
from src.web_app.app import WebAppService
from gitted.models import PRIntent
from gitted.timeline import append_to_timeline


def test_feature_timeline_generator():
    index = GlobalTicketIndex()

    # Create 3 PRs across checkout-web, checkout-api, payment-service
    pr1 = PullRequest(
        pr_id="payment-service#89",
        repo_name="payment-service",
        number=89,
        title="[PAY-482] Backend refund endpoint",
        branch="feature/PAY-482-refund-backend",
        author="alice",
        state="merged",
        created_at=datetime(2026, 9, 10, 8, 0, tzinfo=timezone.utc),
        merged_at=datetime(2026, 9, 10, 9, 0, tzinfo=timezone.utc),
    )
    pr2 = PullRequest(
        pr_id="checkout-api#12",
        repo_name="checkout-api",
        number=12,
        title="[PAY-482] API gateway refund routing",
        branch="feature/PAY-482-gateway",
        author="bob",
        state="merged",
        created_at=datetime(2026, 9, 10, 9, 30, tzinfo=timezone.utc),
        merged_at=datetime(2026, 9, 10, 10, 0, tzinfo=timezone.utc),
    )
    pr3 = PullRequest(
        pr_id="checkout-web#204",
        repo_name="checkout-web",
        number=204,
        title="[PAY-482] Refund UI component",
        branch="feature/PAY-482-ui",
        author="charlie",
        state="merged",
        created_at=datetime(2026, 9, 10, 10, 30, tzinfo=timezone.utc),
        merged_at=datetime(2026, 9, 10, 11, 0, tzinfo=timezone.utc),
    )

    index.index_pull_request(pr1)
    index.index_pull_request(pr2)
    index.index_pull_request(pr3)
    index.link_ticket_feature("PAY-482", "refunds", "Refunds Processing")

    gen = FeatureTimelineGenerator(index=index)
    timeline = gen.get_ticket_timeline("PAY-482")

    assert timeline["ticket_key"] == "PAY-482"
    assert timeline["total_prs"] == 3
    assert timeline["linked_repositories"] == ["checkout-api", "checkout-web", "payment-service"]

    # Verify chronological order
    events = timeline["events"]
    assert events[0]["repo_name"] == "payment-service"
    assert events[1]["repo_name"] == "checkout-api"
    assert events[2]["repo_name"] == "checkout-web"

    # Verify feature timeline
    feat_timeline = gen.get_feature_timeline("refunds")
    assert feat_timeline["feature_id"] == "refunds"
    assert feat_timeline["total_prs"] == 3


def test_github_app_pr_context_block():
    index = GlobalTicketIndex()

    pr1 = PullRequest(
        pr_id="payment-service#89",
        repo_name="payment-service",
        number=89,
        title="[PAY-482] Backend refund endpoint",
        branch="feature/PAY-482",
        author="alice",
        state="merged",
        created_at=datetime(2026, 9, 10, 8, 0, tzinfo=timezone.utc),
    )
    pr2 = PullRequest(
        pr_id="checkout-web#204",
        repo_name="checkout-web",
        number=204,
        title="[PAY-482] Refund UI modal",
        branch="feature/PAY-482",
        author="charlie",
        state="open",
        created_at=datetime(2026, 9, 10, 10, 0, tzinfo=timezone.utc),
    )

    index.index_pull_request(pr1)
    index.index_pull_request(pr2)

    gen = FeatureTimelineGenerator(index=index)

    # When reviewing checkout-api#12 or checkout-web#204
    block = gen.build_github_app_pr_context_block("checkout-api", 12, "PAY-482")
    assert "Cross-Repository Context (`PAY-482`)" in block
    assert "payment-service" in block
    assert "checkout-web" in block
    assert "#89 [PAY-482] Backend refund endpoint" in block


def test_web_app_service_endpoints():
    index = GlobalTicketIndex()

    pr = PullRequest(
        pr_id="payment-service#89",
        repo_name="payment-service",
        number=89,
        title="[PAY-482] Refund service",
        branch="feature/PAY-482",
        author="dev",
        state="merged",
        created_at=datetime(2026, 9, 10, 8, 0, tzinfo=timezone.utc),
    )
    index.index_pull_request(pr)

    svc = WebAppService(timeline_generator=FeatureTimelineGenerator(index=index))
    res = svc.handle_ticket_timeline_request("PAY-482")
    assert res["status"] == "success"
    assert res["data"]["total_prs"] == 1


def test_append_to_timeline_json(tmp_path):
    timeline_file = tmp_path / "timeline.json"
    intent = PRIntent(
        reason="PAY-482: Add partial refund support",
        change_type="Feature",
        affected_areas=["Payments", "Refunds"],
        ticket_references=["PAY-482"]
    )

    entry = append_to_timeline(
        timeline_path=timeline_file,
        intent=intent,
        pr_number=101,
        commit_sha="abc1234"
    )

    assert timeline_file.exists()
    data = json.loads(timeline_file.read_text(encoding="utf-8"))
    assert len(data["entries"]) == 1
    recorded = data["entries"][0]
    assert recorded["change_type"] == "Feature"
    assert recorded["affected_areas"] == ["Payments", "Refunds"]
    assert recorded["pr_number"] == 101
    assert recorded["commit_sha"] == "abc1234"
