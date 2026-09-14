import pytest
from gitted.models import TicketData
from gitted.ticket_parser import (
    extract_ticket_keys,
    MockTicketResolver,
    DefaultTicketResolver,
    parse_tickets
)

def test_extract_ticket_keys():
    text = "Fixing issue PAY-482 and PROJ-101 in branch feature/PAY-482-refunds. Closes #45"
    keys = extract_ticket_keys(text)
    assert "PAY-482" in keys
    assert "PROJ-101" in keys
    assert "#45" in keys

def test_mock_ticket_resolver():
    mock_data = {
        "PAY-482": TicketData(
            key="PAY-482",
            title="Partial refund support",
            description="Allow partial refunds for online payments",
            issue_type="Story",
            source="jira"
        )
    }
    resolver = MockTicketResolver(mock_data)
    t = resolver.resolve_ticket("PAY-482")
    assert t is not None
    assert t.title == "Partial refund support"
    assert t.issue_type == "Story"

def test_parse_tickets_combination():
    mock_resolver = MockTicketResolver({
        "PAY-482": TicketData(
            key="PAY-482",
            title="Partial refund support",
            description="Support partial refunding",
            issue_type="Story",
            source="jira"
        )
    })
    tickets = parse_tickets(
        branch_name="feature/PAY-482-refunds",
        pr_title="PAY-482: Add partial refund support",
        pr_body="Implementation details here",
        commit_messages=["feat: add partial refund endpoint"],
        resolver=mock_resolver
    )
    assert len(tickets) == 1
    assert tickets[0].key == "PAY-482"
    assert tickets[0].title == "Partial refund support"
