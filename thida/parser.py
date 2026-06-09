"""
Thida 1.2 Parser — converts token stream to AST.

Grammar is statement-per-line; each line ends with a Myanmar verb suffix.
"""
from typing import List, Optional, Any
from .lexer import Token, TT, Lexer
from .ast_nodes import *


class ParseError(Exception):
    def __init__(self, msg, line):
        super().__init__(f"[Parser] Line {line}: {msg}")


class Parser:
    def __init__(self, tokens: List[Token]):
        self.tokens = [t for t in tokens if t.type != TT.NEWLINE or True]  # keep newlines for stmt sep
        self.pos = 0

    # ── helpers ───────────────────────────────────────────────────────────────

    def peek(self, offset=0) -> Token:
        idx = self.pos + offset
        return self.tokens[idx] if idx < len(self.tokens) else self.tokens[-1]

    def advance(self) -> Token:
        t = self.tokens[self.pos]
        if self.pos < len(self.tokens) - 1:
            self.pos += 1
        return t

    def check(self, *types) -> bool:
        return self.peek().type in types

    def check_val(self, *values) -> bool:
        return self.peek().value in values

    def match(self, *types) -> Optional[Token]:
        if self.check(*types):
            return self.advance()
        return None

    def expect(self, t_type, err=None) -> Token:
        if self.peek().type == t_type:
            return self.advance()
        raise ParseError(err or f"Expected {t_type.name}, got {self.peek()!r}", self.peek().line)

    def expect_val(self, *values) -> Token:
        if self.peek().value in values:
            return self.advance()
        raise ParseError(f"Expected one of {values!r}, got {self.peek().value!r}", self.peek().line)

    def skip_newlines(self):
        while self.check(TT.NEWLINE):
            self.advance()

    def current_line(self):
        return self.peek().line

    # ── entry point ───────────────────────────────────────────────────────────

    def parse(self) -> Program:
        stmts = []
        self.skip_newlines()
        while not self.check(TT.EOF):
            stmt = self.parse_stmt()
            if stmt:
                stmts.append(stmt)
            self.skip_newlines()
        return Program(stmts=stmts)

    # ── statement dispatcher ──────────────────────────────────────────────────

    def parse_stmt(self) -> Any:
        ln = self.current_line()

        # if statement: starts with (condition) မှန်လျှင်
        if self.check(TT.LPAREN):
            return self.parse_paren_stmt(ln)

        # Skip lone newlines
        if self.check(TT.NEWLINE):
            self.advance()
            return None

        raise ParseError(f"Unexpected token {self.peek()!r}", ln)

    # ── paren-prefixed statements ─────────────────────────────────────────────

    def parse_paren_stmt(self, ln) -> Any:
        self.expect(TT.LPAREN)
        # Collect everything inside the outer parens
        inner_tokens, inner_ln = self._collect_inner()
        self.expect(TT.RPAREN)

        # Now look at what verb follows
        verb = self._read_verb()
        return self._dispatch_verb(verb, inner_tokens, inner_ln, ln)

    def _collect_inner(self):
        """Return list of tokens inside matching parens (already consumed open-paren)."""
        tokens = []
        depth = 1
        ln = self.current_line()
        while not self.check(TT.EOF):
            t = self.peek()
            if t.type == TT.LPAREN:
                depth += 1
            elif t.type == TT.RPAREN:
                depth -= 1
                if depth == 0:
                    break
            tokens.append(self.advance())
        return tokens, ln

    def _read_verb(self) -> str:
        """Consume verb suffix tokens and return a canonical verb string."""
        parts = []
        # Collect tokens until newline or EOF, joining them
        while not self.check(TT.NEWLINE, TT.EOF):
            parts.append(self.advance().value)
        if self.check(TT.NEWLINE):
            self.advance()
        verb = " ".join(parts).strip()
        return verb

    def _dispatch_verb(self, verb: str, inner: List[Token], inner_ln: int, ln: int) -> Any:
        ip = InnerParser(inner, inner_ln)

        # ── Print ────────────────────────────────────────────────────────────
        if verb == "ကိုအဖြေထုတ်ပါ":
            expr = ip.parse_expr()
            return PrintStmt(expr=expr, line=ln)

        # ── Load ─────────────────────────────────────────────────────────────
        if verb in ("ကိုဖတ်ပါ", "ကို ဖတ်ပါ"):
            return self._parse_load(ip, ln)

        # ── Assign  (တန်ဖိုး) ကို name ဟု သတ်မှတ်ပါ ──────────────────────────
        if "သတ်မှတ်ပါ" in verb:
            # verb looks like: ကို <name> ဟု သတ်မှတ်ပါ  or  ကို <name> ဟုသတ်မှတ်ပါ
            name = self._extract_name_from_verb(verb, ("ကို", "ဟု", "ဟုသတ်မှတ်ပါ", "သတ်မှတ်ပါ"))
            expr = ip.parse_expr()
            return AssignStmt(value=expr, name=name, line=ln)

        # ── Save  (expr) ကို name အဖြစ် သိမ်းဆည်းပါ ──────────────────────────
        if "သိမ်းဆည်းပါ" in verb:
            name = self._extract_name_from_verb(verb, ("ကို", "အဖြစ်", "အဖြစ် သိမ်းဆည်းပါ", "သိမ်းဆည်းပါ"))
            expr = ip.parse_expr()
            return SaveStmt(expr=expr, name=name, line=ln)

        # ── Show variable ─────────────────────────────────────────────────────
        if verb in ("ကို ဖော်ပြပါ", "ကိုဖော်ပြပါ"):
            name = ip.consume_all_as_str()
            return ShowVarStmt(name=name.strip(), line=ln)

        # ── Header ────────────────────────────────────────────────────────────
        if "Header ဖော်ပြပါ" in verb:
            ds = ip.parse_expr()
            return ShowHeaderStmt(dataset=ds, line=ln)

        # ── Summary ───────────────────────────────────────────────────────────
        if "အကျဥ်းချုပ် ဖော်ပြပါ" in verb or "အကျဉ်းချုပ် ဖော်ပြပါ" in verb:
            ds = ip.parse_expr()
            return ShowSummaryStmt(dataset=ds, line=ln)

        # ── Head rows ─────────────────────────────────────────────────────────
        # Syntax: ("dataset") ရဲ့ အစပိုင်း "N" လိုင်းဖော်ပြပါ
        # N is extracted from the verb string
        if "လိုင်းဖော်ပြပါ" in verb:
            ds = ip.parse_expr()
            import re as _re
            m = _re.search(r'"(\d+)"', verb)
            n = int(m.group(1)) if m else 5
            return ShowHeadStmt(dataset=ds, n=n, line=ln)

        # ── Data types ────────────────────────────────────────────────────────
        if "အမျိုးအစားများ ဖော်ပြပါ" in verb:
            ds = ip.parse_expr()
            return ShowTypesStmt(dataset=ds, line=ln)

        # ── Stat functions: mean / max / min / mode ───────────────────────────
        for func in ("mean", "max", "min", "mode"):
            if verb == f"{func} ကိုဖော်ပြပါ":
                ds, col = ip.parse_ds_col()
                return StatStmt(func=func, dataset=ds, column=col, line=ln)

        # ── Frequency ─────────────────────────────────────────────────────────
        if verb == "frequency ကိုဖော်ပြပါ":
            ds, col = ip.parse_ds_col_freq()
            return FreqStmt(dataset=ds, column=col, line=ln)

        # ── Group by ─────────────────────────────────────────────────────────
        if "အုပ်စုလိုက်တွက်ချက်ပါ" in verb:
            return self._parse_groupby(ip, ln)

        # ── Missing count ─────────────────────────────────────────────────────
        if "အရေအတွက်ကို ဖော်ပြပါ" in verb:
            return self._parse_missing_count(ip, ln)

        # ── Impute ────────────────────────────────────────────────────────────
        if "အဖြစ် ဖော်ပြပါ" in verb:
            return self._parse_impute(ip, ln)

        # ── Drop column ───────────────────────────────────────────────────────
        if verb == "ဖျက်ပေးပါ":
            ds, col = ip.parse_ds_col()
            return DropColStmt(dataset=ds, column=col, line=ln)

        # ── New column ────────────────────────────────────────────────────────
        if "Column အသစ်လုပ်ပါ" in verb:
            return self._parse_new_col(ip, ln)

        # ── Filter ────────────────────────────────────────────────────────────
        if verb == "ကိုခွဲထုတ်ပါ":
            return self._parse_filter(ip, ln)

        # ── Sort ──────────────────────────────────────────────────────────────
        if "စီပေးပါ" in verb:
            ascending = "တန်ဖိုးငယ်စဥ်" in verb
            ds, col = ip.parse_ds_col()
            return SortStmt(dataset=ds, column=col, ascending=ascending, line=ln)

        # ── Rename ────────────────────────────────────────────────────────────
        if verb == "နာမည်ပြောင်းပါ":
            return self._parse_rename(ip, ln)

        # ── Drop missing rows ─────────────────────────────────────────────────
        if "ဖယ်ရှားပါ" in verb:
            ds = ip.parse_expr()
            return DropMissingStmt(dataset=ds, line=ln)

        # ── Model definition ──────────────────────────────────────────────────
        if "linear_model" in verb and "သတ်မှတ်ပါ" in verb:
            name = self._extract_name_from_verb(verb, ("ကို", "linear_model", "အဖြစ်သတ်မှတ်ပါ",
                                                        "အဖြစ် သတ်မှတ်ပါ", "သတ်မှတ်ပါ"))
            return self._parse_model_def(ip, name, ln)

        # ── Train ─────────────────────────────────────────────────────────────
        if "train လုပ်ပါ" in verb:
            model, ds = ip.parse_two_args()
            return TrainStmt(model_name=model, dataset=ds, line=ln)

        # ── Predict ───────────────────────────────────────────────────────────
        if "ခန့်မှန်းပါ" in verb:
            model, ds = ip.parse_two_args()
            return PredictStmt(model_name=model, new_data=ds, line=ln)

        # ── Scatter plot ──────────────────────────────────────────────────────
        if "scatter_plot" in verb and "ပုံဆွဲပေးပါ" in verb:
            return self._parse_scatter(ip, ln)

        # ── Bar chart ─────────────────────────────────────────────────────────
        if "bar_chart" in verb and "ပုံဆွဲပေးပါ" in verb:
            return self._parse_bar(ip, ln)

        # ── Line chart ────────────────────────────────────────────────────────
        if "line_chart" in verb and "ပုံဆွဲပေးပါ" in verb:
            return self._parse_line(ip, ln)

        # ── Box plot ──────────────────────────────────────────────────────────
        if "box_plot" in verb and "ပုံဆွဲပေးပါ" in verb:
            return self._parse_box(ip, ln)

        # ── Histogram ────────────────────────────────────────────────────────
        if "ပုံဆွဲပေးပါ" in verb:
            return self._parse_histogram(ip, ln)

        # ── Report ───────────────────────────────────────────────────────────
        if "Report ထုတ်ပါ" in verb:
            ds, results = ip.parse_two_args()
            return ReportStmt(dataset=ds, results=results, line=ln)

        # ── If statement ──────────────────────────────────────────────────────
        if "မှန်လျှင်" in verb:
            return self._parse_if(ip, verb, ln)

        raise ParseError(f"Unknown verb: {verb!r}", ln)

    # ── specific inner parsers ────────────────────────────────────────────────

    def _parse_load(self, ip: "InnerParser", ln):
        path = ip.expect_string()
        ip.skip_comma()
        opts = ip.parse_kv_pairs()
        file_type = opts.get("file type", opts.get("filetype", "csv")).lower()
        sheet = opts.get("Sheet", opts.get("sheet", None))
        safe_copy = str(opts.get("safe copy", opts.get("safecopy", "false"))).lower() == "true"
        return LoadStmt(path=path, file_type=file_type, sheet=sheet, safe_copy=safe_copy, line=ln)

    def _parse_head_inner(self, ip: "InnerParser"):
        ds = ip.parse_expr_until("ရဲ့")
        ip.expect_val("ရဲ့")
        ip.expect_val("အစပိုင်း")
        n_tok = ip.expect(TT.STRING, TT.NUMBER)
        n = int(float(n_tok.value))
        ip.expect_val("လိုင်းဖော်ပြပါ")  # may be absent if in verb
        return ds, n

    def _parse_groupby(self, ip: "InnerParser", ln):
        ds = ip.parse_expr_until_pipe()
        ip.skip_pipe()
        # consume "group" and "by" as separate tokens
        ip.expect_val("group", "group by")
        if ip.check_val("by"):
            ip.advance()
        group_col = ip.expect_string_or_ident()
        ip.skip_comma()
        agg_func = ip.expect_ident_val().value
        agg_col = ip.expect_string_or_ident()
        return GroupByStmt(dataset=ds, group_col=group_col, agg_func=agg_func, agg_col=agg_col, line=ln)

    def _parse_missing_count(self, ip: "InnerParser", ln):
        ds = ip.parse_expr_until_pipe()
        ip.skip_pipe()
        # consume "missing" and optionally "values"
        ip.expect_val("missing", "missing values")
        if ip.check_val("values"):
            ip.advance()
        col = ""
        return MissingCountStmt(dataset=ds, column=col, line=ln)

    def _parse_impute(self, ip: "InnerParser", ln):
        ds = ip.parse_expr_until_pipe()
        ip.skip_pipe()
        # consume "missing" and optionally "values"
        ip.expect_val("missing", "missing values")
        if ip.check_val("values"):
            ip.advance()
        ip.expect(TT.ASSIGN)
        val = ip.parse_expr()
        return ImputeStmt(dataset=ds, column="", value=val, line=ln)

    def _parse_new_col(self, ip: "InnerParser", ln):
        ds = ip.parse_expr_until_pipe()
        ip.skip_pipe()
        col = ip.expect_string_or_ident()
        ip.skip_comma()
        ip.expect_val("newcolumn")
        ip.expect(TT.ASSIGN)
        expr_str = ip.consume_all_as_str()
        return NewColStmt(dataset=ds, column=col, expr_str=expr_str.strip(), line=ln)

    def _parse_filter(self, ip: "InnerParser", ln):
        ds = ip.parse_expr_until_pipe()
        ip.skip_pipe()
        col = ip.expect_string_or_ident()
        op_tok = ip.expect(TT.EQEQ, TT.NEQ, TT.LT, TT.GT_OP, TT.LTE, TT.GTE, TT.PIPE)
        op = op_tok.value
        val = ip.parse_expr()
        return FilterStmt(dataset=ds, column=col, op=op, value=val, line=ln)

    def _parse_rename(self, ip: "InnerParser", ln):
        ds = ip.parse_expr_until_pipe()
        ip.skip_pipe()
        old = ip.expect_string_or_ident()
        ip.expect_val("to")
        new = ip.expect_string_or_ident()
        return RenameStmt(dataset=ds, old_name=old, new_name=new, line=ln)

    def _parse_model_def(self, ip: "InnerParser", model_var: str, ln):
        ds = ip.parse_expr_until_pipe()
        ip.skip_pipe()
        target = ip.expect_string_or_ident()
        ip.expect(TT.TILDE)
        features = []
        features.append(ip.expect_string_or_ident())
        while ip.check(TT.PLUS):
            ip.advance()
            features.append(ip.expect_string_or_ident())
        return ModelDefStmt(dataset=ds, target=target, features=features, model_var=model_var, line=ln)

    def _parse_scatter(self, ip: "InnerParser", ln):
        ds = ip.parse_expr_until_pipe()
        ip.skip_pipe()
        opts = ip.parse_kv_pairs()
        x_col = opts.get("x", "")
        y_col = opts.get("y", "")
        return ScatterPlotStmt(dataset=ds, x_col=x_col, y_col=y_col, line=ln)

    def _parse_histogram(self, ip: "InnerParser", ln):
        ds = ip.parse_expr_until_pipe()
        ip.skip_pipe()
        # consume "group" and "by" tokens, then read the column string
        ip.expect_val("group", "group by", "column")
        if ip.check_val("by"):
            ip.advance()
        group_col = ip.expect_string_or_ident()
        # optionally consume , plot = "histogram"
        while not ip.at_end():
            ip.advance()
        return HistogramStmt(dataset=ds, group_col=group_col, line=ln)

    def _parse_bar(self, ip: "InnerParser", ln):
        ds = ip.parse_expr_until_pipe()
        ip.skip_pipe()
        opts = ip.parse_kv_pairs()
        x_col = opts.get("x", "")
        y_col = opts.get("y", "")
        return BarChartStmt(dataset=ds, x_col=x_col, y_col=y_col, line=ln)

    def _parse_line(self, ip: "InnerParser", ln):
        ds = ip.parse_expr_until_pipe()
        ip.skip_pipe()
        opts = ip.parse_kv_pairs()
        x_col = opts.get("x", "")
        y_col = opts.get("y", "")
        return LineChartStmt(dataset=ds, x_col=x_col, y_col=y_col, line=ln)

    def _parse_box(self, ip: "InnerParser", ln):
        ds = ip.parse_expr_until_pipe()
        ip.skip_pipe()
        opts = ip.parse_kv_pairs()
        col = opts.get("column", opts.get("y", ""))
        # "group by" may be stored as "group by" or "group by " or with extra space
        group_col = opts.get("group by", opts.get("group by ", opts.get("group", "")))
        return BoxPlotStmt(dataset=ds, col=col, group_col=group_col, line=ln)

    def _parse_if(self, ip: "InnerParser", verb: str, ln):
        # verb already consumed; condition was inside the parens
        # format: (condition) မှန်လျှင် (action1)၊ မဟုတ်လျှင် (action2) လုပ်ပါ
        condition = ip.parse_expr()
        # then/else branches are in the remaining verb tokens which we can't re-parse here
        # Instead, the if syntax uses the outer parser state
        # We'll return a placeholder; full if parsing handled separately
        return IfStmt(condition=condition, then_branch=None, else_branch=None, line=ln)

    # ── utility ───────────────────────────────────────────────────────────────

    def _extract_name_from_verb(self, verb: str, strip_words) -> str:
        parts = verb.split()
        cleaned = [p for p in parts if p not in strip_words]
        return " ".join(cleaned).strip()


# ── InnerParser: operates on collected token list ─────────────────────────────

class InnerParser:
    def __init__(self, tokens: List[Token], ln: int):
        self.tokens = tokens
        self.pos = 0
        self.ln = ln

    def peek(self, offset=0) -> Optional[Token]:
        idx = self.pos + offset
        return self.tokens[idx] if idx < len(self.tokens) else None

    def advance(self) -> Token:
        t = self.tokens[self.pos]
        self.pos += 1
        return t

    def check(self, *types) -> bool:
        t = self.peek()
        return t is not None and t.type in types

    def check_val(self, *values) -> bool:
        t = self.peek()
        return t is not None and t.value in values

    def expect(self, *types) -> Token:
        t = self.peek()
        if t and t.type in types:
            return self.advance()
        raise ParseError(f"Expected {types}, got {t!r}", self.ln)

    def expect_val(self, *values) -> Token:
        t = self.peek()
        if t and t.value in values:
            return self.advance()
        # soft skip
        return Token(TT.IDENT, values[0] if values else "", self.ln)

    def expect_ident_val(self) -> Token:
        t = self.peek()
        if t and t.type in (TT.IDENT, TT.KEYWORD):
            return self.advance()
        raise ParseError(f"Expected identifier, got {t!r}", self.ln)

    def expect_string(self) -> str:
        t = self.expect(TT.STRING)
        return t.value

    def expect_string_or_ident(self) -> str:
        t = self.peek()
        if t and t.type in (TT.STRING, TT.IDENT, TT.KEYWORD):
            self.advance()
            return t.value
        raise ParseError(f"Expected string or identifier, got {t!r}", self.ln)

    def skip_comma(self):
        if self.check(TT.COMMA):
            self.advance()

    def skip_pipe(self):
        if self.check(TT.PIPE):
            self.advance()

    def at_end(self) -> bool:
        return self.pos >= len(self.tokens)

    def consume_all_as_str(self) -> str:
        parts = []
        while not self.at_end():
            parts.append(self.advance().value)
        return " ".join(parts)

    def parse_expr(self) -> Any:
        return self._parse_comparison()

    def _parse_comparison(self):
        left = self._parse_additive()
        while self.check(TT.EQEQ, TT.NEQ, TT.LT, TT.GT_OP, TT.LTE, TT.GTE):
            op = self.advance().value
            right = self._parse_additive()
            left = BinOp(op=op, left=left, right=right, line=self.ln)
        return left

    def _parse_additive(self):
        left = self._parse_multiplicative()
        while self.check(TT.PLUS, TT.MINUS):
            op = self.advance().value
            right = self._parse_multiplicative()
            left = BinOp(op=op, left=left, right=right, line=self.ln)
        return left

    def _parse_multiplicative(self):
        left = self._parse_primary()
        while self.check(TT.STAR, TT.SLASH):
            op = self.advance().value
            right = self._parse_primary()
            left = BinOp(op=op, left=left, right=right, line=self.ln)
        return left

    def _parse_primary(self):
        t = self.peek()
        if t is None:
            return None
        if t.type == TT.STRING:
            self.advance()
            return StringLit(value=t.value, line=self.ln)
        if t.type == TT.NUMBER:
            self.advance()
            return NumberLit(value=float(t.value), line=self.ln)
        if t.value in ("true", "True"):
            self.advance()
            return BoolLit(value=True, line=self.ln)
        if t.value in ("false", "False"):
            self.advance()
            return BoolLit(value=False, line=self.ln)
        if t.type in (TT.IDENT, TT.KEYWORD):
            self.advance()
            return Ident(name=t.value, line=self.ln)
        return None

    def parse_expr_until_pipe(self) -> Any:
        """Parse expression up to (but not including) a PIPE token."""
        saved = self.pos
        tokens_before = []
        while not self.at_end() and not self.check(TT.PIPE):
            tokens_before.append(self.tokens[self.pos])
            self.pos += 1
        sub = InnerParser(tokens_before, self.ln)
        return sub.parse_expr()

    def parse_expr_until(self, stop_val: str) -> Any:
        tokens_before = []
        while not self.at_end() and not self.check_val(stop_val):
            tokens_before.append(self.tokens[self.pos])
            self.pos += 1
        sub = InnerParser(tokens_before, self.ln)
        return sub.parse_expr()

    def parse_ds_col(self):
        """Parse: "dataset" > "column" """
        ds = self.parse_expr_until_pipe()
        self.skip_pipe()
        col = self.expect_string_or_ident()
        return ds, col

    def parse_ds_col_freq(self):
        """Parse: "dataset" ရဲ့ "column" """
        ds = self.parse_expr_until("ရဲ့")
        self.expect_val("ရဲ့")
        col = self.expect_string_or_ident()
        return ds, col

    def parse_two_args(self):
        a = self.expect_string_or_ident()
        self.skip_comma()
        b = self.expect_string_or_ident()
        return a, b

    def parse_kv_pairs(self) -> dict:
        """Parse key = value , key = value … pairs."""
        result = {}
        while not self.at_end():
            # key
            key_parts = []
            while not self.at_end() and not self.check(TT.ASSIGN) and not self.check(TT.COMMA):
                key_parts.append(self.advance().value)
            key = " ".join(key_parts).strip()
            if not key:
                break
            if not self.check(TT.ASSIGN):
                break
            self.advance()  # consume =
            # value
            val_tok = self.peek()
            if val_tok is None:
                break
            val = self.advance().value
            result[key] = val
            self.skip_comma()
        return result
