"""
Thida 1.2 — Test suite.
Run with: python -m pytest tests/ -v
"""
import os
import sys
import io
import textwrap

import pytest
import pandas as pd
import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from thida import Interpreter


# ── helpers ───────────────────────────────────────────────────────────────────

def run(source: str) -> tuple[Interpreter, str]:
    """Run Thida source; return (interpreter, captured stdout)."""
    interp = Interpreter()
    buf = io.StringIO()
    _stdout = sys.stdout
    sys.stdout = buf
    try:
        interp.run(textwrap.dedent(source))
    finally:
        sys.stdout = _stdout
    return interp, buf.getvalue()


@pytest.fixture
def sample_csv(tmp_path):
    """Create a small CSV and return its path."""
    df = pd.DataFrame({
        "Name":    ["Alice", "Bob", "Charlie", "David", "Eve"],
        "Score":   [90, 75, 85, None, 95],
        "Grade":   ["A", "B", "B", "A", "A"],
        "Subject": ["Math", "Science", "Math", "Science", "Math"],
    })
    p = tmp_path / "students.csv"
    df.to_csv(p, index=False)
    return str(p), df


# ── basic output ──────────────────────────────────────────────────────────────

def test_print_string():
    _, out = run('("Hello Thida") ကိုအဖြေထုတ်ပါ')
    assert "Hello Thida" in out


def test_print_number():
    _, out = run('(42) ကိုအဖြေထုတ်ပါ')
    assert "42" in out


# ── variable assignment ───────────────────────────────────────────────────────

def test_assign_number():
    interp, out = run('(99) ကို x ဟု သတ်မှတ်ပါ')
    assert interp.env["x"] == 99.0
    assert "'x'" in out


def test_assign_string():
    interp, _ = run('("Thida") ကို lang ဟု သတ်မှတ်ပါ')
    assert interp.env["lang"] == "Thida"


# ── load CSV ──────────────────────────────────────────────────────────────────

def test_load_csv(sample_csv):
    path, df = sample_csv
    interp, out = run(f'("{path}" , file type = csv , safe copy = true) ကိုဖတ်ပါ')
    assert "students" in interp.env
    loaded = interp.env["students"]
    assert isinstance(loaded, pd.DataFrame)
    assert loaded.shape == df.shape
    assert "Loaded" in out


# ── header & summary ──────────────────────────────────────────────────────────

def test_show_header(sample_csv):
    path, _ = sample_csv
    _, out = run(f'''
        ("{path}" , file type = csv , safe copy = true) ကိုဖတ်ပါ
        ("students") ရဲ့ Header ဖော်ပြပါ
    ''')
    assert "Score" in out
    assert "Grade" in out


def test_show_head(sample_csv):
    path, _ = sample_csv
    _, out = run(f'''
        ("{path}" , file type = csv , safe copy = true) ကိုဖတ်ပါ
        ("students") ရဲ့ အစပိုင်း "3" လိုင်းဖော်ပြပါ
    ''')
    assert "Alice" in out


def test_show_summary(sample_csv):
    path, _ = sample_csv
    _, out = run(f'''
        ("{path}" , file type = csv , safe copy = true) ကိုဖတ်ပါ
        ("students") အကျဥ်းချုပ် ဖော်ပြပါ
    ''')
    assert "count" in out.lower() or "Score" in out


# ── statistical functions ─────────────────────────────────────────────────────

def test_mean(sample_csv):
    path, df = sample_csv
    _, out = run(f'''
        ("{path}" , file type = csv , safe copy = true) ကိုဖတ်ပါ
        ("students" > "Score") mean ကိုဖော်ပြပါ
    ''')
    expected = df["Score"].mean()
    assert str(round(expected, 2))[:4] in out


def test_max(sample_csv):
    path, _ = sample_csv
    _, out = run(f'''
        ("{path}" , file type = csv , safe copy = true) ကိုဖတ်ပါ
        ("students" > "Score") max ကိုဖော်ပြပါ
    ''')
    assert "95" in out


def test_min(sample_csv):
    path, _ = sample_csv
    _, out = run(f'''
        ("{path}" , file type = csv , safe copy = true) ကိုဖတ်ပါ
        ("students" > "Score") min ကိုဖော်ပြပါ
    ''')
    assert "75" in out


def test_mode(sample_csv):
    path, _ = sample_csv
    _, out = run(f'''
        ("{path}" , file type = csv , safe copy = true) ကိုဖတ်ပါ
        ("students" > "Grade") mode ကိုဖော်ပြပါ
    ''')
    assert "A" in out


# ── frequency ─────────────────────────────────────────────────────────────────

def test_frequency(sample_csv):
    path, _ = sample_csv
    _, out = run(f'''
        ("{path}" , file type = csv , safe copy = true) ကိုဖတ်ပါ
        ("students" ရဲ့ "Grade") frequency ကိုဖော်ပြပါ
    ''')
    assert "A" in out and "B" in out


# ── group by ─────────────────────────────────────────────────────────────────

def test_groupby(sample_csv):
    path, _ = sample_csv
    _, out = run(f'''
        ("{path}" , file type = csv , safe copy = true) ကိုဖတ်ပါ
        ("students" > group by "Subject" , mean "Score") ကို အုပ်စုလိုက်တွက်ချက်ပါ
    ''')
    assert "Math" in out or "Science" in out


# ── missing values ────────────────────────────────────────────────────────────

def test_missing_count(sample_csv):
    path, _ = sample_csv
    _, out = run(f'''
        ("{path}" , file type = csv , safe copy = true) ကိုဖတ်ပါ
        ("students" > "missing values") အရေအတွက်ကို ဖော်ပြပါ
    ''')
    assert "Score" in out or "1" in out


def test_impute(sample_csv):
    path, _ = sample_csv
    interp, out = run(f'''
        ("{path}" , file type = csv , safe copy = true) ကိုဖတ်ပါ
        ("students" > missing values = "mean") အဖြစ် ဖော်ပြပါ
    ''')
    df = interp.env["students"]
    assert df["Score"].isna().sum() == 0


def test_drop_missing(sample_csv):
    path, df = sample_csv
    interp, out = run(f'''
        ("{path}" , file type = csv , safe copy = true) ကိုဖတ်ပါ
        ("students") ထဲက အချက်အလက်မပြည့်စုံတာတွေကို ဖယ်ရှားပါ
    ''')
    assert interp.env["students"].shape[0] == df.dropna().shape[0]


# ── manipulation ─────────────────────────────────────────────────────────────

def test_filter(sample_csv):
    path, _ = sample_csv
    interp, out = run(f'''
        ("{path}" , file type = csv , safe copy = true) ကိုဖတ်ပါ
        ("students" > "Grade" == "A") ကိုခွဲထုတ်ပါ
    ''')
    df = interp.env["students"]
    assert all(df["Grade"] == "A")


def test_sort_descending(sample_csv):
    path, _ = sample_csv
    interp, _ = run(f'''
        ("{path}" , file type = csv , safe copy = true) ကိုဖတ်ပါ
        ("students" > "Score") ကို တန်ဖိုးကြီးစဥ် စီပေးပါ
    ''')
    scores = interp.env["students"]["Score"].dropna().tolist()
    assert scores == sorted(scores, reverse=True)


def test_sort_ascending(sample_csv):
    path, _ = sample_csv
    interp, _ = run(f'''
        ("{path}" , file type = csv , safe copy = true) ကိုဖတ်ပါ
        ("students" > "Score") ကို တန်ဖိုးငယ်စဥ် စီပေးပါ
    ''')
    scores = interp.env["students"]["Score"].dropna().tolist()
    assert scores == sorted(scores)


def test_rename(sample_csv):
    path, _ = sample_csv
    interp, _ = run(f'''
        ("{path}" , file type = csv , safe copy = true) ကိုဖတ်ပါ
        ("students" > "Score" to "Points") နာမည်ပြောင်းပါ
    ''')
    assert "Points" in interp.env["students"].columns
    assert "Score" not in interp.env["students"].columns


def test_drop_column(sample_csv):
    path, _ = sample_csv
    interp, _ = run(f'''
        ("{path}" , file type = csv , safe copy = true) ကိုဖတ်ပါ
        ("students" > "Subject") ဖျက်ပေးပါ
    ''')
    assert "Subject" not in interp.env["students"].columns


def test_new_column(sample_csv):
    path, _ = sample_csv
    interp, _ = run(f'''
        ("{path}" , file type = csv , safe copy = true) ကိုဖတ်ပါ
        ("students" > "ScoreX2" , newcolumn = Score * 2) Column အသစ်လုပ်ပါ
    ''')
    df = interp.env["students"]
    assert "ScoreX2" in df.columns


# ── save ──────────────────────────────────────────────────────────────────────

def test_save(sample_csv):
    path, _ = sample_csv
    interp, _ = run(f'''
        ("{path}" , file type = csv , safe copy = true) ကိုဖတ်ပါ
        (students) ကို backup အဖြစ် သိမ်းဆည်းပါ
    ''')
    assert "backup" in interp.env
    assert isinstance(interp.env["backup"], pd.DataFrame)


# ── comment handling ──────────────────────────────────────────────────────────

def test_block_comment():
    _, out = run('''
        /* ဤသည်မှာ comment ဖြစ်သည် */
        ("after comment") ကိုအဖြေထုတ်ပါ
    ''')
    assert "after comment" in out


# ── error handling ────────────────────────────────────────────────────────────

def test_missing_column_error(sample_csv):
    path, _ = sample_csv
    with pytest.raises(Exception) as exc:
        run(f'''
            ("{path}" , file type = csv , safe copy = true) ကိုဖတ်ပါ
            ("students" > "NonExistent") mean ကိုဖော်ပြပါ
        ''')
    assert "NonExistent" in str(exc.value)


def test_file_not_found():
    with pytest.raises(Exception) as exc:
        run('("missing_file.csv" , file type = csv , safe copy = true) ကိုဖတ်ပါ')
    assert "not found" in str(exc.value).lower() or "missing_file" in str(exc.value)
