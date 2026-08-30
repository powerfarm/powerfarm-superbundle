class ContinuumError(RuntimeError):
    """Base error for operational subsystems outside the admission kernel."""


class VerificationError(ContinuumError):
    """Raised when an externally verifiable artifact cannot be trusted."""


class BundleError(ContinuumError):
    """Raised for malformed or conflicting replication bundles."""
