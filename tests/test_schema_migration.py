import os
import json
import tempfile
from pathlib import Path
from contextbuilder.inference.ast_parser import FastASTParser
from gitted.models import PRIntent
from gitted.timeline import append_to_timeline
from gitted.context_builder import ContextBuilder


def test_fast_ast_parser_sql_ddl():
    sql_content = """
    -- Migration 001
    CREATE TABLE users (
        id INT PRIMARY KEY,
        email VARCHAR(255) NOT NULL
    );

    ALTER TABLE users ADD COLUMN created_at TIMESTAMP;
    DROP TABLE IF EXISTS legacy_users;
    INSERT INTO users (id, email) VALUES (1, 'user@example.com');
    """
    schema = FastASTParser.extract_db_schema(content=sql_content, rel_file_path="db/migrations/001_users.sql")
    
    assert "users" in schema["tables"]
    assert "legacy_users" in schema["tables"]
    
    op_types = [op["operation"] for op in schema["ddlOperations"]]
    assert "CREATE" in op_types
    assert "ALTER" in op_types
    assert "DROP" in op_types


def test_fast_ast_parser_alembic_migration():
    alembic_content = """
from alembic import op
import sqlalchemy as sa

def upgrade():
    op.create_table(
        'payments',
        sa.Column('id', sa.Integer, primary_key=True),
        sa.Column('amount', sa.Numeric(10, 2))
    )
    op.add_column('payments', sa.Column('status', sa.String(50)))
    op.drop_table('old_payments')
"""
    schema = FastASTParser.extract_db_schema(content=alembic_content, rel_file_path="migrations/versions/001_payments.py")
    
    assert "payments" in schema["tables"]
    assert "old_payments" in schema["tables"]
    
    ddl_tables = [op["table"] for op in schema["ddlOperations"]]
    assert "payments" in ddl_tables
    assert "old_payments" in ddl_tables


def test_fast_ast_parser_django_migration_and_models():
    django_migration = """
from django.db import migrations, models

class Migration(migrations.Migration):
    operations = [
        migrations.CreateModel(
            name='Order',
            fields=[
                ('id', models.BigAutoField(primary_key=True)),
            ],
        ),
        migrations.AddField(
            model_name='order',
            name='total',
            field=models.DecimalField(max_digits=10, decimal_places=2),
        ),
    ]
"""
    schema = FastASTParser.extract_db_schema(content=django_migration, rel_file_path="orders/migrations/0001_initial.py")
    assert "order" in schema["tables"] or "Order" in schema["tables"]
    assert "Order" in schema["models"]

    orm_model = """
import torch
from django.db import models

class UserProfile(models.Model):
    __tablename__ = 'user_profiles'
    bio = models.TextField()
"""
    model_schema = FastASTParser.extract_db_schema(content=orm_model, rel_file_path="users/models.py")
    assert "UserProfile" in model_schema["models"]
    assert "user_profiles" in model_schema["tables"]


def test_timeline_and_context_builder_schema_lineage():
    with tempfile.TemporaryDirectory() as tmpdir:
        timeline_file = os.path.join(tmpdir, "timeline.json")
        
        intent = PRIntent(
            reason="Add payments table and column",
            change_type="Feature",
            affected_areas=["Payments"],
            db_schema_context={"tables": ["payments"], "models": ["Payment"]},
            db_schema_changes=[
                {"operation": "CREATE", "table": "payments"},
                {"operation": "ALTER", "table": "payments"}
            ]
        )
        
        append_to_timeline(timeline_file, intent, pr_number=42, commit_sha="abc1234")
        
        lineage = ContextBuilder.get_schema_lineage("payments", timeline_path=timeline_file)
        assert len(lineage) == 1
        assert lineage[0]["table"] == "payments"
        assert lineage[0]["pr_number"] == 42
        assert lineage[0]["commit_sha"] == "abc1234"
