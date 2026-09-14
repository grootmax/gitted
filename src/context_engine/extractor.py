import re
from typing import List, Optional

# Requirement 1: Issue keys matching regex [A-Z]+-\d+
ISSUE_KEY_REGEX = re.compile(r"[A-Z]+-\d+")


def extract_issue_keys(text: Optional[str]) -> List[str]:
    r"""
    Extract issue keys (e.g., PAY-482, CHECKOUT-381) matching regex [A-Z]+-\d+ from a string.
    Returns a deduplicated list of issue keys in order of appearance.
    """
    if not text:
        return []

    matches = ISSUE_KEY_REGEX.findall(text)
    seen = set()
    unique_keys = []
    for key in matches:
        key_upper = key.upper()
        if key_upper not in seen:
            seen.add(key_upper)
            unique_keys.append(key_upper)
    return unique_keys


def extract_entity_issue_keys(
    title: Optional[str] = None,
    branch: Optional[str] = None,
    commit_messages: Optional[List[str]] = None,
) -> List[str]:
    """
    Extract issue keys from PR title, branch name, and commit messages.
    Combines and deduplicates keys across all sources.
    """
    seen = set()
    keys = []

    # Helper to collect
    def collect_from_text(t: Optional[str]):
        for k in extract_issue_keys(t):
            if k not in seen:
                seen.add(k)
                keys.append(k)

    collect_from_text(title)
    collect_from_text(branch)

    if commit_messages:
        for msg in commit_messages:
            collect_from_text(msg)

    return keys
