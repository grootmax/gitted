from typing import List, Optional, Union
from pathlib import Path
from .models import PRIntent, TicketData, CommitData, FeatureRegistry
from .ticket_parser import parse_tickets, TicketResolver
from .commit_parser import parse_commits, infer_primary_change_type, map_type_to_change_type
from .path_scorer import score_affected_areas, load_feature_registry

TICKET_TYPE_MAP = {
    "bug": "Bugfix",
    "bugfix": "Bugfix",
    "defect": "Bugfix",
    "story": "Feature",
    "epic": "Feature",
    "feature": "Feature",
    "new feature": "Feature",
    "improvement": "Feature",
    "refactor": "Refactor",
    "refactoring": "Refactor",
    "task": "Refactor",  # Can be refined by commits
}

def synthesize_intent(
    tickets: Optional[List[TicketData]] = None,
    commits: Optional[List[CommitData]] = None,
    affected_areas: Optional[List[str]] = None,
    pr_title: str = "",
    pr_body: str = "",
    default_change_type: str = "Unclassified Change"
) -> PRIntent:
    """Synthesize PR intent metadata deterministically from tickets, commits, and path scoring."""
    tickets = tickets or []
    commits = commits or []
    affected_areas = affected_areas or []

    # 1. Ticket References
    ticket_refs = [t.key for t in tickets]

    # 2. Determine Change Type
    change_type = None

    # Check for breaking change in commits first
    if any(c.is_breaking for c in commits):
        change_type = "Breaking Change"

    # Next check ticket types
    if not change_type and tickets:
        primary_ticket = tickets[0]
        mapped_t_type = TICKET_TYPE_MAP.get(primary_ticket.issue_type.lower())
        if mapped_t_type and mapped_t_type != "Refactor":
            change_type = mapped_t_type
        elif mapped_t_type == "Refactor":
            # If ticket is "Task" or "Refactor", check if commits have specific conventional types
            commit_inferred = infer_primary_change_type(commits, default="")
            change_type = commit_inferred if commit_inferred else "Refactor"

    # Next check conventional commits
    if not change_type and commits:
        commit_inferred = infer_primary_change_type(commits, default="")
        if commit_inferred:
            change_type = commit_inferred

    # Fallback to safe default
    if not change_type:
        change_type = default_change_type

    # 3. Construct Reason (Rationale)
    reason_parts = []

    if tickets:
        t = tickets[0]
        t_summary = f"[{t.key}] {t.title}"
        if t.description:
            # First non-empty line of description
            desc_line = t.description.strip().splitlines()[0]
            t_summary += f" - {desc_line}"
        reason_parts.append(t_summary)

    # Conventional commit rationale
    conv_descriptions = []
    for c in commits:
        if c.description:
            if c.scope:
                conv_descriptions.append(f"{c.commit_type}({c.scope}): {c.description}")
            elif c.commit_type:
                conv_descriptions.append(f"{c.commit_type}: {c.description}")
            else:
                conv_descriptions.append(c.description)

    if conv_descriptions:
        if not tickets:
            reason_parts.append("; ".join(conv_descriptions[:3]))
        else:
            # Append concise commit detail
            reason_parts.append(f"Commits: {'; '.join(conv_descriptions[:2])}")

    if not reason_parts:
        if pr_title.strip():
            reason_parts.append(pr_title.strip())
        else:
            reason_parts.append("Unclassified change updated in codebase.")

    reason = " | ".join(reason_parts)

    # 4. Default Affected Areas if empty
    if not affected_areas:
        final_areas = ["General"]
    else:
        final_areas = affected_areas

    return PRIntent(
        reason=reason,
        change_type=change_type,
        affected_areas=final_areas,
        ticket_references=ticket_refs,
        raw_commits=commits,
        tickets=tickets,
        manual_override=False
    )

def analyze_pr_context(
    branch_name: str = "",
    pr_title: str = "",
    pr_body: str = "",
    commit_messages: Optional[List[str]] = None,
    modified_files: Optional[List[str]] = None,
    features_config_path: Optional[Union[str, Path]] = None,
    ticket_resolver: Optional[TicketResolver] = None
) -> PRIntent:
    """Full analysis pipeline extracting tickets, conventional commits, path scoring, and synthesizing intent."""
    commit_messages = commit_messages or []
    modified_files = modified_files or []

    # Parse tickets
    tickets = parse_tickets(
        branch_name=branch_name,
        pr_title=pr_title,
        pr_body=pr_body,
        commit_messages=commit_messages,
        resolver=ticket_resolver
    )

    # Parse commits
    parsed_commits = parse_commits(commit_messages)

    # Score paths
    affected_areas = []
    if features_config_path:
        registry = load_feature_registry(features_config_path)
        affected_areas = score_affected_areas(modified_files, registry)

    return synthesize_intent(
        tickets=tickets,
        commits=parsed_commits,
        affected_areas=affected_areas,
        pr_title=pr_title,
        pr_body=pr_body
    )
