"""Compatibility re-export for the Process-owned ExecutionSlice contract.

ExecutionSlice is engine-neutral Process semantics. Google ADK consumes it but
must not own or fork its validation and institutional identity derivation.
"""

from powerfarm.execution_slice import *  # noqa: F401,F403
from powerfarm.execution_slice import __all__
