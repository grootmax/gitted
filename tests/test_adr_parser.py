import os
import tempfile
from gitted.adr_parser import ADRParser
from gitted.models import ADRStatus


def test_parse_frontmatter():
    content = """---
id: ADR-082
title: Payment Gateway Interface Standard
status: Accepted
anchors:
  - file: src/payment.py
    symbol: PaymentGateway
  - src/checkout.py#process_order
---

# Payment Gateway Interface Standard

This ADR defines payment rules.
"""
    adr = ADRParser.parse_string(content, "0082-payment-gateway.md")
    assert adr.id == "ADR-082"
    assert adr.title == "Payment Gateway Interface Standard"
    assert adr.status == ADRStatus.ACCEPTED
    assert len(adr.anchors) == 2
    assert adr.anchors[0].file_path == "src/payment.py"
    assert adr.anchors[0].symbol == "PaymentGateway"
    assert adr.anchors[1].file_path == "src/checkout.py"
    assert adr.anchors[1].symbol == "process_order"


def test_parse_superseded_and_body_anchors():
    content = """
# ADR-024: Direct Stripe Call Handling

Status: Superseded
Superseded by: ADR-082

Anchors: src/stripe_service.py#charge_card

We used direct Stripe calls.
"""
    adr = ADRParser.parse_string(content)
    assert adr.id == "ADR-024"
    assert adr.status == ADRStatus.SUPERSEDED
    assert adr.superseded_by == "ADR-082"
    assert len(adr.anchors) == 1
    assert adr.anchors[0].file_path == "src/stripe_service.py"
    assert adr.anchors[0].symbol == "charge_card"


def test_parse_directory():
    with tempfile.TemporaryDirectory() as tmpdir:
        adr1_path = os.path.join(tmpdir, "0001-init.md")
        adr2_path = os.path.join(tmpdir, "0002-db.md")

        with open(adr1_path, "w") as f:
            f.write("---\nid: ADR-001\ntitle: Init\nstatus: Accepted\n---\nBody")
        with open(adr2_path, "w") as f:
            f.write("---\nid: ADR-002\ntitle: DB\nstatus: Deprecated\n---\nBody")

        adrs = ADRParser.parse_directory(tmpdir)
        assert len(adrs) == 2
        ids = {a.id for a in adrs}
        assert ids == {"ADR-001", "ADR-002"}
