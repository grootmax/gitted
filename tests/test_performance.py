import time
from datetime import datetime, timezone
import pytest
from src.context_engine.indexer import GlobalTicketIndex
from src.context_engine.models import PullRequest, Commit


def test_ticket_indexing_overhead_sla():
    index = GlobalTicketIndex()

    # Pre-populate with 1,000 PRs across 5 repositories to simulate medium enterprise scale
    repos = ["checkout-web", "checkout-api", "payment-service", "user-service", "notification-service"]

    for i in range(1000):
        repo_name = repos[i % len(repos)]
        ticket_key = f"TICK-{i % 50}"
        pr = PullRequest(
            pr_id=f"{repo_name}#{i}",
            repo_name=repo_name,
            number=i,
            title=f"[{ticket_key}] Implement item {i}",
            branch=f"feature/{ticket_key}-item-{i}",
            author=f"user{i % 10}",
            state="merged",
            created_at=datetime.now(timezone.utc),
        )
        index.index_pull_request(pr)

    # Benchmark 100 new PR ingestion events
    total_time_ms = 0.0
    num_runs = 100

    for i in range(100):
        test_pr = PullRequest(
            pr_id=f"checkout-web#{2000 + i}",
            repo_name="checkout-web",
            number=2000 + i,
            title=f"[PAY-482] Benchmark PR {i} with CHECKOUT-381",
            branch=f"feature/PAY-482-bench-{i}",
            author="bench_user",
            state="open",
            created_at=datetime.now(timezone.utc),
        )

        start = time.perf_counter()
        index.index_pull_request(test_pr, commit_messages=[f"[PAY-482] Commit msg {i}"])
        elapsed = (time.perf_counter() - start) * 1000.0
        total_time_ms += elapsed

    avg_time_ms = total_time_ms / num_runs

    print(f"\nAverage ticket indexing overhead: {avg_time_ms:.4f} ms per event")

    # Requirement 5 SLA: Overhead < 50 ms
    assert avg_time_ms < 50.0, f"Indexing overhead ({avg_time_ms:.2f} ms) exceeded 50ms SLA boundary"
