"""PowerFarm Process Setting for Microsoft Agent Framework."""

from .controller import ContinuumFunctionController, DEFAULT_RUNTIME
from .evidence import digest_summary
from .mapping import ActProjection, DottedToolPolicy, MappingError, ToolMapping
from .memory import MEMORY_PROJECTION_FORMAT, make_memory_context_provider, make_memory_projection, render_memory_projection
from .middleware import EXECUTION_SLICE_KWARG, make_continuum_middleware
from .pin import PINNED_MAF_REVISION_REF, PINNED_MAF_VERSION

__version__ = "0.1.0"

__all__ = [
    "__version__", "ContinuumFunctionController", "DEFAULT_RUNTIME",
    "DottedToolPolicy", "ToolMapping", "ActProjection", "MappingError",
    "digest_summary", "EXECUTION_SLICE_KWARG", "make_continuum_middleware",
    "MEMORY_PROJECTION_FORMAT", "make_memory_projection", "render_memory_projection",
    "make_memory_context_provider", "PINNED_MAF_VERSION", "PINNED_MAF_REVISION_REF",
]
