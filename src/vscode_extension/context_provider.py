from typing import Dict, List, Optional, Any
from src.context_engine.indexer import ticket_index, GlobalTicketIndex


class VSCodeContextProvider:
    """
    VS Code Extension Context Provider.
    Displays cross-repository linked PRs when viewing files or tickets associated with a microservice.
    Satisfies Requirement 3 and Acceptance Criteria 4.
    """

    def __init__(self, index: Optional[GlobalTicketIndex] = None):
        self.index = index or ticket_index

    def get_linked_prs_for_file(self, repo_name: str, file_path: str) -> List[Dict[str, Any]]:
        """
        Given a file being viewed in VS Code within repo_name,
        finds all tickets associated with that file and fetches linked PRs across all repositories.
        """
        # Find all PRs in repo_name touching file_path
        associated_tickets = set()

        for pr in self.index.pull_requests.values():
            if pr.repo_name == repo_name and (file_path in pr.files or not pr.files):
                for k in pr.issue_keys:
                    associated_tickets.add(k)

        linked_prs = []
        seen_pr_ids = set()

        for tkey in sorted(list(associated_tickets)):
            for pr in self.index.get_prs_for_ticket(tkey):
                if pr.pr_id not in seen_pr_ids:
                    seen_pr_ids.add(pr.pr_id)
                    linked_prs.append({
                        "pr_id": pr.pr_id,
                        "repo_name": pr.repo_name,
                        "number": pr.number,
                        "title": pr.title,
                        "branch": pr.branch,
                        "author": pr.author,
                        "state": pr.state,
                        "ticket_key": tkey,
                        "is_cross_repo": pr.repo_name != repo_name,
                        "url": pr.html_url or f"https://github.com/org/{pr.repo_name}/pull/{pr.number}",
                    })

        return linked_prs

    def get_ticket_context_tree(self, ticket_key: str) -> Dict[str, Any]:
        """
        Builds a hierarchical tree node structure for VS Code TreeDataProvider view.
        """
        ticket_key = ticket_key.upper()
        prs = self.index.get_prs_for_ticket(ticket_key)
        linked_repos = self.index.get_linked_repositories(ticket_key)

        repo_nodes = {}
        for repo in linked_repos:
            repo_nodes[repo] = []

        for pr in prs:
            if pr.repo_name not in repo_nodes:
                repo_nodes[pr.repo_name] = []

            repo_nodes[pr.repo_name].append({
                "label": f"#{pr.number} {pr.title}",
                "state": pr.state,
                "author": pr.author,
                "url": pr.html_url or f"https://github.com/org/{pr.repo_name}/pull/{pr.number}",
                "tooltip": f"{pr.repo_name} #{pr.number} ({pr.state}) by {pr.author}",
            })

        children = []
        for repo_name, pr_items in repo_nodes.items():
            children.append({
                "label": repo_name,
                "collapsibleState": "Expanded",
                "pr_count": len(pr_items),
                "children": pr_items,
            })

        return {
            "ticket_key": ticket_key,
            "label": f"Ticket {ticket_key}",
            "children": children,
        }
