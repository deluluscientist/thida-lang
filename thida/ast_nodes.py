"""
Thida 1.2 AST node definitions.
All nodes carry an optional `line` field (defaults to 0) for error reporting.
"""
from dataclasses import dataclass, field
from typing import Any, List, Optional


# ── Literals & expressions ───────────────────────────────────────────────────

@dataclass
class StringLit:
    value: str
    line: int = 0

@dataclass
class NumberLit:
    value: float
    line: int = 0

@dataclass
class BoolLit:
    value: bool
    line: int = 0

@dataclass
class Ident:
    name: str
    line: int = 0

@dataclass
class BinOp:
    op: str
    left: Any
    right: Any
    line: int = 0


# ── Statements ────────────────────────────────────────────────────────────────

@dataclass
class PrintStmt:
    expr: Any
    line: int = 0

@dataclass
class LoadStmt:
    path: Any
    file_type: str
    sheet: Optional[str]
    safe_copy: bool
    line: int = 0

@dataclass
class AssignStmt:
    value: Any
    name: str
    line: int = 0

@dataclass
class SaveStmt:
    expr: Any
    name: str
    line: int = 0

@dataclass
class ShowVarStmt:
    name: str
    line: int = 0

@dataclass
class ShowHeaderStmt:
    dataset: Any
    line: int = 0

@dataclass
class ShowSummaryStmt:
    dataset: Any
    line: int = 0

@dataclass
class ShowHeadStmt:
    dataset: Any
    n: int
    line: int = 0

@dataclass
class ShowTypesStmt:
    dataset: Any
    line: int = 0

@dataclass
class StatStmt:
    func: str
    dataset: Any
    column: str
    line: int = 0

@dataclass
class FreqStmt:
    dataset: Any
    column: str
    line: int = 0

@dataclass
class GroupByStmt:
    dataset: Any
    group_col: str
    agg_func: str
    agg_col: str
    line: int = 0

@dataclass
class MissingCountStmt:
    dataset: Any
    column: str
    line: int = 0

@dataclass
class ImputeStmt:
    dataset: Any
    column: str
    value: Any
    line: int = 0

@dataclass
class DropColStmt:
    dataset: Any
    column: str
    line: int = 0

@dataclass
class NewColStmt:
    dataset: Any
    column: str
    expr_str: str
    line: int = 0

@dataclass
class FilterStmt:
    dataset: Any
    column: str
    op: str
    value: Any
    line: int = 0

@dataclass
class SortStmt:
    dataset: Any
    column: str
    ascending: bool
    line: int = 0

@dataclass
class RenameStmt:
    dataset: Any
    old_name: str
    new_name: str
    line: int = 0

@dataclass
class DropMissingStmt:
    dataset: Any
    line: int = 0

@dataclass
class ModelDefStmt:
    dataset: Any
    target: str
    features: List[str]
    model_var: str
    line: int = 0

@dataclass
class TrainStmt:
    model_name: str
    dataset: Any
    line: int = 0

@dataclass
class PredictStmt:
    model_name: str
    new_data: Any
    line: int = 0

@dataclass
class ScatterPlotStmt:
    dataset: Any
    x_col: str
    y_col: str
    line: int = 0

@dataclass
class HistogramStmt:
    dataset: Any
    group_col: str
    line: int = 0

@dataclass
class BarChartStmt:
    dataset: Any
    x_col: str
    y_col: str
    line: int = 0

@dataclass
class LineChartStmt:
    dataset: Any
    x_col: str
    y_col: str
    line: int = 0

@dataclass
class BoxPlotStmt:
    dataset: Any
    col: str
    group_col: str   # "" means no grouping
    line: int = 0

@dataclass
class ReportStmt:
    dataset: Any
    results: Any
    line: int = 0

@dataclass
class IfStmt:
    condition: Any
    then_branch: Any
    else_branch: Any
    line: int = 0

@dataclass
class Program:
    stmts: List[Any]
    line: int = 0
