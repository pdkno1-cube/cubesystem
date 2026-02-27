"""Pipeline orchestration engine powered by LangGraph.

Exports :class:`PipelineEngine` as the primary entry point for
pipeline compilation, execution, and lifecycle management.
"""

from .engine import PipelineEngine

__all__ = ["PipelineEngine"]
