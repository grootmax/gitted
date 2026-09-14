import os
import tempfile
from gitted.ast_indexer import ASTIndexer
from gitted.models import ADR, ADRStatus, CodeAnchor


def test_ast_indexing_and_anchor_verification():
    with tempfile.TemporaryDirectory() as repo_dir:
        # Create dummy python files
        src_dir = os.path.join(repo_dir, "src")
        os.makedirs(src_dir, exist_ok=True)

        py_file = os.path.join(src_dir, "payment.py")
        with open(py_file, "w") as f:
            f.write("""
class PaymentProcessor:
    def process_charge(self, amount):
        pass

def calculate_fee(amount):
    return amount * 0.02
""")

        indexer = ASTIndexer(repo_dir)

        # 1. Valid file & function anchor
        valid_anchor = CodeAnchor(file_path="src/payment.py", symbol="calculate_fee")
        res1 = indexer.validate_anchor(valid_anchor)
        assert res1.is_valid is True

        # 2. Valid class & method anchor
        class_method_anchor = CodeAnchor(file_path="src/payment.py", symbol="PaymentProcessor.process_charge")
        res2 = indexer.validate_anchor(class_method_anchor)
        assert res2.is_valid is True

        # 3. Missing symbol in existing file (fuzzy matching suggested)
        fuzzy_anchor = CodeAnchor(file_path="src/payment.py", symbol="calc_fee")
        res3 = indexer.validate_anchor(fuzzy_anchor)
        assert res3.is_valid is False
        assert res3.suggested_symbol == "calculate_fee"

        # 4. Completely deleted symbol
        deleted_anchor = CodeAnchor(file_path="src/payment.py", symbol="legacy_stripe_charge")
        res4 = indexer.validate_anchor(deleted_anchor)
        assert res4.is_valid is False

        # 5. Deleted file
        missing_file_anchor = CodeAnchor(file_path="src/old_stripe.py", symbol="charge")
        res5 = indexer.validate_anchor(missing_file_anchor)
        assert res5.is_valid is False


def test_validate_adr_lifecycle():
    with tempfile.TemporaryDirectory() as repo_dir:
        src_dir = os.path.join(repo_dir, "src")
        os.makedirs(src_dir, exist_ok=True)

        py_file = os.path.join(src_dir, "gateway.py")
        with open(py_file, "w") as f:
            f.write("def charge_gateway(): pass\n")

        indexer = ASTIndexer(repo_dir)

        # Active ADR with valid anchor
        adr_valid = ADR(
            id="ADR-082",
            title="Gateway Standard",
            status=ADRStatus.ACCEPTED,
            anchors=[CodeAnchor("src/gateway.py", "charge_gateway")]
        )
        indexer.validate_adr(adr_valid)
        assert adr_valid.effective_status == ADRStatus.ACCEPTED
        assert adr_valid.is_stale_anchor is False

        # ADR with removed symbol -> becomes STALE
        adr_stale = ADR(
            id="ADR-024",
            title="Direct Stripe Calls",
            status=ADRStatus.ACCEPTED,
            anchors=[CodeAnchor("src/gateway.py", "direct_stripe_charge")]
        )
        indexer.validate_adr(adr_stale)
        assert adr_stale.effective_status == ADRStatus.STALE
        assert adr_stale.status_badge == "Stale Anchor"

        # Superseded ADR with removed symbol -> remains SUPERSEDED (not flagged as stale alert)
        adr_superseded = ADR(
            id="ADR-024",
            title="Direct Stripe Calls",
            status=ADRStatus.SUPERSEDED,
            superseded_by="ADR-082",
            anchors=[CodeAnchor("src/gateway.py", "direct_stripe_charge")]
        )
        indexer.validate_adr(adr_superseded)
        assert adr_superseded.effective_status == ADRStatus.SUPERSEDED
        assert adr_superseded.is_stale_anchor is False
        assert adr_superseded.status_badge == "Superseded by ADR-082"
