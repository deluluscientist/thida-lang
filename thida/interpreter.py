"""
Thida 1.2 Interpreter — executes AST nodes using pandas + sklearn + matplotlib.
"""
import copy
import io
import os
import sys
from typing import Any, Dict

# Force non-interactive Agg backend before any pyplot import
import matplotlib
matplotlib.use("Agg")

import pandas as pd
import numpy as np

from .ast_nodes import *
from .lexer import Lexer
from .parser import Parser


class RuntimeError_(Exception):
    def __init__(self, msg, line=0):
        super().__init__(f"[Runtime] Line {line}: {msg}")


BUILTIN_DATASETS_DIR = os.path.join(os.path.dirname(__file__), "..", "datasets")


class Interpreter:
    def __init__(self):
        self.env: Dict[str, Any] = {}
        self._trained_models: Dict[str, Any] = {}
        self._datasets_dir = BUILTIN_DATASETS_DIR
        self._upload_dir: str = ""
        # Charts produced during a run: list of {"title", "b64", "description"}
        self.charts: list = []
        # Tables loaded during a run: dict of name -> DataFrame
        self.tables: Dict[str, Any] = {}

    # ── public entry ─────────────────────────────────────────────────────────

    def run(self, source: str):
        lexer = Lexer(source)
        tokens = lexer.tokenize()
        parser = Parser(tokens)
        program = parser.parse()
        for stmt in program.stmts:
            if stmt is not None:
                self._exec(stmt)

    # ── executor dispatcher ───────────────────────────────────────────────────

    def _exec(self, node):
        method = f"_exec_{type(node).__name__}"
        fn = getattr(self, method, None)
        if fn is None:
            raise RuntimeError_(f"No executor for {type(node).__name__}", getattr(node, "line", 0))
        return fn(node)

    def _eval(self, node) -> Any:
        if node is None:
            return None
        # Plain Python primitives passed through directly
        if isinstance(node, str):
            return node
        if isinstance(node, (int, float)):
            return node
        if isinstance(node, bool):
            return node
        if isinstance(node, StringLit):
            return node.value
        if isinstance(node, NumberLit):
            return node.value
        if isinstance(node, BoolLit):
            return node.value
        if isinstance(node, Ident):
            name = node.name
            if name in self.env:
                return self.env[name]
            # Try as string literal fallback
            return name
        if isinstance(node, BinOp):
            l = self._eval(node.left)
            r = self._eval(node.right)
            ops = {
                "+": lambda a, b: a + b,
                "-": lambda a, b: a - b,
                "*": lambda a, b: a * b,
                "/": lambda a, b: a / b,
                "==": lambda a, b: a == b,
                "!=": lambda a, b: a != b,
                "<":  lambda a, b: a < b,
                ">":  lambda a, b: a > b,
                "<=": lambda a, b: a <= b,
                ">=": lambda a, b: a >= b,
            }
            return ops[node.op](l, r)
        raise RuntimeError_(f"Cannot evaluate {type(node).__name__}")

    def _resolve_df(self, node, line=0) -> pd.DataFrame:
        val = self._eval(node)
        if isinstance(val, pd.DataFrame):
            return val
        if isinstance(val, str):
            if val in self.env and isinstance(self.env[val], pd.DataFrame):
                return self.env[val]
            raise RuntimeError_(f"Variable '{val}' is not a dataset", line)
        raise RuntimeError_(f"Expected dataset, got {type(val).__name__}", line)

    # ── statement executors ───────────────────────────────────────────────────

    def _exec_PrintStmt(self, node: PrintStmt):
        val = self._eval(node.expr)
        print(val)

    def _exec_LoadStmt(self, node: LoadStmt):
        path = self._eval(node.path)
        ft = node.file_type.lower()
        # Resolve bare names — check uploads dir first, then built-in dir
        resolved = path
        if not os.path.isabs(path) and not os.path.exists(path):
            search_dirs = []
            if hasattr(self, "_upload_dir") and self._upload_dir:
                search_dirs.append(self._upload_dir)
            search_dirs.append(self._datasets_dir)
            for d in search_dirs:
                candidate = os.path.join(d, path)
                if not os.path.exists(candidate):
                    candidate = candidate if candidate.endswith((".csv", ".xlsx")) else candidate + ".csv"
                if os.path.exists(candidate):
                    resolved = candidate
                    break
        try:
            if ft == "excel":
                df = pd.read_excel(resolved, sheet_name=node.sheet or 0)
            elif ft == "csv":
                df = pd.read_csv(resolved)
            else:
                raise RuntimeError_(f"Unknown file type: {ft}", node.line)
        except FileNotFoundError:
            raise RuntimeError_(f"File not found: {path}", node.line)
        path = resolved

        if node.safe_copy:
            df = df.copy()

        # Auto-store under filename stem
        stem = os.path.splitext(os.path.basename(path))[0]
        self.env[stem] = df
        self.tables[stem] = df
        print(f"✓ Loaded '{path}' → dataset '{stem}' ({df.shape[0]} rows × {df.shape[1]} cols)")

    def _exec_AssignStmt(self, node: AssignStmt):
        val = self._eval(node.value)
        self.env[node.name] = val
        print(f"✓ '{node.name}' = {val!r}")

    def _exec_SaveStmt(self, node: SaveStmt):
        val = self._eval(node.expr)
        self.env[node.name] = val
        if isinstance(val, pd.DataFrame):
            print(f"✓ Saved dataset '{node.name}' ({val.shape[0]} rows × {val.shape[1]} cols)")
        else:
            print(f"✓ Saved '{node.name}' = {val!r}")

    def _exec_ShowVarStmt(self, node: ShowVarStmt):
        name = node.name
        if name not in self.env:
            # Treat as a plain string literal print
            print(name)
            return
        val = self.env[name]
        if isinstance(val, pd.DataFrame):
            print(val.to_string())
        else:
            print(val)

    def _exec_ShowHeaderStmt(self, node: ShowHeaderStmt):
        df = self._resolve_df(node.dataset, node.line)
        print("Columns:", list(df.columns))

    def _exec_ShowSummaryStmt(self, node: ShowSummaryStmt):
        df = self._resolve_df(node.dataset, node.line)
        print(df.describe(include="all"))

    def _exec_ShowHeadStmt(self, node: ShowHeadStmt):
        df = self._resolve_df(node.dataset, node.line)
        print(df.head(node.n).to_string())

    def _exec_ShowTypesStmt(self, node: ShowTypesStmt):
        df = self._resolve_df(node.dataset, node.line)
        print(df.dtypes)

    def _exec_StatStmt(self, node: StatStmt):
        df = self._resolve_df(node.dataset, node.line)
        col = node.column
        if col not in df.columns:
            raise RuntimeError_(f"Column '{col}' not found", node.line)
        s = df[col]
        funcs = {
            "mean": lambda x: x.mean(),
            "max":  lambda x: x.max(),
            "min":  lambda x: x.min(),
            "mode": lambda x: x.mode()[0] if len(x.mode()) > 0 else None,
        }
        result = funcs[node.func](s)
        print(f"{node.func.upper()} of '{col}': {result}")

    def _exec_FreqStmt(self, node: FreqStmt):
        df = self._resolve_df(node.dataset, node.line)
        col = node.column
        if col not in df.columns:
            raise RuntimeError_(f"Column '{col}' not found", node.line)
        print(df[col].value_counts().to_string())

    def _exec_GroupByStmt(self, node: GroupByStmt):
        df = self._resolve_df(node.dataset, node.line)
        func_map = {"mean": "mean", "sum": "sum", "count": "count",
                    "max": "max", "min": "min", "median": "median"}
        fn = func_map.get(node.agg_func, "mean")
        result = df.groupby(node.group_col)[node.agg_col].agg(fn)
        print(result.to_string())

    def _exec_MissingCountStmt(self, node: MissingCountStmt):
        df = self._resolve_df(node.dataset, node.line)
        if node.column:
            print(f"Missing in '{node.column}':", df[node.column].isna().sum())
        else:
            missing = df.isna().sum()
            print(missing[missing > 0].to_string() or "No missing values found.")

    def _exec_ImputeStmt(self, node: ImputeStmt):
        df = self._resolve_df(node.dataset, node.line)
        val_raw = self._eval(node.value)
        ds_name = self._get_ds_name(node.dataset)
        # Special fill strategies
        if val_raw == "mean":
            df_new = df.fillna(df.mean(numeric_only=True))
        elif val_raw == "median":
            df_new = df.fillna(df.median(numeric_only=True))
        elif val_raw == "mode":
            df_new = df.fillna(df.mode().iloc[0])
        else:
            df_new = df.fillna(val_raw)
        if ds_name:
            self.env[ds_name] = df_new
        print(f"✓ Missing values filled with '{val_raw}'")

    def _exec_DropColStmt(self, node: DropColStmt):
        df = self._resolve_df(node.dataset, node.line)
        if node.column not in df.columns:
            raise RuntimeError_(f"Column '{node.column}' not found", node.line)
        df_new = df.drop(columns=[node.column])
        ds_name = self._get_ds_name(node.dataset)
        if ds_name:
            self.env[ds_name] = df_new
        print(f"✓ Dropped column '{node.column}'")

    def _exec_NewColStmt(self, node: NewColStmt):
        df = self._resolve_df(node.dataset, node.line)
        ds_name = self._get_ds_name(node.dataset)
        # Evaluate expression using column names as variables
        local_vars = {c: df[c] for c in df.columns}
        try:
            result = eval(node.expr_str, {"__builtins__": {}}, local_vars)
        except Exception as e:
            raise RuntimeError_(f"Error in column expression: {e}", node.line)
        df_new = df.copy()
        df_new[node.column] = result
        if ds_name:
            self.env[ds_name] = df_new
        print(f"✓ Created column '{node.column}'")

    def _exec_FilterStmt(self, node: FilterStmt):
        df = self._resolve_df(node.dataset, node.line)
        val = self._eval(node.value)
        col = node.column
        if col not in df.columns:
            raise RuntimeError_(f"Column '{col}' not found", node.line)
        ops = {
            "==": df[col] == val,
            "!=": df[col] != val,
            "<":  df[col] < val,
            ">":  df[col] > val,
            "<=": df[col] <= val,
            ">=": df[col] >= val,
        }
        mask = ops.get(node.op)
        if mask is None:
            raise RuntimeError_(f"Unknown filter operator: {node.op}", node.line)
        result = df[mask]
        ds_name = self._get_ds_name(node.dataset)
        if ds_name:
            self.env[ds_name] = result
        print(f"✓ Filtered: {len(result)} rows match '{col}' {node.op} {val!r}")

    def _exec_SortStmt(self, node: SortStmt):
        df = self._resolve_df(node.dataset, node.line)
        if node.column not in df.columns:
            raise RuntimeError_(f"Column '{node.column}' not found", node.line)
        df_sorted = df.sort_values(by=node.column, ascending=node.ascending)
        ds_name = self._get_ds_name(node.dataset)
        if ds_name:
            self.env[ds_name] = df_sorted
        order = "ascending" if node.ascending else "descending"
        print(f"✓ Sorted by '{node.column}' ({order})")
        print(df_sorted.head(10).to_string())

    def _exec_RenameStmt(self, node: RenameStmt):
        df = self._resolve_df(node.dataset, node.line)
        if node.old_name not in df.columns:
            raise RuntimeError_(f"Column '{node.old_name}' not found", node.line)
        df_new = df.rename(columns={node.old_name: node.new_name})
        ds_name = self._get_ds_name(node.dataset)
        if ds_name:
            self.env[ds_name] = df_new
        print(f"✓ Renamed '{node.old_name}' → '{node.new_name}'")

    def _exec_DropMissingStmt(self, node: DropMissingStmt):
        df = self._resolve_df(node.dataset, node.line)
        before = len(df)
        df_new = df.dropna()
        after = len(df_new)
        ds_name = self._get_ds_name(node.dataset)
        if ds_name:
            self.env[ds_name] = df_new
        print(f"✓ Dropped {before - after} rows with missing values ({after} remaining)")

    def _exec_ModelDefStmt(self, node: ModelDefStmt):
        df = self._resolve_df(node.dataset, node.line)
        # Store model spec; training happens at TrainStmt
        self.env[node.model_var] = {
            "_type": "linear_model_spec",
            "target": node.target,
            "features": node.features,
            "dataset": df,
        }
        print(f"✓ Model '{node.model_var}' defined: {node.target} ~ {' + '.join(node.features)}")

    def _exec_TrainStmt(self, node: TrainStmt):
        try:
            from sklearn.linear_model import LinearRegression
            from sklearn.metrics import r2_score, mean_squared_error
        except ImportError:
            raise RuntimeError_("scikit-learn is required for model training. Install it with: pip install scikit-learn", node.line)

        spec = self.env.get(node.model_name)
        if not spec or not isinstance(spec, dict) or spec.get("_type") != "linear_model_spec":
            raise RuntimeError_(f"'{node.model_name}' is not a defined model", node.line)

        df = self._resolve_df(node.dataset if isinstance(node.dataset, str) else Ident(name=str(node.dataset)), node.line)
        target = spec["target"]
        features = spec["features"]

        missing_cols = [c for c in features + [target] if c not in df.columns]
        if missing_cols:
            raise RuntimeError_(f"Columns not found: {missing_cols}", node.line)

        X = df[features].dropna()
        y = df.loc[X.index, target]

        model = LinearRegression()
        model.fit(X, y)
        y_pred = model.predict(X)
        r2 = r2_score(y, y_pred)
        rmse = np.sqrt(mean_squared_error(y, y_pred))

        self._trained_models[node.model_name] = {
            "model": model,
            "features": features,
            "target": target,
            "r2": r2,
            "rmse": rmse,
        }
        print(f"✓ Model '{node.model_name}' trained")
        print(f"  R²   = {r2:.4f}")
        print(f"  RMSE = {rmse:.4f}")
        coef_info = dict(zip(features, model.coef_))
        print(f"  Coefficients: {coef_info}")
        print(f"  Intercept: {model.intercept_:.4f}")

    def _exec_PredictStmt(self, node: PredictStmt):
        trained = self._trained_models.get(node.model_name)
        if not trained:
            raise RuntimeError_(f"Model '{node.model_name}' has not been trained", node.line)

        new_data = self.env.get(node.new_data) if isinstance(node.new_data, str) else self._eval(node.new_data)
        if not isinstance(new_data, pd.DataFrame):
            raise RuntimeError_(f"'{node.new_data}' is not a dataset", node.line)

        features = trained["features"]
        X_new = new_data[features]
        predictions = trained["model"].predict(X_new)
        result = new_data.copy()
        result[f"predicted_{trained['target']}"] = predictions
        self.env["predictions"] = result
        print(f"✓ Predictions stored in 'predictions' dataset")
        print(result[[f"predicted_{trained['target']}"]].to_string())

    def _fig_to_b64(self, fig) -> str:
        import base64
        buf = io.BytesIO()
        fig.savefig(buf, format="png", dpi=150, bbox_inches="tight")
        buf.seek(0)
        return base64.b64encode(buf.read()).decode("utf-8")

    def _describe_scatter(self, df, x_col: str, y_col: str) -> str:
        corr = df[[x_col, y_col]].dropna().corr().iloc[0, 1]
        direction = "positive" if corr > 0 else "negative"
        strength = "strong" if abs(corr) > 0.7 else ("moderate" if abs(corr) > 0.4 else "weak")
        return (
            f"Scatter plot of {x_col} vs {y_col}. "
            f"Pearson correlation: r = {corr:.3f} ({strength} {direction} relationship). "
            f"X range: {df[x_col].min():.2f} – {df[x_col].max():.2f}. "
            f"Y range: {df[y_col].min():.2f} – {df[y_col].max():.2f}."
        )

    def _describe_histogram(self, df, col: str) -> str:
        s = df[col].dropna()
        skew = s.skew()
        skew_label = "right-skewed (positively skewed)" if skew > 0.5 else (
                     "left-skewed (negatively skewed)" if skew < -0.5 else "approximately symmetric")
        return (
            f"Histogram of {col}. "
            f"Mean: {s.mean():.2f}, Median: {s.median():.2f}, Std Dev: {s.std():.2f}. "
            f"Range: {s.min():.2f} – {s.max():.2f}. "
            f"Distribution is {skew_label} (skewness = {skew:.2f})."
        )

    def _exec_ScatterPlotStmt(self, node: ScatterPlotStmt):
        try:
            import matplotlib

            import matplotlib.pyplot as plt
        except ImportError:
            raise RuntimeError_("matplotlib required. Install: pip install matplotlib", node.line)

        df = self._resolve_df(node.dataset, node.line)
        if node.x_col not in df.columns:
            raise RuntimeError_(f"Column '{node.x_col}' not found", node.line)
        if node.y_col not in df.columns:
            raise RuntimeError_(f"Column '{node.y_col}' not found", node.line)

        fig, ax = plt.subplots(figsize=(7, 5))
        ax.scatter(df[node.x_col], df[node.y_col], alpha=0.7,
                   color="#60a5fa", edgecolors="#1e40af", linewidths=0.6, s=60)
        ax.set_xlabel(node.x_col, fontsize=11)
        ax.set_ylabel(node.y_col, fontsize=11)
        ax.set_title(f"Scatter Plot: {node.x_col} vs {node.y_col}", fontsize=13, fontweight="bold")
        ax.grid(True, linestyle="--", alpha=0.4)
        fig.tight_layout()

        b64  = self._fig_to_b64(fig)
        desc = self._describe_scatter(df, node.x_col, node.y_col)
        self.charts.append({"title": f"Scatter: {node.x_col} vs {node.y_col}",
                             "b64": b64, "description": desc})
        plt.close(fig)
        print(f"✓ Scatter plot: {node.x_col} vs {node.y_col}")

    def _exec_HistogramStmt(self, node: HistogramStmt):
        try:
            import matplotlib

            import matplotlib.pyplot as plt
        except ImportError:
            raise RuntimeError_("matplotlib required. Install: pip install matplotlib", node.line)

        df = self._resolve_df(node.dataset, node.line)
        col = node.group_col
        if col not in df.columns:
            raise RuntimeError_(f"Column '{col}' not found", node.line)

        fig, ax = plt.subplots(figsize=(7, 5))
        ax.hist(df[col].dropna(), bins=15, color="#4ade80", edgecolor="#166534", linewidth=0.6)
        ax.set_xlabel(col, fontsize=11)
        ax.set_ylabel("Frequency", fontsize=11)
        ax.set_title(f"Histogram: {col}", fontsize=13, fontweight="bold")
        ax.grid(True, axis="y", linestyle="--", alpha=0.4)
        fig.tight_layout()

        b64  = self._fig_to_b64(fig)
        desc = self._describe_histogram(df, col)
        self.charts.append({"title": f"Histogram: {col}",
                             "b64": b64, "description": desc})
        plt.close(fig)
        print(f"✓ Histogram: {col}")

    def _exec_BarChartStmt(self, node):
        try:
            import matplotlib

            import matplotlib.pyplot as plt
        except ImportError:
            raise RuntimeError_("matplotlib required", node.line)

        df = self._resolve_df(node.dataset, node.line)
        for c in (node.x_col, node.y_col):
            if c not in df.columns:
                raise RuntimeError_(f"Column '{c}' not found", node.line)

        grouped = df.groupby(node.x_col)[node.y_col].mean().sort_values(ascending=False)
        colors = plt.cm.Blues_r(np.linspace(0.3, 0.85, len(grouped)))

        fig, ax = plt.subplots(figsize=(max(7, len(grouped) * 0.7), 5))
        bars = ax.bar(grouped.index.astype(str), grouped.values, color=colors, edgecolor="#1e3a5f", linewidth=0.6)
        ax.set_xlabel(node.x_col, fontsize=11)
        ax.set_ylabel(f"Mean {node.y_col}", fontsize=11)
        ax.set_title(f"Bar Chart: {node.y_col} by {node.x_col}", fontsize=13, fontweight="bold")
        ax.tick_params(axis="x", rotation=30)
        ax.grid(True, axis="y", linestyle="--", alpha=0.4)
        for bar, val in zip(bars, grouped.values):
            ax.text(bar.get_x() + bar.get_width() / 2, bar.get_height() * 1.01,
                    f"{val:,.0f}", ha="center", va="bottom", fontsize=8)
        fig.tight_layout()

        b64 = self._fig_to_b64(fig)
        top = grouped.idxmax()
        desc = (f"Bar chart of mean {node.y_col} grouped by {node.x_col}. "
                f"{len(grouped)} categories. Highest: {top} ({grouped.max():,.2f}), "
                f"Lowest: {grouped.idxmin()} ({grouped.min():,.2f}).")
        self.charts.append({"title": f"Bar: {node.y_col} by {node.x_col}", "b64": b64, "description": desc})
        plt.close(fig)
        print(f"✓ Bar chart: {node.y_col} by {node.x_col}")

    def _exec_LineChartStmt(self, node):
        try:
            import matplotlib

            import matplotlib.pyplot as plt
        except ImportError:
            raise RuntimeError_("matplotlib required", node.line)

        df = self._resolve_df(node.dataset, node.line)
        for c in (node.x_col, node.y_col):
            if c not in df.columns:
                raise RuntimeError_(f"Column '{c}' not found", node.line)

        fig, ax = plt.subplots(figsize=(8, 5))
        ax.plot(df[node.x_col].astype(str), df[node.y_col].values,
                color="#f7c948", linewidth=2, marker="o", markersize=5,
                markerfacecolor="#e07b39", markeredgewidth=0.5)
        ax.set_xlabel(node.x_col, fontsize=11)
        ax.set_ylabel(node.y_col, fontsize=11)
        ax.set_title(f"Line Chart: {node.y_col} over {node.x_col}", fontsize=13, fontweight="bold")
        ax.tick_params(axis="x", rotation=30)
        ax.grid(True, linestyle="--", alpha=0.4)
        fig.tight_layout()

        b64 = self._fig_to_b64(fig)
        s = df[node.y_col].dropna()
        trend = "upward" if s.iloc[-1] > s.iloc[0] else "downward"
        desc = (f"Line chart of {node.y_col} over {node.x_col}. "
                f"Overall trend: {trend}. "
                f"Min: {s.min():.2f}, Max: {s.max():.2f}, Mean: {s.mean():.2f}.")
        self.charts.append({"title": f"Line: {node.y_col} over {node.x_col}", "b64": b64, "description": desc})
        plt.close(fig)
        print(f"✓ Line chart: {node.y_col} over {node.x_col}")

    def _exec_BoxPlotStmt(self, node):
        try:
            import matplotlib

            import matplotlib.pyplot as plt
        except ImportError:
            raise RuntimeError_("matplotlib required", node.line)

        df = self._resolve_df(node.dataset, node.line)
        if node.col not in df.columns:
            raise RuntimeError_(f"Column '{node.col}' not found", node.line)

        fig, ax = plt.subplots(figsize=(7, 5))
        if node.group_col and node.group_col in df.columns:
            groups = [grp[node.col].dropna().values
                      for _, grp in df.groupby(node.group_col)]
            labels = [str(k) for k in df[node.group_col].unique()]
            bp = ax.boxplot(groups, labels=labels, patch_artist=True,
                            medianprops={"color": "#f7c948", "linewidth": 2})
            colors = plt.cm.Pastel1(np.linspace(0, 1, len(groups)))
            for patch, color in zip(bp["boxes"], colors):
                patch.set_facecolor(color)
            ax.set_xlabel(node.group_col, fontsize=11)
            title = f"Box Plot: {node.col} by {node.group_col}"
            desc = f"Box plot of {node.col} grouped by {node.group_col}."
        else:
            bp = ax.boxplot(df[node.col].dropna().values, patch_artist=True,
                            medianprops={"color": "#f7c948", "linewidth": 2})
            bp["boxes"][0].set_facecolor("#60a5fa")
            title = f"Box Plot: {node.col}"
            q1 = df[node.col].quantile(0.25)
            q3 = df[node.col].quantile(0.75)
            desc = (f"Box plot of {node.col}. "
                    f"Median: {df[node.col].median():.2f}, "
                    f"IQR: {q1:.2f}–{q3:.2f}, "
                    f"Range: {df[node.col].min():.2f}–{df[node.col].max():.2f}.")

        ax.set_ylabel(node.col, fontsize=11)
        ax.set_title(title, fontsize=13, fontweight="bold")
        ax.grid(True, axis="y", linestyle="--", alpha=0.4)
        fig.tight_layout()

        b64 = self._fig_to_b64(fig)
        self.charts.append({"title": title, "b64": b64, "description": desc})
        plt.close(fig)
        print(f"✓ Box plot: {node.col}")

    def _exec_ReportStmt(self, node: ReportStmt):
        try:
            from reportlab.lib.pagesizes import A4
            from reportlab.platypus import SimpleDocTemplate, Paragraph, Table, TableStyle, Spacer
            from reportlab.lib.styles import getSampleStyleSheet
            from reportlab.lib import colors
        except ImportError:
            raise RuntimeError_("reportlab required for PDF reports. Install: pip install reportlab", node.line)

        df = self._resolve_df(node.dataset, node.line)
        out_path = "report.pdf"
        doc = SimpleDocTemplate(out_path, pagesize=A4)
        styles = getSampleStyleSheet()
        elements = []

        elements.append(Paragraph("Thida 1.2 — Analysis Report", styles["Title"]))
        elements.append(Spacer(1, 12))

        # Summary stats
        elements.append(Paragraph("Dataset Summary", styles["Heading2"]))
        desc = df.describe(include="all").reset_index()
        data = [list(desc.columns)] + desc.values.tolist()
        data = [[str(c) for c in row] for row in data]
        t = Table(data)
        t.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.grey),
            ("TEXTCOLOR",  (0, 0), (-1, 0), colors.whitesmoke),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.black),
            ("FONTSIZE", (0, 0), (-1, -1), 7),
        ]))
        elements.append(t)
        doc.build(elements)
        print(f"✓ PDF report saved to '{out_path}'")

    def _exec_IfStmt(self, node: IfStmt):
        cond = self._eval(node.condition)
        if cond:
            if node.then_branch:
                self._exec(node.then_branch)
        else:
            if node.else_branch:
                self._exec(node.else_branch)

    # ── helpers ───────────────────────────────────────────────────────────────

    def _get_ds_name(self, node) -> str:
        """Return the environment key name for a dataset node."""
        if isinstance(node, StringLit):
            return node.value
        if isinstance(node, Ident):
            return node.name
        if isinstance(node, str):
            return node
        return ""
