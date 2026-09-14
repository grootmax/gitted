import re
from typing import List, Optional, Tuple
from .models import CommitData

# Conventional Commit Regex
# Format: type(scope)!: description
CONVENTIONAL_COMMIT_REGEX = re.compile(
    r'^(?P<type>[a-zA-Z0-9_-]+)(?:\((?P<scope>[^)]+)\))?(?P<breaking>!)?:\s*(?P<description>.+)',
    re.DOTALL
)

TYPE_TO_CHANGE_TYPE = {
    "feat": "Feature",
    "feature": "Feature",
    "fix": "Bugfix",
    "bugfix": "Bugfix",
    "refactor": "Refactor",
    "perf": "Performance",
    "performance": "Performance",
    "docs": "Documentation",
    "style": "Style",
    "test": "Test",
    "tests": "Test",
    "chore": "Chore",
    "build": "Build/CI",
    "ci": "Build/CI",
}

def parse_commit_message(raw_message: str, commit_hash: str = "") -> CommitData:
    """Parse a commit message string into a CommitData object."""
    clean_msg = raw_message.strip()
    lines = clean_msg.splitlines()
    header = lines[0] if lines else ""
    body = "\n".join(lines[1:]).strip() if len(lines) > 1 else ""

    match = CONVENTIONAL_COMMIT_REGEX.match(header)
    is_breaking_body = "BREAKING CHANGE" in body or "BREAKING-CHANGE" in body

    if match:
        c_type = match.group("type").lower()
        scope = match.group("scope")
        breaking_bang = bool(match.group("breaking"))
        description = match.group("description").strip()
        is_breaking = breaking_bang or is_breaking_body

        return CommitData(
            hash=commit_hash,
            raw_message=clean_msg,
            commit_type=c_type,
            scope=scope,
            description=description,
            body=body,
            is_breaking=is_breaking
        )

    # Fallback for non-conventional commit
    return CommitData(
        hash=commit_hash,
        raw_message=clean_msg,
        commit_type=None,
        scope=None,
        description=header,
        body=body,
        is_breaking=is_breaking_body
    )

def parse_commits(commit_messages: List[str]) -> List[CommitData]:
    """Parse a list of commit message strings."""
    results = []
    for msg in commit_messages:
        if msg.strip():
            results.append(parse_commit_message(msg))
    return results

def map_type_to_change_type(commit_type: Optional[str], is_breaking: bool = False) -> str:
    """Map conventional commit type to Context Builder Change Type."""
    if is_breaking:
        return "Breaking Change"
    if not commit_type:
        return "Unclassified Change"
    return TYPE_TO_CHANGE_TYPE.get(commit_type.lower(), "Unclassified Change")

def infer_primary_change_type(commits: List[CommitData], default: str = "Unclassified Change") -> str:
    """Infer the primary change type from a list of parsed commits."""
    if not commits:
        return default

    # Check for breaking change first
    if any(c.is_breaking for c in commits):
        return "Breaking Change"

    # Count occurrence of mapped change types
    type_counts = {}
    for c in commits:
        if c.commit_type:
            ct = map_type_to_change_type(c.commit_type)
            if ct != "Unclassified Change":
                type_counts[ct] = type_counts.get(ct, 0) + 1

    if not type_counts:
        return default

    # Priority ranking if counts are equal: Feature > Bugfix > Breaking Change > Refactor > Performance > Documentation > Chore
    priority = ["Feature", "Bugfix", "Breaking Change", "Refactor", "Performance", "Documentation", "Test", "Build/CI", "Chore", "Style"]
    
    sorted_types = sorted(type_counts.keys(), key=lambda t: (-type_counts[t], priority.index(t) if t in priority else 99))
    return sorted_types[0]
