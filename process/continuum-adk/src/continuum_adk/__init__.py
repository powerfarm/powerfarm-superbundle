"""Institutional admission control for Google ADK agents."""

from __future__ import annotations

from .evidence import AllowlistedEvidence, DigestOnlyEvidence, EvidencePolicy
from .execution_slice import (
    EXECUTION_SLICE_CONTRACT_VERSION,
    ExecutionRefs,
    ExecutionSliceError,
    ExecutionSliceFromContext,
    ExecutionSliceResolver,
    execution_refs_from_slice,
    validate_execution_slice,
    verify_execution_slice_seal,
)
from .identity import (
    ActorFromAgent,
    ActorFromUser,
    ActorResolver,
    OfficePerAgent,
    OfficeResolver,
    StaticActor,
    StaticOffice,
)
from .mapping import (
    ActProjection,
    DottedToolPolicy,
    MappingError,
    MappingPolicy,
    ToolMapping,
    kindify,
    subject_token,
)
from .plugin import DEFAULT_RUNTIME, ContinuumPlugin
from .refusal import RefusalRenderer, StructuredRefusal, TerseRefusal

__version__ = "0.3.0"

__all__ = [
    "__version__", "ContinuumPlugin", "DEFAULT_RUNTIME",
    "OfficeResolver", "ActorResolver", "StaticOffice", "OfficePerAgent",
    "StaticActor", "ActorFromUser", "ActorFromAgent",
    "MappingPolicy", "DottedToolPolicy", "ToolMapping", "ActProjection",
    "MappingError", "kindify", "subject_token",
    "EvidencePolicy", "DigestOnlyEvidence", "AllowlistedEvidence",
    "EXECUTION_SLICE_CONTRACT_VERSION", "ExecutionSliceError", "ExecutionSliceResolver",
    "ExecutionSliceFromContext", "ExecutionRefs", "validate_execution_slice",
    "verify_execution_slice_seal", "execution_refs_from_slice",
    "RefusalRenderer", "StructuredRefusal", "TerseRefusal",
]
