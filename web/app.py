"""
Thida 1.2 — IDE Server
"""
import sys, io, os, re, json

ROOT        = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.normpath(os.path.join(ROOT, ".."))
sys.path.insert(0, PROJECT_DIR)

from flask import Flask, render_template, request, jsonify
from werkzeug.utils import secure_filename
from thida import Interpreter

app = Flask(
    __name__,
    template_folder=os.path.join(ROOT, "templates"),
    static_folder=os.path.join(ROOT, "static"),
)
app.config["JSON_AS_ASCII"]        = False
app.config["MAX_CONTENT_LENGTH"]   = 20 * 1024 * 1024

BUILTIN_DIR  = os.path.normpath(os.path.join(ROOT, "..", "datasets"))
UPLOAD_DIR   = os.path.normpath(os.path.join(ROOT, "..", "uploads"))
WORKSPACE_DIR= os.path.normpath(os.path.join(ROOT, "..", "workspace"))
DOCS_DIR     = os.path.normpath(os.path.join(ROOT, "..", "docs"))
EXAMPLES_DIR = os.path.normpath(os.path.join(ROOT, "..", "examples"))
ALLOWED_DATA = {".csv", ".xlsx", ".xls"}

for d in (UPLOAD_DIR, WORKSPACE_DIR):
    os.makedirs(d, exist_ok=True)


# ── pages ─────────────────────────────────────────────────────────────────────

@app.route("/")
def index():
    return render_template("index.html")


# ── run code ──────────────────────────────────────────────────────────────────

@app.route("/run", methods=["POST"])
def run_code():
    data   = request.get_json(force=True)
    source = data.get("code", "")
    if not source.strip():
        return jsonify({"output": "", "error": None, "error_line": None, "charts": []})

    out_buf  = io.StringIO()
    err_buf  = io.StringIO()
    sys.stdout, sys.stderr = out_buf, err_buf

    error_msg = error_line = None
    charts    = []
    tables    = []
    try:
        interp = Interpreter()
        interp._datasets_dir = BUILTIN_DIR
        interp._upload_dir   = UPLOAD_DIR
        interp.run(source)
        charts = interp.charts
        # Serialize loaded dataframes for the data viewer
        import pandas as pd, numpy as np
        for name, df in interp.tables.items():
            if not isinstance(df, pd.DataFrame):
                continue
            preview = df.head(500)
            # Convert to JSON-safe values
            def _safe(v):
                if isinstance(v, float) and (np.isnan(v) or np.isinf(v)):
                    return None
                if isinstance(v, (np.integer,)):
                    return int(v)
                if isinstance(v, (np.floating,)):
                    return float(v)
                return v
            rows = [[_safe(v) for v in row] for row in preview.values.tolist()]
            tables.append({
                "name": name,
                "columns": list(df.columns),
                "rows": rows,
                "shape": list(df.shape),
            })
    except Exception as e:
        error_msg = str(e)
        m = re.search(r"Line (\d+)", error_msg)
        if m:
            error_line = int(m.group(1))
    finally:
        sys.stdout, sys.stderr = sys.__stdout__, sys.__stderr__

    output = out_buf.getvalue()
    if err_buf.getvalue():
        output = (output + "\n" + err_buf.getvalue()).strip()

    return jsonify({
        "output": output, "error": error_msg,
        "error_line": error_line, "charts": charts, "tables": tables,
    })


# ── workspace file management ─────────────────────────────────────────────────

@app.route("/files", methods=["GET"])
def list_files():
    files = []
    for folder, ftype, icon in [
        (WORKSPACE_DIR, "workspace", "📄"),
        (EXAMPLES_DIR,  "example",   "📋"),
        (DOCS_DIR,      "doc",       "📖"),
    ]:
        if not os.path.isdir(folder):
            continue
        for f in sorted(os.listdir(folder)):
            if f.endswith(".thida"):
                fpath = os.path.join(folder, f)
                stat  = os.stat(fpath)
                files.append({
                    "name":     f,
                    "type":     ftype,
                    "icon":     icon,
                    "folder":   os.path.basename(folder),
                    "modified": int(stat.st_mtime),
                })
    return jsonify(files)


@app.route("/files/<folder>/<filename>", methods=["GET"])
def read_file(folder, filename):
    safe_f = secure_filename(filename)
    folder_map = {
        "workspace": WORKSPACE_DIR,
        "examples":  EXAMPLES_DIR,
        "docs":      DOCS_DIR,
    }
    base = folder_map.get(folder)
    if not base:
        return jsonify({"error": "Unknown folder"}), 404
    path = os.path.join(base, safe_f)
    if not os.path.exists(path):
        return jsonify({"error": "File not found"}), 404
    with open(path, encoding="utf-8") as fh:
        return jsonify({"content": fh.read(), "name": safe_f, "folder": folder})


@app.route("/files/workspace/<filename>", methods=["PUT"])
def save_file(filename):
    safe_f = secure_filename(filename)
    if not safe_f.endswith(".thida"):
        safe_f += ".thida"
    data = request.get_json(force=True)
    path = os.path.join(WORKSPACE_DIR, safe_f)
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(data.get("content", ""))
    return jsonify({"name": safe_f, "saved": True})


@app.route("/files/workspace/<filename>", methods=["DELETE"])
def delete_file(filename):
    safe_f = secure_filename(filename)
    path   = os.path.join(WORKSPACE_DIR, safe_f)
    if os.path.exists(path):
        os.remove(path)
        return jsonify({"deleted": True})
    return jsonify({"error": "Not found"}), 404


# ── dataset management ────────────────────────────────────────────────────────

@app.route("/datasets", methods=["GET"])
def list_datasets():
    files = []
    for d, src in [(BUILTIN_DIR, "builtin"), (UPLOAD_DIR, "upload")]:
        if not os.path.isdir(d):
            continue
        for f in sorted(os.listdir(d)):
            if os.path.splitext(f)[1].lower() in ALLOWED_DATA:
                files.append({"name": f, "stem": os.path.splitext(f)[0], "source": src})
    return jsonify(files)


@app.route("/upload", methods=["POST"])
def upload_dataset():
    if "file" not in request.files or not request.files["file"].filename:
        return jsonify({"error": "No file"}), 400
    f   = request.files["file"]
    ext = os.path.splitext(f.filename)[1].lower()
    if ext not in ALLOWED_DATA:
        return jsonify({"error": f"Unsupported: {ext}"}), 400
    safe = secure_filename(f.filename)
    dest = os.path.join(UPLOAD_DIR, safe)
    f.save(dest)
    try:
        import pandas as pd
        df      = pd.read_csv(dest) if ext == ".csv" else pd.read_excel(dest)
        rows, cols = df.shape
        return jsonify({
            "name": safe, "stem": os.path.splitext(safe)[0],
            "rows": rows, "cols": cols,
            "columns": list(df.columns), "source": "upload",
        })
    except Exception as e:
        os.remove(dest)
        return jsonify({"error": str(e)}), 400


@app.route("/delete_upload/<filename>", methods=["DELETE"])
def delete_upload(filename):
    path = os.path.join(UPLOAD_DIR, secure_filename(filename))
    if os.path.exists(path):
        os.remove(path)
        return jsonify({"ok": True})
    return jsonify({"error": "Not found"}), 404


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5050))
    print(f"\n  Thida 1.2 IDE  →  http://localhost:{port}\n")
    app.run(debug=True, port=port)
