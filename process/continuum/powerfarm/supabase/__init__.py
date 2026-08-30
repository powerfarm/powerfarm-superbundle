"""Supabase/Postgres deployment contracts.

Nothing in this package performs network writes. The SQL files are reviewed
migration candidates for a future deployment boundary.
"""

from .contract import migration_files, migration_fingerprint

__all__ = ["migration_files", "migration_fingerprint"]
