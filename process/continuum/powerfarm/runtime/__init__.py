"""Runtime boundary contracts. Runtimes report facts; they do not define institutional truth."""

from .envelope import ExecutionEnvelope, validate_execution_envelope
from .receipt import RuntimeReceipt, receipt_to_act

__all__ = ["ExecutionEnvelope", "validate_execution_envelope", "RuntimeReceipt", "receipt_to_act"]
