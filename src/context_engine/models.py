from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any


@dataclass
class Repository:
    repo_id: str
    name: str  # e.g., "checkout-web", "checkout-api", "payment-service"
    organization: str = "org"


@dataclass
class Commit:
    sha: str
    repo_name: str
    message: str
    author: str
    committed_at: datetime
    html_url: Optional[str] = None
    issue_keys: List[str] = field(default_factory=list)


@dataclass
class PullRequest:
    pr_id: str
    repo_name: str
    number: int
    title: str
    branch: str
    author: str
    state: str  # "open", "closed", "merged"
    created_at: datetime
    merged_at: Optional[datetime] = None
    html_url: Optional[str] = None
    files: List[str] = field(default_factory=list)
    commit_shas: List[str] = field(default_factory=list)
    issue_keys: List[str] = field(default_factory=list)


@dataclass
class Feature:
    feature_id: str
    name: str  # e.g., "Refunds", "Checkout Redesign"
    description: Optional[str] = None


@dataclass
class Ticket:
    key: str  # e.g., "PAY-482"
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    feature_id: Optional[str] = None


# PostgreSQL DDL Schema representation
POSTGRES_SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS repositories (
    repo_id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    organization VARCHAR(255) NOT NULL
);

CREATE TABLE IF NOT EXISTS tickets (
    key VARCHAR(64) PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    feature_id VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS features (
    feature_id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT
);

CREATE TABLE IF NOT EXISTS pull_requests (
    pr_id VARCHAR(255) PRIMARY KEY,
    repo_name VARCHAR(255) NOT NULL,
    number INT NOT NULL,
    title TEXT NOT NULL,
    branch VARCHAR(255) NOT NULL,
    author VARCHAR(255) NOT NULL,
    state VARCHAR(32) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    merged_at TIMESTAMP WITH TIME ZONE,
    html_url TEXT,
    files JSONB
);

CREATE TABLE IF NOT EXISTS commits (
    sha VARCHAR(64) PRIMARY KEY,
    repo_name VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    author VARCHAR(255) NOT NULL,
    committed_at TIMESTAMP WITH TIME ZONE NOT NULL,
    html_url TEXT
);

CREATE TABLE IF NOT EXISTS ticket_pull_requests (
    ticket_key VARCHAR(64) REFERENCES tickets(key) ON DELETE CASCADE,
    pr_id VARCHAR(255) REFERENCES pull_requests(pr_id) ON DELETE CASCADE,
    PRIMARY KEY (ticket_key, pr_id)
);

CREATE TABLE IF NOT EXISTS ticket_commits (
    ticket_key VARCHAR(64) REFERENCES tickets(key) ON DELETE CASCADE,
    sha VARCHAR(64) REFERENCES commits(sha) ON DELETE CASCADE,
    PRIMARY KEY (ticket_key, sha)
);

CREATE TABLE IF NOT EXISTS ticket_features (
    ticket_key VARCHAR(64) REFERENCES tickets(key) ON DELETE CASCADE,
    feature_id VARCHAR(255) REFERENCES features(feature_id) ON DELETE CASCADE,
    PRIMARY KEY (ticket_key, feature_id)
);

CREATE INDEX IF NOT EXISTS idx_ticket_pr_key ON ticket_pull_requests(ticket_key);
CREATE INDEX IF NOT EXISTS idx_ticket_commit_key ON ticket_commits(ticket_key);
CREATE INDEX IF NOT EXISTS idx_pr_repo_name ON pull_requests(repo_name);
"""
