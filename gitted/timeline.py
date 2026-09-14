import json
import yaml
from pathlib import Path
from datetime import datetime, timezone
from typing import Union, Optional, Dict, Any, List
from .models import PRIntent

def append_to_timeline(
    timeline_path: Union[str, Path],
    intent: PRIntent,
    pr_number: Optional[int] = None,
    commit_sha: Optional[str] = None
) -> Dict[str, Any]:
    """Append synthesized PR intent metadata to the Feature Timeline file (.contextbuilder/timeline.json)."""
    path = Path(timeline_path)
    path.parent.mkdir(parents=True, exist_ok=True)

    timestamp = datetime.now(timezone.utc).isoformat()
    entry = {
        "timestamp": timestamp,
        "pr_number": pr_number,
        "commit_sha": commit_sha,
        "change_type": intent.change_type,
        "affected_areas": intent.affected_areas,
        "reason": intent.reason,
        "ticket_references": intent.ticket_references,
        "manual_override": intent.manual_override,
    }

    db_schema_changes = getattr(intent, "db_schema_changes", None) or []
    db_schema_context = getattr(intent, "db_schema_context", None) or {}
    if db_schema_changes:
        entry["db_schema_changes"] = db_schema_changes
    if db_schema_context:
        entry["db_schema_context"] = db_schema_context

    timeline_data: Dict[str, Any] = {"entries": []}

    if path.exists():
        try:
            if path.suffix in [".yml", ".yaml"]:
                with open(path, "r", encoding="utf-8") as f:
                    timeline_data = yaml.safe_load(f) or {"entries": []}
            else:
                with open(path, "r", encoding="utf-8") as f:
                    timeline_data = json.load(f)
        except Exception:
            timeline_data = {"entries": []}

    if not isinstance(timeline_data, dict) or "entries" not in timeline_data:
        timeline_data = {"entries": []}

    if not isinstance(timeline_data["entries"], list):
        timeline_data["entries"] = []

    timeline_data["entries"].append(entry)

    try:
        if path.suffix in [".yml", ".yaml"]:
            with open(path, "w", encoding="utf-8") as f:
                yaml.dump(timeline_data, f, sort_keys=False)
        else:
            with open(path, "w", encoding="utf-8") as f:
                json.dump(timeline_data, f, indent=2)
    except Exception as e:
        # Non-blocking background behavior
        pass

    return entry
