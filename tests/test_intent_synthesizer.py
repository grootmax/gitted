import pytest
from gitted.models import TicketData
from gitted.intent_synthesizer import analyze_pr_context, synthesize_intent
from gitted.ticket_parser import MockTicketResolver

def test_scenario_jira_ticket_linked_pr(tmp_path):
    # Setup feature registry
    features_yml = tmp_path / "features.yml"
    features_yml.write_text("""
features:
  - name: Payments
    paths: ["services/payment/**"]
  - name: Refunds
    paths: ["services/refund/**"]
""", encoding="utf-8")

    # Setup mock resolver
    resolver = MockTicketResolver({
        "PAY-482": TicketData(
            key="PAY-482",
            title="Add partial refund support",
            description="Enable customers to receive partial refunds for orders",
            issue_type="Story",
            source="jira"
        )
    })

    intent = analyze_pr_context(
        branch_name="feature/PAY-482-partial-refunds",
        pr_title="PAY-482: Partial refund support",
        commit_messages=["feat: add partial refund support"],
        modified_files=["services/payment/checkout.py", "services/refund/processor.py"],
        features_config_path=features_yml,
        ticket_resolver=resolver
    )

    assert intent.change_type == "Feature"
    assert "Payments" in intent.affected_areas
    assert "Refunds" in intent.affected_areas
    assert "PAY-482" in intent.ticket_references
    assert "PAY-482" in intent.reason
    assert "Add partial refund support" in intent.reason

def test_scenario_architectural_change_no_ticket(tmp_path):
    features_yml = tmp_path / "features.yml"
    features_yml.write_text("""
features:
  - name: Payments
    paths: ["services/payment/**"]
""", encoding="utf-8")

    intent = analyze_pr_context(
        branch_name="refactor/payment-service",
        pr_title="Refactor payment processing logic",
        commit_messages=["refactor: extract payment service"],
        modified_files=["services/payment/service.py"],
        features_config_path=features_yml
    )

    assert intent.change_type == "Refactor"
    assert intent.affected_areas == ["Payments"]
    assert "refactor: extract payment service" in intent.reason.lower()

def test_scenario_missing_ticket_and_commit_metadata():
    intent = analyze_pr_context(
        branch_name="main-patch",
        pr_title="",
        commit_messages=["minor update"],
        modified_files=["random.txt"]
    )

    assert intent.change_type == "Unclassified Change"
    assert intent.affected_areas == ["General"]
    assert intent.reason != ""
