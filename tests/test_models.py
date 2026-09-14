import pytest
from gitted.models import ADR, ADRStatus, CodeAnchor, ValidationResult


def test_code_anchor_str():
    c1 = CodeAnchor(file_path="src/payment.py")
    assert str(c1) == "src/payment.py"

    c2 = CodeAnchor(file_path="src/payment.py", symbol="process_stripe_payment")
    assert str(c2) == "src/payment.py#process_stripe_payment"


def test_adr_status_badges():
    # Active ADR
    adr_active = ADR(id="ADR-001", title="Use PostgreSQL", status=ADRStatus.ACCEPTED)
    assert adr_active.effective_status == ADRStatus.ACCEPTED
    assert adr_active.status_badge == "Active"

    # Deprecated ADR
    adr_dep = ADR(id="ADR-002", title="Use MongoDB", status=ADRStatus.DEPRECATED)
    assert adr_dep.effective_status == ADRStatus.DEPRECATED
    assert adr_dep.status_badge == "Deprecated"

    # Superseded ADR with replacement
    adr_sup = ADR(id="ADR-024", title="Direct Stripe Calls", status=ADRStatus.SUPERSEDED, superseded_by="ADR-082")
    assert adr_sup.effective_status == ADRStatus.SUPERSEDED
    assert adr_sup.status_badge == "Superseded by ADR-082"

    # Superseded ADR without replacement specified
    adr_sup_no_ref = ADR(id="ADR-025", title="Legacy Auth", status=ADRStatus.SUPERSEDED)
    assert adr_sup_no_ref.status_badge == "Superseded"


def test_adr_stale_anchor():
    anchor = CodeAnchor(file_path="src/payment.py", symbol="legacy_func")
    adr = ADR(
        id="ADR-024",
        title="Payment Refactor",
        status=ADRStatus.ACCEPTED,
        anchors=[anchor]
    )

    # Before validation
    assert adr.is_stale_anchor is False
    assert adr.effective_status == ADRStatus.ACCEPTED
    assert adr.status_badge == "Active"

    # Failed validation
    adr.validation_results = [
        ValidationResult(anchor=anchor, is_valid=False, reason="Symbol missing")
    ]
    assert adr.is_stale_anchor is True
    assert adr.effective_status == ADRStatus.STALE
    assert adr.status_badge == "Stale Anchor"


def test_unanchored_general_adr():
    adr = ADR(id="ADR-010", title="Code Formatting Guidelines", status=ADRStatus.ACCEPTED, anchors=[])
    assert adr.is_anchored is False
    assert adr.is_stale_anchor is False
    assert adr.effective_status == ADRStatus.ACCEPTED
    assert adr.status_badge == "Active"
