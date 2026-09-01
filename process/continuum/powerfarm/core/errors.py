class InstitutionalError(RuntimeError):
    """Raised when an institutional rule refuses an operation.

    Defined here rather than in the kernel so that modules the kernel itself
    imports — institutional identity, for one — can raise the same failure the
    kernel raises, without a circular import. `powerfarm.kernel` re-exports it,
    so every existing `from powerfarm.kernel import InstitutionalError` keeps
    working.
    """


class ContinuumError(RuntimeError):
    """Base error for operational subsystems outside the admission kernel."""


class VerificationError(ContinuumError):
    """Raised when an externally verifiable artifact cannot be trusted."""


class BundleError(ContinuumError):
    """Raised for malformed or conflicting replication bundles."""
