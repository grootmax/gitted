import pytest
from gitted.models import PRIntent
from gitted.intent_card import generate_intent_card, parse_intent_card_overrides

def test_generate_intent_card():
    intent = PRIntent(
        reason="PAY-482: Add partial refund support",
        change_type="Feature",
        affected_areas=["Payments", "Refunds"],
        ticket_references=["PAY-482"]
    )
    card = generate_intent_card(intent)
    assert "change_type: Feature" in card
    assert "PAY-482: Add partial refund support" in card
    assert "Context Builder PR Intent Card" in card

def test_parse_intent_card_unmodified():
    intent = PRIntent(
        reason="PAY-482: Add partial refund support",
        change_type="Feature",
        affected_areas=["Payments", "Refunds"],
        ticket_references=["PAY-482"]
    )
    card = generate_intent_card(intent)
    parsed = parse_intent_card_overrides(card, default_intent=intent)
    assert parsed.change_type == "Feature"
    assert parsed.affected_areas == ["Payments", "Refunds"]
    assert not parsed.manual_override

def test_parse_intent_card_modified():
    intent = PRIntent(
        reason="PAY-482: Add partial refund support",
        change_type="Feature",
        affected_areas=["Payments"],
        ticket_references=["PAY-482"]
    )
    card = generate_intent_card(intent)
    
    # Simulate developer editing change_type and affected_areas in the card text
    modified_card = card.replace("change_type: Feature", "change_type: Bugfix")
    modified_card = modified_card.replace("- Payments", "- Payments\n- Refunds")

    parsed = parse_intent_card_overrides(modified_card, default_intent=intent)
    assert parsed.change_type == "Bugfix"
    assert "Payments" in parsed.affected_areas
    assert "Refunds" in parsed.affected_areas
    assert parsed.manual_override
