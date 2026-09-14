import pytest
from src.context_engine.extractor import extract_issue_keys, extract_entity_issue_keys


def test_extract_issue_keys_basic():
    text = "[PAY-482] Implement refund API endpoint"
    keys = extract_issue_keys(text)
    assert keys == ["PAY-482"]


def test_extract_issue_keys_multiple():
    text = "Fixes PAY-482 and CHECKOUT-381 in payment pipeline"
    keys = extract_issue_keys(text)
    assert keys == ["PAY-482", "CHECKOUT-381"]


def test_extract_issue_keys_deduplication():
    text = "PAY-482: Update PAY-482 payload handler"
    keys = extract_issue_keys(text)
    assert keys == ["PAY-482"]


def test_extract_issue_keys_none_and_empty():
    assert extract_issue_keys("") == []
    assert extract_issue_keys(None) == []


def test_extract_issue_keys_invalid_patterns():
    text = "pay-482 no-match 123-ABC INVALID_KEY"
    # pay-482 is lowercase so regex [A-Z]+-\d+ won't match lowercase pay
    assert extract_issue_keys(text) == []


def test_extract_entity_issue_keys_combined():
    title = "[PAY-482] Refactor checkout API"
    branch = "feature/PAY-482-refunds"
    commits = [
        "[PAY-482] Add refund endpoint",
        "CHECKOUT-381 Update UI buttons",
    ]

    keys = extract_entity_issue_keys(title=title, branch=branch, commit_messages=commits)
    assert keys == ["PAY-482", "CHECKOUT-381"]
