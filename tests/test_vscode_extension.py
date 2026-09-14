from datetime import datetime, timezone
import pytest
from src.context_engine.indexer import GlobalTicketIndex
from src.context_engine.models import PullRequest
from src.vscode_extension.context_provider import VSCodeContextProvider


def test_vscode_linked_prs_for_file():
    index = GlobalTicketIndex()

    pr_web = PullRequest(
        pr_id="checkout-web#204",
        repo_name="checkout-web",
        number=204,
        title="[PAY-482] UI Refund Dialog",
        branch="feature/PAY-482",
        author="alice",
        state="merged",
        created_at=datetime(2026, 9, 10, 8, 0, tzinfo=timezone.utc),
        files=["src/components/RefundDialog.tsx"],
    )
    pr_api = PullRequest(
        pr_id="checkout-api#15",
        repo_name="checkout-api",
        number=15,
        title="[PAY-482] Refund API controller",
        branch="feature/PAY-482",
        author="bob",
        state="merged",
        created_at=datetime(2026, 9, 10, 9, 0, tzinfo=timezone.utc),
        files=["src/controllers/refund.ts"],
    )

    index.index_pull_request(pr_web)
    index.index_pull_request(pr_api)

    provider = VSCodeContextProvider(index=index)

    # Developer viewing RefundDialog.tsx in checkout-web
    linked = provider.get_linked_prs_for_file("checkout-web", "src/components/RefundDialog.tsx")
    assert len(linked) == 2

    cross_repo_prs = [p for p in linked if p["is_cross_repo"]]
    assert len(cross_repo_prs) == 1
    assert cross_repo_prs[0]["repo_name"] == "checkout-api"
    assert cross_repo_prs[0]["number"] == 15


def test_vscode_ticket_context_tree():
    index = GlobalTicketIndex()

    pr_payment = PullRequest(
        pr_id="payment-service#89",
        repo_name="payment-service",
        number=89,
        title="[PAY-482] Core payment refund handler",
        branch="feature/PAY-482",
        author="dev1",
        state="merged",
        created_at=datetime(2026, 9, 10, 8, 0, tzinfo=timezone.utc),
    )
    pr_web = PullRequest(
        pr_id="checkout-web#204",
        repo_name="checkout-web",
        number=204,
        title="[PAY-482] UI Refund Dialog",
        branch="feature/PAY-482",
        author="dev2",
        state="open",
        created_at=datetime(2026, 9, 10, 9, 0, tzinfo=timezone.utc),
    )

    index.index_pull_request(pr_payment)
    index.index_pull_request(pr_web)

    provider = VSCodeContextProvider(index=index)
    tree = provider.get_ticket_context_tree("PAY-482")

    assert tree["ticket_key"] == "PAY-482"
    assert len(tree["children"]) == 2  # checkout-web and payment-service repo nodes
