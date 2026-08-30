"""Microsoft Agent Framework function middleware boundary."""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from powerfarm.execution_slice import ExecutionSliceError

from .controller import ContinuumFunctionController

EXECUTION_SLICE_KWARG = "powerfarm_execution_slice"


def _slice_from_context(context: Any) -> Mapping[str, Any]:
    kwargs = getattr(context, "kwargs", None)
    if not isinstance(kwargs, Mapping):
        raise ExecutionSliceError("MAF FunctionInvocationContext is missing runtime kwargs")
    value = kwargs.get(EXECUTION_SLICE_KWARG)
    if not isinstance(value, Mapping):
        raise ExecutionSliceError(f"MAF FunctionInvocationContext is missing {EXECUTION_SLICE_KWARG}")
    return value


def make_continuum_middleware(controller: ContinuumFunctionController):
    """Return a real MAF function middleware callable.

    The import is deliberately lazy so contract/unit tests can validate the
    PowerFarm controller in an offline environment. Production and GitHub CI
    install the pinned Agent Framework package and exercise the real types.
    """
    try:
        from agent_framework import function_middleware
    except ImportError as exc:  # pragma: no cover - real runtime exercised in CI
        raise RuntimeError("agent-framework-core is required for the Microsoft Agent Framework Setting") from exc

    @function_middleware
    async def continuum_function_middleware(context: Any, call_next: Any) -> None:
        tool_name = str(getattr(getattr(context, "function", None), "name", ""))
        if not tool_name:
            context.result = {
                "status": "refused", "refused_by": "continuum",
                "code": "POWERFARM_CONTEXT_INVALID", "reason": "MAF function has no stable tool name",
            }
            return
        try:
            execution_slice = _slice_from_context(context)
        except ExecutionSliceError as exc:
            context.result = {
                "status": "refused", "refused_by": "continuum",
                "code": "POWERFARM_CONTEXT_INVALID", "reason": str(exc), "tool": tool_name,
            }
            return

        refusal = await controller.admit(
            tool_name=tool_name,
            tool_args=getattr(context, "arguments", {}),
            execution_slice=execution_slice,
            context=context,
        )
        if refusal is not None:
            context.result = refusal
            return

        runtime_kwargs = dict(getattr(context, "kwargs", {}) or {})
        runtime_kwargs.update(controller.runtime_kwargs(execution_slice))
        context.kwargs = runtime_kwargs
        try:
            await call_next()
        except Exception as exc:
            await controller.close(tool_name=tool_name, execution_slice=execution_slice, context=context, error=exc)
            raise
        else:
            await controller.close(tool_name=tool_name, execution_slice=execution_slice, context=context, result=getattr(context, "result", None))

    return continuum_function_middleware


__all__ = ["EXECUTION_SLICE_KWARG", "make_continuum_middleware"]
