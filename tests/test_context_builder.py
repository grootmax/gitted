import os
import tempfile
from gitted.models import ADR, ADRStatus, CodeAnchor
from gitted.ast_indexer import ASTIndexer
from gitted.context_builder import ContextBuilder


def test_scenario_inspecting_refactored_component():
    """
    Scenario: Inspecting a Refactored Component
    User Intent: Developer opens a payment processing module recently refactored to use new gateway API.
    Desired Experience: Context Builder checks AST anchors & ADR status lifecycle, hiding superseded ADR-024
    alerts and surfacing current ADR-082 rules.
    """
    with tempfile.TemporaryDirectory() as repo_dir:
        src_dir = os.path.join(repo_dir, "src")
        os.makedirs(src_dir, exist_ok=True)

        py_file = os.path.join(src_dir, "payment.py")
        with open(py_file, "w") as f:
            f.write("""
def execute_gateway_charge(payload):
    pass
""")

        # Superseded ADR-024
        adr_024 = ADR(
            id="ADR-024",
            title="Direct Stripe Integration",
            status=ADRStatus.SUPERSEDED,
            superseded_by="ADR-082",
            anchors=[CodeAnchor("src/payment.py", "legacy_stripe_call")]
        )

        # Active ADR-082
        adr_082 = ADR(
            id="ADR-082",
            title="Unified Payment Gateway API",
            status=ADRStatus.ACCEPTED,
            anchors=[CodeAnchor("src/payment.py", "execute_gateway_charge")]
        )

        indexer = ASTIndexer(repo_dir)
        builder = ContextBuilder(adrs=[adr_024, adr_082], indexer=indexer)

        context = builder.get_file_context("src/payment.py")

        # ADR-082 should be in active_adrs
        active_ids = [a.id for a in context["active_adrs"]]
        assert "ADR-082" in active_ids

        # ADR-024 should NOT be in active_adrs or stale_adrs (it is suppressed)
        assert "ADR-024" not in active_ids
        assert "ADR-024" not in [a.id for a in context["stale_adrs"]]
        assert "ADR-024" in [a.id for a in context["suppressed_adrs"]]

        panel = builder.render_before_you_change_panel("src/payment.py")
        assert "ADR-082: Unified Payment Gateway API" in panel
        assert "SUPPRESSED OUTDATED DECISIONS" in panel


def test_scenario_renaming_or_deleting_anchored_code():
    """
    Scenario: Renaming or Deleting Anchored Code
    User Intent: Engineer deletes a deprecated helper function referenced in an old ADR during a major clean-up PR.
    Desired Experience: Static analysis detects that target code anchor no longer exists, automatically updating
    ADR status indicator to `Stale Anchor` in Context Builder and prompting author to declare replacement ADR or deprecate.
    """
    with tempfile.TemporaryDirectory() as repo_dir:
        src_dir = os.path.join(repo_dir, "src")
        os.makedirs(src_dir, exist_ok=True)

        py_file = os.path.join(src_dir, "helpers.py")
        with open(py_file, "w") as f:
            f.write("""
def new_clean_helper():
    pass
""")

        # ADR-015 was Accepted, anchored to deleted function `deprecated_helper`
        adr_015 = ADR(
            id="ADR-015",
            title="Helper Function Architecture",
            status=ADRStatus.ACCEPTED,
            anchors=[CodeAnchor("src/helpers.py", "deprecated_helper")]
        )

        indexer = ASTIndexer(repo_dir)
        builder = ContextBuilder(adrs=[adr_015], indexer=indexer)

        context = builder.get_file_context("src/helpers.py")

        # adr_015 should be in stale_adrs
        stale_ids = [a.id for a in context["stale_adrs"]]
        assert "ADR-015" in stale_ids

        panel = builder.render_before_you_change_panel("src/helpers.py")
        assert "STALE ANCHOR WARNINGS" in panel
        assert "[Stale Anchor] ADR-015" in panel
        assert "Action Required: Update code anchor, declare replacement ADR, or deprecate record." in panel


def test_render_adr_detail():
    adr = ADR(
        id="ADR-024",
        title="Direct Stripe Integration",
        status=ADRStatus.SUPERSEDED,
        superseded_by="ADR-082",
        anchors=[CodeAnchor("src/payment.py", "stripe_charge")],
        content="We previously integrated directly with Stripe."
    )
    detail = ContextBuilder.render_adr_detail(adr)
    assert "# ADR-024: Direct Stripe Integration" in detail
    assert "**Status:** [Superseded by ADR-082]" in detail
    assert "**Superseded By:** ADR-082" in detail
