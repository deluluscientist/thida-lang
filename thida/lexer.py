"""
Thida 1.2 Lexer — tokenizes Myanmar-syntax source code.
"""
import re
from dataclasses import dataclass
from enum import Enum, auto
from typing import List


class TT(Enum):
    """Token types."""
    # Literals
    STRING   = auto()
    NUMBER   = auto()
    BOOL     = auto()
    # Identifiers / keywords
    IDENT    = auto()
    KEYWORD  = auto()
    # Operators
    PIPE     = auto()   # >
    ASSIGN   = auto()   # =
    PLUS     = auto()   # +
    MINUS    = auto()   # -
    STAR     = auto()   # *
    SLASH    = auto()   # /
    TILDE    = auto()   # ~
    COMMA    = auto()   # ,
    DOT      = auto()   # .
    LPAREN   = auto()   # (
    RPAREN   = auto()   # )
    EQEQ     = auto()   # ==
    NEQ      = auto()   # !=
    LT       = auto()   # <
    GT_OP    = auto()   # > (comparison, distinct from PIPE)
    LTE      = auto()   # <=
    GTE      = auto()   # >=
    # Structure
    NEWLINE  = auto()
    EOF      = auto()
    COMMENT  = auto()


# Myanmar verb-suffixes and keywords
MYANMAR_KEYWORDS = {
    "ကိုအဖြေထုတ်ပါ",
    "ကိုဖတ်ပါ",
    "ဟုသတ်မှတ်ပါ",
    "ဟု သတ်မှတ်ပါ",
    "အဖြစ်သိမ်းဆည်းပါ",
    "အဖြစ် သိမ်းဆည်းပါ",
    "ကိုဖော်ပြပါ",
    "ကို ဖော်ပြပါ",
    "ရဲ့",
    "Header ဖော်ပြပါ",
    "အကျဥ်းချုပ် ဖော်ပြပါ",
    "အကျဉ်းချုပ် ဖော်ပြပါ",
    "အစပိုင်း",
    "လိုင်းဖော်ပြပါ",
    "အမျိုးအစားများ ဖော်ပြပါ",
    "mean ကိုဖော်ပြပါ",
    "max ကိုဖော်ပြပါ",
    "min ကိုဖော်ပြပါ",
    "mode ကိုဖော်ပြပါ",
    "frequency ကိုဖော်ပြပါ",
    "ကို အုပ်စုလိုက်တွက်ချက်ပါ",
    "အရေအတွက်ကို ဖော်ပြပါ",
    "အဖြစ် ဖော်ပြပါ",
    "ဖျက်ပေးပါ",
    "Column အသစ်လုပ်ပါ",
    "ကိုခွဲထုတ်ပါ",
    "စီပေးပါ",
    "တန်ဖိုးကြီးစဥ်",
    "တန်ဖိုးငယ်စဥ်",
    "နာမည်ပြောင်းပါ",
    "ထဲက အချက်အလက်မပြည့်စုံတာတွေကို ဖယ်ရှားပါ",
    "ကို linear_model အဖြစ်သတ်မှတ်ပါ",
    "ကို linear_model အဖြစ် သတ်မှတ်ပါ",
    "ကို train လုပ်ပါ",
    "ကို ခန့်မှန်းပါ",
    "ကို scatter_plot အဖြစ် ပုံဆွဲပေးပါ",
    "ကို bar_chart အဖြစ် ပုံဆွဲပေးပါ",
    "ကို line_chart အဖြစ် ပုံဆွဲပေးပါ",
    "ကို box_plot အဖြစ် ပုံဆွဲပေးပါ",
    "ကို ပုံဆွဲပေးပါ",
    "ကို PDF အဖြစ် Report ထုတ်ပါ",
    "မှန်လျှင်",
    "မဟုတ်လျှင်",
    "လုပ်ပါ",
    "ကို",
    "ကို(",
    "mean",
    "max",
    "min",
    "mode",
    "frequency",
    "file type",
    "Sheet",
    "safe copy",
    "group by",
    "plot",
    "newcolumn",
    "to",
    "train",
    "missing values",
    "x",
    "y",
    "histogram",
    "scatter_plot",
    "linear_model",
    "excel",
    "csv",
    "true",
    "false",
    "PDF",
    "Header",
}


@dataclass
class Token:
    type: TT
    value: str
    line: int

    def __repr__(self):
        return f"Token({self.type.name}, {self.value!r}, line={self.line})"


class LexerError(Exception):
    def __init__(self, msg, line):
        super().__init__(f"[Lexer] Line {line}: {msg}")


class Lexer:
    def __init__(self, source: str):
        self.source = source
        self.pos = 0
        self.line = 1
        self.tokens: List[Token] = []

    def error(self, msg):
        raise LexerError(msg, self.line)

    def peek(self, offset=0):
        idx = self.pos + offset
        return self.source[idx] if idx < len(self.source) else ""

    def advance(self):
        ch = self.source[self.pos]
        self.pos += 1
        if ch == "\n":
            self.line += 1
        return ch

    def match(self, s: str) -> bool:
        if self.source[self.pos:self.pos + len(s)] == s:
            for _ in s:
                self.advance()
            return True
        return False

    def skip_whitespace(self):
        while self.pos < len(self.source) and self.source[self.pos] in (" ", "\t", "\r"):
            self.advance()

    def read_string(self) -> str:
        self.advance()  # consume opening quote
        buf = []
        while self.pos < len(self.source):
            ch = self.peek()
            if ch == "\\":
                self.advance()
                esc = self.advance()
                buf.append({"n": "\n", "t": "\t", "\\": "\\", '"': '"'}.get(esc, esc))
            elif ch == '"':
                self.advance()
                return "".join(buf)
            else:
                buf.append(self.advance())
        self.error("Unterminated string literal")

    def read_number(self) -> str:
        buf = []
        while self.pos < len(self.source) and (self.source[self.pos].isdigit() or self.source[self.pos] == "."):
            buf.append(self.advance())
        return "".join(buf)

    def read_myanmar_word(self) -> str:
        """Read a contiguous Myanmar/ASCII identifier token."""
        buf = []
        while self.pos < len(self.source):
            ch = self.source[self.pos]
            # Stop at structural chars
            if ch in ('(', ')', ',', '"', '\n', '\r', '>', '<', '=', '~', '+', '-', '*', '/', '.'):
                break
            if ch in (' ', '\t'):
                # Peek-ahead: some multi-word keywords need the space
                # We'll handle multi-word keywords at the parser level; stop here
                break
            buf.append(self.advance())
        return "".join(buf)

    def tokenize(self) -> List[Token]:
        while self.pos < len(self.source):
            self.skip_whitespace()
            if self.pos >= len(self.source):
                break
            ch = self.peek()
            ln = self.line

            # Block comment
            if ch == '/' and self.peek(1) == '*':
                self.advance(); self.advance()
                while self.pos < len(self.source):
                    if self.peek() == '*' and self.peek(1) == '/':
                        self.advance(); self.advance()
                        break
                    self.advance()
                continue

            # Line comment //
            if ch == '/' and self.peek(1) == '/':
                while self.pos < len(self.source) and self.peek() != '\n':
                    self.advance()
                continue

            if ch == '\n':
                self.advance()
                self.tokens.append(Token(TT.NEWLINE, "\n", ln))
                continue

            if ch == '"':
                val = self.read_string()
                self.tokens.append(Token(TT.STRING, val, ln))
                continue

            if ch.isdigit() or (ch == '-' and self.peek(1).isdigit()):
                val = self.read_number()
                self.tokens.append(Token(TT.NUMBER, val, ln))
                continue

            if ch == '(':
                self.advance()
                self.tokens.append(Token(TT.LPAREN, "(", ln))
                continue

            if ch == ')':
                self.advance()
                self.tokens.append(Token(TT.RPAREN, ")", ln))
                continue

            if ch == ',':
                self.advance()
                self.tokens.append(Token(TT.COMMA, ",", ln))
                continue

            if ch == '~':
                self.advance()
                self.tokens.append(Token(TT.TILDE, "~", ln))
                continue

            if ch == '+':
                self.advance()
                self.tokens.append(Token(TT.PLUS, "+", ln))
                continue

            if ch == '-':
                self.advance()
                self.tokens.append(Token(TT.MINUS, "-", ln))
                continue

            if ch == '*':
                self.advance()
                self.tokens.append(Token(TT.STAR, "*", ln))
                continue

            if ch == '.':
                self.advance()
                self.tokens.append(Token(TT.DOT, ".", ln))
                continue

            if ch == '=':
                self.advance()
                if self.peek() == '=':
                    self.advance()
                    self.tokens.append(Token(TT.EQEQ, "==", ln))
                else:
                    self.tokens.append(Token(TT.ASSIGN, "=", ln))
                continue

            if ch == '!':
                self.advance()
                if self.peek() == '=':
                    self.advance()
                    self.tokens.append(Token(TT.NEQ, "!=", ln))
                    continue
                self.error(f"Unexpected character '!'")

            if ch == '<':
                self.advance()
                if self.peek() == '=':
                    self.advance()
                    self.tokens.append(Token(TT.LTE, "<=", ln))
                else:
                    self.tokens.append(Token(TT.LT, "<", ln))
                continue

            if ch == '>':
                self.advance()
                if self.peek() == '=':
                    self.advance()
                    self.tokens.append(Token(TT.GTE, ">=", ln))
                elif self.peek() == ' ' or self.peek() == '"' or self.peek() == '\t':
                    # inside parens it's a pipe; outside it may be comparison — parser decides
                    self.tokens.append(Token(TT.PIPE, ">", ln))
                else:
                    self.tokens.append(Token(TT.PIPE, ">", ln))
                continue

            if ch == '/':
                self.advance()
                self.tokens.append(Token(TT.SLASH, "/", ln))
                continue

            # Myanmar or ASCII word
            word = self.read_myanmar_word()
            if word:
                tt = TT.KEYWORD if word in MYANMAR_KEYWORDS else TT.IDENT
                self.tokens.append(Token(tt, word, ln))
                continue

            self.error(f"Unexpected character: {ch!r} (U+{ord(ch):04X})")

        self.tokens.append(Token(TT.EOF, "", self.line))
        return self.tokens
