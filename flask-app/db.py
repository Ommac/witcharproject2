import os
from typing import Any, Dict

from pymongo import MongoClient
from pymongo.database import Database
from pymongo.errors import ConnectionFailure


_mongo_client: MongoClient | None = None


def _create_client() -> MongoClient:
    """
    Lazily create a global MongoDB client.

    MongoDB Atlas connection string must be provided via the MONGODB_URI
    environment variable.
    """
    uri = os.environ.get("MONGODB_URI")
    if not uri:
        raise RuntimeError("MONGODB_URI environment variable is not set")

    client = MongoClient(uri)
    # Simple ping to fail fast if the connection is misconfigured
    try:
        client.admin.command("ping")
    except ConnectionFailure as exc:
        raise RuntimeError("Failed to connect to MongoDB") from exc

    print("MongoDB Connected")
    return client


def get_client() -> MongoClient:
    """Return a singleton MongoClient instance."""
    global _mongo_client
    if _mongo_client is None:
        _mongo_client = _create_client()
    return _mongo_client


def get_db() -> Database:
    """
    Return a handle to the primary application database.

    Database name is fixed by requirement: fraud_detection.
    """
    client = get_client()
    return client["fraud_detection"]


def get_collections() -> Dict[str, Any]:
    """
    Convenience helper to access the primary collections used by the app.
    """
    db = get_db()
    return {
        "transactions": db["transactions"],
        "users": db["users"],
        "fraud_logs": db["fraud_logs"],
    }

