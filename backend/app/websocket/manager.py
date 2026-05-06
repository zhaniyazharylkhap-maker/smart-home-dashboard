"""Compatibility shim re-exporting canonical websocket manager APIs."""

from services.ws_manager import ConnectionManager, connection_manager

__all__ = ["ConnectionManager", "connection_manager"]
