"""Powerfarm Continuum: a sealed, verifiable institutional kernel."""

from .kernel import InstitutionalError, Kernel

__version__ = "0.3.0"
__all__ = ["Kernel", "InstitutionalError", "__version__"]
