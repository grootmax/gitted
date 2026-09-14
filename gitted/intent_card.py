import re
import yaml
from typing import Optional, Dict, Any
from .models import PRIntent

INTENT_BLOCK_REGEX = re.compile(
    r'<!--\s*CONTEXTBUILDER_INTENT_START\s*\n(?P<yaml_data>.*?)\n\s*CONTEXTBUILDER_INTENT_END\s*-->',
    re.DOTALL
)

def generate_intent_card(intent: PRIntent) -> str:
    """Generate an editable Markdown preview card containing YAML metadata block and visual summary."""
    yaml_obj = {
        "change_type": intent.change_type,
        "affected_areas": intent.affected_areas,
        "reason": intent.reason,
    }
    if intent.ticket_references:
        yaml_obj["ticket_references"] = intent.ticket_references

    yaml_str = yaml.dump(yaml_obj, sort_keys=False, default_flow_style=False).strip()
    areas_str = ", ".join(intent.affected_areas) if intent.affected_areas else "None"

    card = f"""<!-- CONTEXTBUILDER_INTENT_START
{yaml_str}
CONTEXTBUILDER_INTENT_END -->

### 🤖 Context Builder PR Intent Card
> *Zero mandatory input required. You can merge directly or optionally edit the YAML block above to override metadata.*

- **Change Type:** {intent.change_type}
- **Affected Areas:** {areas_str}
- **Reason:** {intent.reason}
"""
    return card

def parse_intent_card_overrides(card_text: str, default_intent: Optional[PRIntent] = None) -> PRIntent:
    """Parse YAML metadata block from card text and extract overrides if modified."""
    match = INTENT_BLOCK_REGEX.search(card_text)

    if not match:
        if default_intent:
            return default_intent
        return PRIntent(
            reason="Unclassified change updated in codebase.",
            change_type="Unclassified Change",
            affected_areas=["General"],
            ticket_references=[],
            manual_override=False
        )

    yaml_data_raw = match.group("yaml_data").strip()
    if not yaml_data_raw:
        if default_intent:
            return default_intent
        return PRIntent(
            reason="Unclassified change updated in codebase.",
            change_type="Unclassified Change",
            affected_areas=["General"],
            ticket_references=[],
            manual_override=False
        )

    try:
        data = yaml.safe_load(yaml_data_raw) or {}
    except Exception:
        data = {}

    if not isinstance(data, dict):
        data = {}

    card_change_type = str(data.get("change_type", "")).strip() or "Unclassified Change"
    card_reason = str(data.get("reason", "")).strip() or "Unclassified change updated in codebase."

    card_areas = data.get("affected_areas", [])
    if isinstance(card_areas, list):
        parsed_areas = [str(a).strip() for a in card_areas if str(a).strip()]
    elif isinstance(card_areas, str) and card_areas.strip():
        parsed_areas = [a.strip() for a in card_areas.split(",") if a.strip()]
    else:
        parsed_areas = ["General"]

    card_ticket_refs = data.get("ticket_references", [])
    if isinstance(card_ticket_refs, list):
        parsed_ticket_refs = [str(t).strip() for t in card_ticket_refs if str(t).strip()]
    else:
        parsed_ticket_refs = []

    if default_intent:
        is_overridden = False
        if card_change_type != default_intent.change_type:
            is_overridden = True
        if card_reason != default_intent.reason:
            is_overridden = True
        if parsed_areas != default_intent.affected_areas:
            is_overridden = True

        return PRIntent(
            reason=card_reason,
            change_type=card_change_type,
            affected_areas=parsed_areas,
            ticket_references=parsed_ticket_refs or list(default_intent.ticket_references),
            raw_commits=list(default_intent.raw_commits),
            tickets=list(default_intent.tickets),
            manual_override=is_overridden
        )
    else:
        return PRIntent(
            reason=card_reason,
            change_type=card_change_type,
            affected_areas=parsed_areas,
            ticket_references=parsed_ticket_refs,
            manual_override=False
        )
