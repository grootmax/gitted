import pytest
from gitted.commit_parser import (
    parse_commit_message,
    parse_commits,
    infer_primary_change_type,
    map_type_to_change_type
)

def test_parse_conventional_commit_feature():
    msg = "feat(payments): add partial refund support"
    commit = parse_commit_message(msg)
    assert commit.commit_type == "feat"
    assert commit.scope == "payments"
    assert commit.description == "add partial refund support"
    assert not commit.is_breaking

def test_parse_conventional_commit_breaking():
    msg = "refactor!: extract payment service"
    commit = parse_commit_message(msg)
    assert commit.commit_type == "refactor"
    assert commit.is_breaking
    assert map_type_to_change_type(commit.commit_type, commit.is_breaking) == "Breaking Change"

def test_parse_non_conventional_commit():
    msg = "quick bugfix for issue"
    commit = parse_commit_message(msg)
    assert commit.commit_type is None
    assert commit.description == "quick bugfix for issue"

def test_infer_primary_change_type():
    commits = parse_commits([
        "feat: add refund endpoint",
        "fix: resolve null check in refund handler",
        "docs: update API docs"
    ])
    primary = infer_primary_change_type(commits)
    assert primary == "Feature"

def test_infer_primary_change_type_breaking():
    commits = parse_commits([
        "feat: add new API",
        "refactor!: breaking change in payment interface"
    ])
    primary = infer_primary_change_type(commits)
    assert primary == "Breaking Change"

def test_infer_primary_change_type_fallback():
    commits = parse_commits(["miscellaneous updates", "wip"])
    primary = infer_primary_change_type(commits)
    assert primary == "Unclassified Change"
