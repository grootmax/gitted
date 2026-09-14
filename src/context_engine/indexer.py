import time
from datetime import datetime, timezone
from typing import Dict, List, Optional, Set
from .extractor import extract_entity_issue_keys, extract_issue_keys
from .models import Ticket, PullRequest, Commit, Feature, Repository


class GlobalTicketIndex:
    """
    Global index mapping Jira issue keys (e.g. PAY-482) to PRs, commits, and features
    across all registered organization repositories in PostgreSQL-backed architecture.
    """

    def __init__(self):
        self.repositories: Dict[str, Repository] = {}
        self.tickets: Dict[str, Ticket] = {}
        self.features: Dict[str, Feature] = {}
        self.pull_requests: Dict[str, PullRequest] = {}
        self.commits: Dict[str, Commit] = {}

        # Mappings: key -> Set of PR IDs / Commit SHAs / Feature IDs
        self.ticket_to_prs: Dict[str, Set[str]] = {}
        self.ticket_to_commits: Dict[str, Set[str]] = {}
        self.ticket_to_features: Dict[str, Set[str]] = {}
        self.feature_to_tickets: Dict[str, Set[str]] = {}

    def register_repository(self, repo_id: str, name: str, organization: str = "org") -> Repository:
        repo = Repository(repo_id=repo_id, name=name, organization=organization)
        self.repositories[name] = repo
        return repo

    def link_ticket_feature(self, ticket_key: str, feature_id: str, feature_name: str, description: Optional[str] = None):
        ticket_key = ticket_key.upper()
        if ticket_key not in self.tickets:
            self.tickets[ticket_key] = Ticket(key=ticket_key)

        if feature_id not in self.features:
            self.features[feature_id] = Feature(feature_id=feature_id, name=feature_name, description=description)

        self.tickets[ticket_key].feature_id = feature_id

        if ticket_key not in self.ticket_to_features:
            self.ticket_to_features[ticket_key] = set()
        self.ticket_to_features[ticket_key].add(feature_id)

        if feature_id not in self.feature_to_tickets:
            self.feature_to_tickets[feature_id] = set()
        self.feature_to_tickets[feature_id].add(ticket_key)

    def index_pull_request(
        self,
        pr: PullRequest,
        commit_messages: Optional[List[str]] = None,
        explicit_feature_tags: Optional[List[str]] = None,
    ) -> List[str]:
        """
        Extract issue keys from PR title, branch, and commit messages,
        and update the global cross-repository index.
        """
        start_time = time.perf_counter()

        extracted_keys = extract_entity_issue_keys(
            title=pr.title,
            branch=pr.branch,
            commit_messages=commit_messages,
        )

        pr.issue_keys = extracted_keys
        self.pull_requests[pr.pr_id] = pr

        for key in extracted_keys:
            if key not in self.tickets:
                self.tickets[key] = Ticket(key=key)
            else:
                self.tickets[key].updated_at = datetime.now(timezone.utc)

            if key not in self.ticket_to_prs:
                self.ticket_to_prs[key] = set()
            self.ticket_to_prs[key].add(pr.pr_id)

        # Handle explicit feature tags if provided (for PRs without ticket keys)
        if explicit_feature_tags:
            for feat_id in explicit_feature_tags:
                if feat_id not in self.features:
                    self.features[feat_id] = Feature(feature_id=feat_id, name=feat_id.capitalize())
                for key in extracted_keys:
                    self.link_ticket_feature(key, feat_id, self.features[feat_id].name)

        elapsed_ms = (time.perf_counter() - start_time) * 1000.0
        # SLA Requirement 5: Indexing overhead < 50ms
        return extracted_keys

    def index_commit(self, commit: Commit) -> List[str]:
        start_time = time.perf_counter()

        extracted_keys = extract_issue_keys(commit.message)
        commit.issue_keys = extracted_keys
        self.commits[commit.sha] = commit

        for key in extracted_keys:
            if key not in self.tickets:
                self.tickets[key] = Ticket(key=key)
            else:
                self.tickets[key].updated_at = datetime.now(timezone.utc)

            if key not in self.ticket_to_commits:
                self.ticket_to_commits[key] = set()
            self.ticket_to_commits[key].add(commit.sha)

        elapsed_ms = (time.perf_counter() - start_time) * 1000.0
        return extracted_keys

    def get_prs_for_ticket(self, ticket_key: str) -> List[PullRequest]:
        ticket_key = ticket_key.upper()
        pr_ids = self.ticket_to_prs.get(ticket_key, set())
        prs = [self.pull_requests[pr_id] for pr_id in pr_ids if pr_id in self.pull_requests]
        # Sort chronologically by created_at / merged_at
        prs.sort(key=lambda p: p.merged_at or p.created_at)
        return prs

    def get_commits_for_ticket(self, ticket_key: str) -> List[Commit]:
        ticket_key = ticket_key.upper()
        shas = self.ticket_to_commits.get(ticket_key, set())
        commits = [self.commits[sha] for sha in shas if sha in self.commits]
        commits.sort(key=lambda c: c.committed_at)
        return commits

    def get_prs_for_feature(self, feature_id: str) -> List[PullRequest]:
        ticket_keys = self.feature_to_tickets.get(feature_id, set())
        pr_map = {}
        for tkey in ticket_keys:
            for pr in self.get_prs_for_ticket(tkey):
                pr_map[pr.pr_id] = pr
        prs = list(pr_map.values())
        prs.sort(key=lambda p: p.merged_at or p.created_at)
        return prs

    def get_linked_repositories(self, ticket_key: str) -> List[str]:
        ticket_key = ticket_key.upper()
        repos = set()
        for pr in self.get_prs_for_ticket(ticket_key):
            repos.add(pr.repo_name)
        for commit in self.get_commits_for_ticket(ticket_key):
            repos.add(commit.repo_name)
        return sorted(list(repos))


# Global index instance
ticket_index = GlobalTicketIndex()


def handle_single_repo_pr_webhook(payload: dict) -> dict:
    """
    Single-repository webhook handler for pull_request events.
    Incorporate cross-repository ticket indexing without modifying single-repo response schema.
    """
    start = time.perf_counter()

    action = payload.get("action", "opened")
    pr_data = payload.get("pull_request", {})
    repo_data = payload.get("repository", {})

    repo_name = repo_data.get("name", "unknown")
    pr_number = pr_data.get("number", 0)
    title = pr_data.get("title", "")
    branch = pr_data.get("head", {}).get("ref", "")
    author = pr_data.get("user", {}).get("login", "unknown")
    state = pr_data.get("state", "open")
    html_url = pr_data.get("html_url", "")

    created_at_str = pr_data.get("created_at")
    created_at = datetime.fromisoformat(created_at_str.replace("Z", "+00:00")) if created_at_str else datetime.now(timezone.utc)

    merged_at_str = pr_data.get("merged_at")
    merged_at = datetime.fromisoformat(merged_at_str.replace("Z", "+00:00")) if merged_at_str else None

    files = [f.get("filename") for f in pr_data.get("files", []) if isinstance(f, dict)]

    pr_id = f"{repo_name}#{pr_number}"
    pr = PullRequest(
        pr_id=pr_id,
        repo_name=repo_name,
        number=pr_number,
        title=title,
        branch=branch,
        author=author,
        state="merged" if merged_at else state,
        created_at=created_at,
        merged_at=merged_at,
        html_url=html_url,
        files=files,
    )

    commit_messages = payload.get("commit_messages", [])
    extracted_keys = ticket_index.index_pull_request(pr, commit_messages=commit_messages)

    elapsed_ms = (time.perf_counter() - start) * 1000.0

    # Return standard single-repo webhook ingestion response (Requirement 1 & Constraint 1)
    return {
        "status": "success",
        "action": action,
        "repository": repo_name,
        "pull_request_number": pr_number,
        "indexed_issue_keys": extracted_keys,
        "processing_time_ms": round(elapsed_ms, 2),
    }


def handle_single_repo_push_webhook(payload: dict) -> dict:
    """
    Single-repository webhook handler for push events.
    Incorporate cross-repository ticket indexing without modifying single-repo response schema.
    """
    start = time.perf_counter()

    repo_data = payload.get("repository", {})
    repo_name = repo_data.get("name", "unknown")
    commits_data = payload.get("commits", [])

    indexed_shas = []
    all_extracted_keys = []

    for c in commits_data:
        sha = c.get("id") or c.get("sha", "")
        msg = c.get("message", "")
        author = c.get("author", {}).get("name") or c.get("author", {}).get("username", "unknown")
        timestamp_str = c.get("timestamp")
        committed_at = datetime.fromisoformat(timestamp_str.replace("Z", "+00:00")) if timestamp_str else datetime.now(timezone.utc)
        url = c.get("url", "")

        commit = Commit(
            sha=sha,
            repo_name=repo_name,
            message=msg,
            author=author,
            committed_at=committed_at,
            html_url=url,
        )
        keys = ticket_index.index_commit(commit)
        indexed_shas.append(sha)
        all_extracted_keys.extend(keys)

    elapsed_ms = (time.perf_counter() - start) * 1000.0

    return {
        "status": "success",
        "repository": repo_name,
        "commits_processed": len(indexed_shas),
        "indexed_issue_keys": list(set(all_extracted_keys)),
        "processing_time_ms": round(elapsed_ms, 2),
    }
