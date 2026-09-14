from typing import Dict, List, Optional, Any
from src.context_engine.indexer import ticket_index, GlobalTicketIndex
from src.context_engine.models import PullRequest, Commit


class FeatureTimelineGenerator:
    """
    Renders unified multi-repository timelines grouping changes across microservices
    (checkout-web, checkout-api, payment-service) under shared feature and ticket nodes.
    Satisfies Requirement 3 and Principle #9.
    """

    def __init__(self, index: Optional[GlobalTicketIndex] = None):
        self.index = index or ticket_index

    def get_ticket_timeline(self, ticket_key: str) -> Dict[str, Any]:
        ticket_key = ticket_key.upper()
        prs = self.index.get_prs_for_ticket(ticket_key)
        commits = self.index.get_commits_for_ticket(ticket_key)
        linked_repos = self.index.get_linked_repositories(ticket_key)

        events = []

        for pr in prs:
            events.append({
                "event_type": "pull_request",
                "repo_name": pr.repo_name,
                "pr_number": pr.number,
                "title": pr.title,
                "author": pr.author,
                "state": pr.state,
                "timestamp": (pr.merged_at or pr.created_at).isoformat(),
                "created_at": pr.created_at.isoformat(),
                "merged_at": pr.merged_at.isoformat() if pr.merged_at else None,
                "html_url": pr.html_url or f"https://github.com/org/{pr.repo_name}/pull/{pr.number}",
                "issue_keys": pr.issue_keys,
            })

        for commit in commits:
            events.append({
                "event_type": "commit",
                "repo_name": commit.repo_name,
                "sha": commit.sha,
                "message": commit.message,
                "author": commit.author,
                "timestamp": commit.committed_at.isoformat(),
                "html_url": commit.html_url or f"https://github.com/org/{commit.repo_name}/commit/{commit.sha}",
                "issue_keys": commit.issue_keys,
            })

        # Sort combined events chronologically
        events.sort(key=lambda e: e["timestamp"])

        return {
            "ticket_key": ticket_key,
            "linked_repositories": linked_repos,
            "total_prs": len(prs),
            "total_commits": len(commits),
            "events": events,
        }

    def get_feature_timeline(self, feature_id: str) -> Dict[str, Any]:
        feature_id = feature_id.lower()
        feature = self.index.features.get(feature_id)
        feature_name = feature.name if feature else feature_id.capitalize()

        prs = self.index.get_prs_for_feature(feature_id)
        repos = sorted(list(set(pr.repo_name for pr in prs)))

        events = []
        for pr in prs:
            events.append({
                "event_type": "pull_request",
                "repo_name": pr.repo_name,
                "pr_number": pr.number,
                "title": pr.title,
                "author": pr.author,
                "state": pr.state,
                "timestamp": (pr.merged_at or pr.created_at).isoformat(),
                "created_at": pr.created_at.isoformat(),
                "merged_at": pr.merged_at.isoformat() if pr.merged_at else None,
                "html_url": pr.html_url or f"https://github.com/org/{pr.repo_name}/pull/{pr.number}",
                "issue_keys": pr.issue_keys,
            })

        events.sort(key=lambda e: e["timestamp"])

        return {
            "feature_id": feature_id,
            "feature_name": feature_name,
            "linked_repositories": repos,
            "total_prs": len(prs),
            "events": events,
        }

    def build_github_app_pr_context_block(
        self,
        current_repo: str,
        current_pr_number: int,
        ticket_key: str,
    ) -> str:
        """
        Generates GitHub App PR comment block highlighting cross-repository sister PRs.
        User Scenario: Pull Request Context Review.
        """
        ticket_key = ticket_key.upper()
        all_prs = self.index.get_prs_for_ticket(ticket_key)

        sister_prs = [
            pr for pr in all_prs
            if not (pr.repo_name == current_repo and pr.number == current_pr_number)
        ]

        if not sister_prs:
            return f"### 🔗 Cross-Repository Context (`{ticket_key}`)\n*No sister pull requests found across other repositories.*"

        lines = [
            f"### 🔗 Cross-Repository Context (`{ticket_key}`)",
            f"Sister pull requests associated with **{ticket_key}** across service repositories:\n"
        ]

        for pr in sister_prs:
            url = pr.html_url or f"https://github.com/org/{pr.repo_name}/pull/{pr.number}"
            status_str = f"`{pr.state}`"
            lines.append(f"- **{pr.repo_name}**: [#{pr.number} {pr.title}]({url}) ({status_str})")

        return "\n".join(lines)
