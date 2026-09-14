import re
from typing import List, Dict, Optional, Protocol, Any
from .models import TicketData

# Regex for Jira style ticket keys (e.g. PAY-482, PROJ-123, ABC-1)
JIRA_KEY_PATTERN = re.compile(r'\b([A-Z][A-Z0-9]+-\d+)\b', re.IGNORECASE)

# Regex for GitHub style issues (e.g. #123, GH-123)
GITHUB_ISSUE_PATTERN = re.compile(r'(?:(?:Fixes|Closes|Resolves|Refs)\s+)?#(\d+)\b|GH-(\d+)', re.IGNORECASE)

def extract_ticket_keys(text: str) -> List[str]:
    """Extract ticket keys (Jira and GitHub issue refs) from text."""
    if not text:
        return []
    
    jira_matches = JIRA_KEY_PATTERN.findall(text)
    github_matches = GITHUB_ISSUE_PATTERN.findall(text)
    
    keys = []
    for m in jira_matches:
        upper_key = m.upper()
        if upper_key not in keys:
            keys.append(upper_key)
            
    for g1, g2 in github_matches:
        num = g1 or g2
        gh_key = f"#{num}"
        if gh_key not in keys:
            keys.append(gh_key)
            
    return keys

class TicketResolver:
    def resolve_ticket(self, key: str) -> Optional[TicketData]:
        raise NotImplementedError

class MockTicketResolver(TicketResolver):
    def __init__(self, tickets: Optional[Dict[str, TicketData]] = None):
        self.tickets: Dict[str, TicketData] = {}
        if tickets:
            for k, v in tickets.items():
                self.tickets[k.upper()] = v

    def add_ticket(self, ticket: TicketData):
        self.tickets[ticket.key.upper()] = ticket

    def resolve_ticket(self, key: str) -> Optional[TicketData]:
        return self.tickets.get(key.upper())

class DefaultTicketResolver(TicketResolver):
    """Fallback resolver when no remote ticket API is configured."""
    def __init__(self, mock_resolver: Optional[MockTicketResolver] = None):
        self.mock_resolver = mock_resolver or MockTicketResolver()

    def resolve_ticket(self, key: str) -> Optional[TicketData]:
        # Check mock resolver first
        mock_result = self.mock_resolver.resolve_ticket(key)
        if mock_result:
            return mock_result
            
        # Generic synthesized ticket data if API is unconfigured
        if key.startswith("#"):
            return TicketData(
                key=key,
                title=f"GitHub Issue {key}",
                description=f"Automated resolution for issue {key}",
                issue_type="Issue",
                source="github"
            )
        else:
            return TicketData(
                key=key,
                title=f"Ticket {key}",
                description=f"Automated rationale extracted for ticket {key}",
                issue_type="Story",
                source="jira"
            )

def parse_tickets(
    branch_name: str = "",
    pr_title: str = "",
    pr_body: str = "",
    commit_messages: Optional[List[str]] = None,
    resolver: Optional[TicketResolver] = None
) -> List[TicketData]:
    """Search branch name, PR title, body, and commits for tickets and resolve them."""
    if resolver is None:
        resolver = DefaultTicketResolver()
        
    all_text = f"{branch_name}\n{pr_title}\n{pr_body}\n"
    if commit_messages:
        all_text += "\n".join(commit_messages)
        
    keys = extract_ticket_keys(all_text)
    tickets = []
    for k in keys:
        t_data = resolver.resolve_ticket(k)
        if t_data and t_data not in tickets:
            tickets.append(t_data)
            
    return tickets
