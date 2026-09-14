from typing import Dict, Any
from .timeline import FeatureTimelineGenerator


class WebAppService:
    """
    Web App Service handling requests for Cross-Repository Feature Timelines
    and GitHub App PR Context Views.
    """

    def __init__(self, timeline_generator: FeatureTimelineGenerator = None):
        self.generator = timeline_generator or FeatureTimelineGenerator()

    def handle_ticket_timeline_request(self, ticket_key: str) -> Dict[str, Any]:
        """
        API Endpoint: GET /api/timeline/ticket/:ticket_key
        """
        return {
            "status": "success",
            "data": self.generator.get_ticket_timeline(ticket_key)
        }

    def handle_feature_timeline_request(self, feature_id: str) -> Dict[str, Any]:
        """
        API Endpoint: GET /api/timeline/feature/:feature_id
        """
        return {
            "status": "success",
            "data": self.generator.get_feature_timeline(feature_id)
        }

    def handle_pr_context_block_request(self, repo: str, pr_number: int, ticket_key: str) -> Dict[str, Any]:
        """
        API Endpoint: GET /api/github/pr-context
        """
        block_markdown = self.generator.build_github_app_pr_context_block(
            current_repo=repo,
            current_pr_number=pr_number,
            ticket_key=ticket_key,
        )
        return {
            "status": "success",
            "repository": repo,
            "pr_number": pr_number,
            "ticket_key": ticket_key,
            "context_block_markdown": block_markdown,
        }
