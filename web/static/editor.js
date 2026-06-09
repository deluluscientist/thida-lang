/* ═══════════════════════════════════════════════════════════
   Thida 1.2 IDE — editor.js
   ═══════════════════════════════════════════════════════════ */

// ── CodeMirror mode ──────────────────────────────────────────
CodeMirror.defineMode("thida", function () {
  const VERBS = [
    "ကိုအဖြေထုတ်ပါ","ကိုဖတ်ပါ","ကို ဖတ်ပါ","ဟုသတ်မှတ်ပါ","ဟု သတ်မှတ်ပါ",
    "အဖြစ်သိမ်းဆည်းပါ","အဖြစ် သိမ်းဆည်းပါ","ကိုဖော်ပြပါ","ကို ဖော်ပြပါ",
    "Header ဖော်ပြပါ","အကျဥ်းချုပ် ဖော်ပြပါ","လိုင်းဖော်ပြပါ",
    "အမျိုးအစားများ ဖော်ပြပါ","mean ကိုဖော်ပြပါ","max ကိုဖော်ပြပါ",
    "min ကိုဖော်ပြပါ","mode ကိုဖော်ပြပါ","frequency ကိုဖော်ပြပါ",
    "အကြိမ်ရေ ဖော်ပြပါ","ဖော်ပြပါ","သတ်မှတ်ပါ","ဖြည့်ပေးပါ","ဖြည့် ပေးပါ",
    "ဖျက်ပစ်ပါ","ဖျက် ပစ်ပါ","စစ်ထုတ်ပါ","စီပေးပါ","ပြောင်းပေးပါ",
    "ထည့်ပေးပါ","ပုံဆွဲပေးပါ","ပုံဆွဲ ပေးပါ","တည်ဆောက်ပါ","သင်ကြားပါ",
    "ခန့်မှန်းပါ","သိမ်းဆည်းပါ","ဖျက်သိမ်းပါ","ဖော်ပြပေးပါ","ဖော်ပြ ပေးပါ",
    "အဖြစ် ပုံဆွဲပေးပါ"
  ];
  const KEYWORDS = [
    "scatter_plot","histogram","bar_chart","line_chart","box_plot",
    "linear_model","predict","group by","missing values",
    "ascending","descending","mean","median","max","min","mode",
    "x =","y =","column =","plot =","group =","agg =","target =",
    "features =","value =","op =","order =","filename ="
  ];
  return {
    startState: () => ({ inBlock: false }),
    token(stream, state) {
      if (state.inBlock) {
        if (stream.match("*/")) state.inBlock = false;
        else stream.next();
        return "thida-cmt";
      }
      if (stream.match("/*")) { state.inBlock = true; return "thida-cmt"; }
      if (stream.match("//")) { stream.skipToEnd(); return "thida-cmt"; }
      if (stream.peek() === '"') {
        stream.next();
        while (!stream.eol()) { if (stream.next() === '"') break; }
        return "thida-str";
      }
      if (stream.match(/^-?\d+(\.\d+)?/)) return "thida-num";
      if (stream.match(">")) return "thida-op";
      for (const v of VERBS)    { if (stream.match(v)) return "thida-verb"; }
      for (const k of KEYWORDS) { if (stream.match(k)) return "thida-kw"; }
      stream.next();
      return null;
    }
  };
});

// ── State ────────────────────────────────────────────────────
let editor;
let docEditor     = null;   // read-only CodeMirror for docs panel
let currentFile   = null;   // { name, folder } or null
let isDirty       = false;
let currentTheme  = "dark";
let sidebarOpen   = true;
let loadedTables  = {};     // name -> {columns, rows, shape}
let activeTable   = null;
let allPlots      = [];
let currentDocContent = "";  // raw content of currently viewed doc

// ── Init ─────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  editor = CodeMirror(document.getElementById("editor-mount"), {
    mode:              "thida",
    theme:             "one-dark",
    lineNumbers:       true,
    matchBrackets:     true,
    autoCloseBrackets: true,
    styleActiveLine:   true,
    indentUnit:        2,
    tabSize:           2,
    lineWrapping:      false,
    extraKeys: {
      "Ctrl-Enter": runCode,
      "Cmd-Enter":  runCode,
      "Ctrl-S":     saveFile,
      "Cmd-S":      saveFile,
      "Ctrl-N":     newFile,
      "Ctrl-B":     toggleSidebar,
      "Ctrl-/":     toggleComment,
    }
  });

  // Apply initial theme (dark by default, respects saved preference)
  const savedTheme = localStorage.getItem("thida-theme") || "dark";
  applyTheme(savedTheme);

  editor.on("change", () => markDirty());
  editor.on("cursorActivity", () => {
    const c = editor.getCursor();
    document.getElementById("tb-cursor").textContent = `Ln ${c.line+1}, Col ${c.ch+1}`;
  });

  // Global keyboard shortcuts
  document.addEventListener("keydown", e => {
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key === "Enter") { e.preventDefault(); runCode(); }
    if (mod && e.key === "s")     { e.preventDefault(); saveFile(); }
    if (mod && e.key === "n")     { e.preventDefault(); newFile(); }
    if (mod && e.key === "b")     { e.preventDefault(); toggleSidebar(); }
    if (mod && e.key === "/")     { e.preventDefault(); toggleComment(); }
  });

  // Setup drag resize
  setupResize();

  // Upload zone
  const zone  = document.getElementById("upload-zone");
  const finput = document.getElementById("file-input");
  zone.addEventListener("click",     () => finput.click());
  finput.addEventListener("change",  () => { if (finput.files[0]) doUpload(finput.files[0]); });
  zone.addEventListener("dragover",  e  => { e.preventDefault(); zone.classList.add("drag-over"); });
  zone.addEventListener("dragleave", () => zone.classList.remove("drag-over"));
  zone.addEventListener("drop", e => {
    e.preventDefault(); zone.classList.remove("drag-over");
    if (e.dataTransfer.files[0]) doUpload(e.dataTransfer.files[0]);
  });

  // Load sidebar content
  loadFileTree();
  loadDatasets();
  buildSnippets();

  // Load default welcome file
  loadDefaultFile();
});

// ── Default welcome content ───────────────────────────────────
function loadDefaultFile() {
  const welcome = `/* ══════════════════════════════════════════
   Thida 1.2 — Myanmar Data Language IDE
   Ctrl+Enter to run · Ctrl+S to save
   ══════════════════════════════════════════ */

// ── Hello World ─────────────────────────
("Hello, Thida 1.2!") ကိုဖော်ပြပါ

// ── Load built-in dataset ───────────────
("students") ကိုဖတ်ပါ
("students") ကို Header ဖော်ပြပါ
("students") ရဲ့ အစပိုင်း "5" လိုင်းဖော်ပြပါ

// ── Quick stats ─────────────────────────
("students" > column = "Math") ကို mean ကိုဖော်ပြပါ

// ── Scatter plot ────────────────────────
("students" > x = "Math" , y = "Science") ကို scatter_plot အဖြစ် ပုံဆွဲပေးပါ
`;
  editor.setValue(welcome);
  editor.clearHistory();
  isDirty = false;
  updateDirtyUI();
}

// ── File tree ────────────────────────────────────────────────
function loadFileTree() {
  fetch("/files").then(r => r.json()).then(files => {
    buildTree("tree-workspace", files.filter(f => f.type === "workspace"), true);
    buildTree("tree-examples",  files.filter(f => f.type === "example"),   false);
    buildTree("tree-docs",      files.filter(f => f.type === "doc"),        false);
    // Also populate the open-file select
    const sel = document.getElementById("file-select");
    const cur = sel.value;
    sel.innerHTML = '<option value="">— Open file —</option>';
    files.forEach(f => {
      const opt = document.createElement("option");
      opt.value = f.folder + "/" + f.name;
      opt.textContent = (f.type === "workspace" ? "📄" : f.type === "example" ? "📋" : "📖") + " " + f.name;
      sel.appendChild(opt);
    });
    if (cur) sel.value = cur;
  });
}

function buildTree(containerId, files, deletable) {
  const el = document.getElementById(containerId);
  el.innerHTML = "";
  if (!files.length) {
    el.innerHTML = `<div style="padding:3px 14px;font-size:.73rem;color:var(--dim)">Empty</div>`;
    return;
  }
  files.forEach(f => {
    const isDoc = f.type === "doc";
    const d = document.createElement("div");
    d.className = "tree-item";
    d.dataset.name   = f.name;
    d.dataset.folder = f.folder;
    d.innerHTML = `
      <span class="ti-icon">${f.icon || "📄"}</span>
      <span class="ti-name">${esc(f.name)}</span>
      ${deletable ? `<button class="ti-del" onclick="deleteWsFile(event,'${esc(f.name)}')" title="Delete">✕</button>` : ""}`;
    // Docs open in the docs viewer panel; other files open in the editor
    d.addEventListener("click", () => isDoc ? showDoc(f.folder, f.name) : openFile(f.folder, f.name));
    el.appendChild(d);
  });
}

function openFile(folder, name) {
  if (isDirty && !confirm("Discard unsaved changes?")) return;
  fetch(`/files/${folder}/${encodeURIComponent(name)}`)
    .then(r => r.json())
    .then(data => {
      if (data.error) return;
      editor.setValue(data.content || "");
      editor.clearHistory();
      currentFile = { name: data.name, folder };
      isDirty = false;
      updateDirtyUI();
      setFilename(data.name);
    });
}

function loadSelectedFile(val) {
  if (!val) return;
  const [folder, ...rest] = val.split("/");
  const name = rest.join("/");
  openFile(folder, name);
  document.getElementById("file-select").value = "";
}

function newFile() {
  if (isDirty && !confirm("Discard unsaved changes?")) return;
  editor.setValue("");
  editor.clearHistory();
  currentFile = null;
  isDirty = false;
  updateDirtyUI();
  setFilename("untitled.thida");
}

function saveFile() {
  const name = currentFile ? currentFile.name : null;
  if (!name || currentFile.folder !== "workspace") {
    openSaveAs();
    return;
  }
  doSaveToServer(name);
}

function openSaveAs() {
  const inp = document.getElementById("save-filename");
  inp.value = (currentFile && !currentFile.name.startsWith("untitled")) ? currentFile.name : "";
  document.getElementById("save-overlay").style.display = "flex";
  inp.focus();
}
function closeSaveAs() { document.getElementById("save-overlay").style.display = "none"; }
function doSave() {
  let name = document.getElementById("save-filename").value.trim();
  if (!name) return;
  if (!name.endsWith(".thida")) name += ".thida";
  closeSaveAs();
  doSaveToServer(name);
}
function doSaveToServer(name) {
  fetch(`/files/workspace/${encodeURIComponent(name)}`, {
    method:  "PUT",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ content: editor.getValue() }),
  }).then(r => r.json()).then(() => {
    currentFile = { name, folder: "workspace" };
    isDirty = false;
    updateDirtyUI();
    setFilename(name);
    loadFileTree();
  });
}

function deleteWsFile(e, name) {
  e.stopPropagation();
  if (!confirm(`Delete "${name}"?`)) return;
  fetch(`/files/workspace/${encodeURIComponent(name)}`, { method: "DELETE" })
    .then(() => {
      if (currentFile && currentFile.name === name) newFile();
      loadFileTree();
    });
}

// ── Run ──────────────────────────────────────────────────────
function runCode() {
  const code = editor.getValue().trim();
  if (!code) return;

  setStatus("running", "Running…");
  document.getElementById("run-btn").disabled = true;

  const fname = currentFile ? currentFile.name : "untitled.thida";
  consolePrint(`▶ ${fname}`, "c-run");

  fetch("/run", {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify({ code }),
  })
  .then(r => r.json())
  .then(res => {
    // Clear error highlights
    editor.getAllMarks().forEach(m => m.clear());
    for (let i = 0; i < editor.lineCount(); i++) editor.removeLineClass(i, "background");

    if (res.output) consolePrint(res.output, "c-out");

    if (res.error) {
      consolePrint("✖  " + res.error, "c-err");
      if (res.error_line != null) {
        const ln = res.error_line - 1;
        if (ln >= 0 && ln < editor.lineCount()) {
          editor.addLineClass(ln, "background", "c-err-line");
        }
      }
      setStatus("error", "Error");
    } else {
      consolePrint("✔  Done", "c-ok");
      setStatus("ok", "Ready");
    }

    // Tables
    if (res.tables && res.tables.length) {
      res.tables.forEach(t => { loadedTables[t.name] = t; });
      renderDataTabs();
      if (!activeTable || !loadedTables[activeTable]) {
        activeTable = res.tables[0].name;
      }
      showTable(activeTable);
    }

    // Charts
    if (res.charts && res.charts.length) {
      allPlots = allPlots.concat(res.charts);
      renderPlots();
    }
  })
  .catch(err => {
    consolePrint("Network error: " + err.message, "c-err");
    setStatus("error", "Error");
  })
  .finally(() => {
    document.getElementById("run-btn").disabled = false;
  });
}

// ── Console ──────────────────────────────────────────────────
function consolePrint(text, cls) {
  const body = document.getElementById("console-body");
  const el = document.createElement("div");
  el.className = cls || "";
  el.textContent = text;
  body.appendChild(el);
  body.scrollTop = body.scrollHeight;
}
function clearConsole() {
  document.getElementById("console-body").innerHTML =
    '<div class="console-welcome">Console cleared.</div>';
}

// ── Data Viewer ───────────────────────────────────────────────
function renderDataTabs() {
  const btns = document.getElementById("data-tab-btns");
  btns.innerHTML = "";
  Object.keys(loadedTables).forEach(name => {
    const b = document.createElement("button");
    b.className = "dtab-btn" + (name === activeTable ? " active" : "");
    b.textContent = name;
    b.onclick = () => { activeTable = name; renderDataTabs(); showTable(name); };
    btns.appendChild(b);
  });
}

function showTable(name) {
  const body = document.getElementById("data-body");
  const t = loadedTables[name];
  if (!t) return;

  // Remove empty state
  const empty = body.querySelector(".pempty");
  if (empty) empty.remove();

  body.innerHTML = "";
  body.style.overflow = "hidden";
  body.style.display  = "flex";
  body.style.flexDirection = "column";

  // Shape bar
  const shapeBar = document.createElement("div");
  shapeBar.className = "data-shape";
  shapeBar.textContent = `${name}  ·  ${t.shape[0].toLocaleString()} rows × ${t.shape[1]} columns`;
  if (t.shape[0] >= 500) shapeBar.textContent += "  (showing first 500 rows)";
  body.appendChild(shapeBar);

  // Table wrapper
  const wrap = document.createElement("div");
  wrap.className = "data-table-wrap";

  const table = document.createElement("table");
  table.className = "data-table";

  // Header
  const thead = document.createElement("thead");
  const hr = document.createElement("tr");
  // Row index header
  const th0 = document.createElement("th");
  th0.textContent = "#";
  hr.appendChild(th0);
  t.columns.forEach(col => {
    const th = document.createElement("th");
    th.textContent = col;
    hr.appendChild(th);
  });
  thead.appendChild(hr);
  table.appendChild(thead);

  // Body
  const tbody = document.createElement("tbody");
  t.rows.forEach((row, i) => {
    const tr = document.createElement("tr");
    const td0 = document.createElement("td");
    td0.className = "td-idx";
    td0.textContent = i;
    tr.appendChild(td0);
    row.forEach(val => {
      const td = document.createElement("td");
      if (val === null || val === undefined) {
        td.className = "td-null";
        td.textContent = "null";
      } else if (typeof val === "number") {
        td.className = "td-num";
        td.textContent = Number.isInteger(val) ? val : val.toFixed(4);
      } else {
        td.textContent = String(val);
      }
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  wrap.appendChild(table);
  body.appendChild(wrap);
}

// ── Plots ────────────────────────────────────────────────────
function renderPlots() {
  const grid  = document.getElementById("plots-grid");
  const empty = document.getElementById("plots-empty");
  const badge = document.getElementById("plot-badge");

  grid.innerHTML = "";
  if (!allPlots.length) {
    empty.style.display = "";
    badge.style.display = "none";
    return;
  }
  empty.style.display = "none";
  badge.style.display = "";
  badge.textContent   = allPlots.length;

  allPlots.forEach(ch => {
    const card = document.createElement("div");
    card.className = "plot-card";
    card.innerHTML = `
      <div class="plot-title">${esc(ch.title || "Chart")}</div>
      <img src="data:image/png;base64,${ch.b64}" alt="${esc(ch.title || "chart")}" loading="lazy">
      ${ch.description ? `<div class="plot-desc">${esc(ch.description)}</div>` : ""}`;
    grid.appendChild(card);
  });
}

function clearPlots() {
  allPlots = [];
  document.getElementById("plots-grid").innerHTML = "";
  document.getElementById("plots-empty").style.display = "";
  document.getElementById("plot-badge").style.display  = "none";
}

// ── Right-panel mode (Data | Docs) ───────────────────────────
function switchRightPanel(mode) {
  const isData = mode === "data";
  document.getElementById("rpt-data").classList.toggle("active", isData);
  document.getElementById("rpt-docs").classList.toggle("active", !isData);
  document.getElementById("data-body").style.display      = isData ? "" : "none";
  document.getElementById("doc-body").style.display       = isData ? "none" : "";
  document.getElementById("data-tab-btns").style.display  = isData ? "" : "none";
  document.getElementById("docs-toolbar").style.display   = isData ? "none" : "";
  if (!isData) setTimeout(() => docEditor && docEditor.refresh(), 50);
}

// ── Docs viewer ───────────────────────────────────────────────
function showDoc(folder, name) {
  fetch(`/files/${folder}/${encodeURIComponent(name)}`)
    .then(r => r.json())
    .then(data => {
      if (data.error) return;
      currentDocContent = data.content || "";

      // Switch right panel to docs mode
      switchRightPanel("docs");

      // Also switch sidebar to files/docs tab if needed
      const docEmpty = document.getElementById("doc-empty");
      const mountEl  = document.getElementById("doc-editor-mount");

      if (docEmpty) docEmpty.style.display = "none";
      mountEl.style.display = "";

      // Show insert banner
      const body = document.getElementById("doc-body");
      let banner = body.querySelector(".doc-banner");
      if (!banner) {
        banner = document.createElement("div");
        banner.className = "doc-banner";
        body.insertBefore(banner, mountEl);
      }
      banner.innerHTML = `
        <span><strong>${esc(data.name)}</strong> <span class="doc-banner-hint">— read-only · sample code shown below</span></span>
        <button class="ph-btn accent" onclick="insertDocToEditor()">↑ Insert to Editor</button>`;

      // Mount or update read-only CodeMirror
      if (!docEditor) {
        docEditor = CodeMirror(mountEl, {
          mode:        "thida",
          theme:       currentTheme === "dark" ? "one-dark" : "eclipse",
          lineNumbers: true,
          readOnly:    "nocursor",
          lineWrapping: false,
          value:       currentDocContent,
        });
      } else {
        docEditor.setValue(currentDocContent);
      }
      docEditor.refresh();

      // Show insert button in toolbar too
      const insBtn = document.getElementById("docs-insert-btn");
      if (insBtn) insBtn.style.display = "";

      // Highlight active doc in sidebar tree
      document.querySelectorAll("#tree-docs .tree-item").forEach(el => {
        el.classList.toggle("active", el.dataset.name === name);
      });
    });
}

function insertDocToEditor() {
  if (!currentDocContent) return;
  if (isDirty || editor.getValue().trim()) {
    if (!confirm("This will replace your current editor content. Continue?")) return;
  }
  editor.setValue(currentDocContent);
  editor.clearHistory();
  currentFile = null;
  isDirty = false;
  updateDirtyUI();
  setFilename("(from docs)");
  // Switch back to editor focus
  editor.focus();
  // Optionally switch right panel back to data
  switchRightPanel("data");
}

function clearDocView() {
  currentDocContent = "";
  document.getElementById("doc-empty").style.display = "";
  document.getElementById("doc-editor-mount").style.display = "none";
  const banner = document.getElementById("doc-body").querySelector(".doc-banner");
  if (banner) banner.remove();
  const insBtn = document.getElementById("docs-insert-btn");
  if (insBtn) insBtn.style.display = "none";
  document.querySelectorAll("#tree-docs .tree-item").forEach(el => el.classList.remove("active"));
  switchRightPanel("data");
}

// ── Datasets sidebar ──────────────────────────────────────────
function loadDatasets() {
  fetch("/datasets").then(r => r.json()).then(list => {
    const el = document.getElementById("dataset-list");
    el.innerHTML = "";
    list.forEach(ds => {
      const d = document.createElement("div");
      d.className = "ds-item";
      d.innerHTML = `
        <div class="ds-info">
          <span class="ds-name">${esc(ds.stem)}</span>
          <span class="ds-badge ${ds.source === 'builtin' ? 'badge-b' : 'badge-u'}">${ds.source === 'builtin' ? 'builtin' : 'upload'}</span>
        </div>
        ${ds.source === 'upload' ? `<button class="ds-del" onclick="deleteUpload(event,'${esc(ds.name)}')" title="Delete">✕</button>` : ""}`;
      d.addEventListener("click", () => insertDatasetSnippet(ds.stem));
      el.appendChild(d);
    });
  });
}

function insertDatasetSnippet(stem) {
  const snippet = `("${stem}") ကိုဖတ်ပါ\n("${stem}") ကို Header ဖော်ပြပါ\n("${stem}") ကို အကျဥ်းချုပ် ဖော်ပြပါ\n`;
  editor.replaceSelection(snippet);
  editor.focus();
}

function deleteUpload(e, name) {
  e.stopPropagation();
  if (!confirm(`Delete "${name}"?`)) return;
  fetch(`/delete_upload/${encodeURIComponent(name)}`, { method: "DELETE" })
    .then(() => loadDatasets());
}

function doUpload(file) {
  const msg = document.getElementById("upload-msg");
  msg.innerHTML = '<span style="color:var(--dim)">Uploading…</span>';
  const fd = new FormData();
  fd.append("file", file);
  fetch("/upload", { method: "POST", body: fd })
    .then(r => r.json())
    .then(res => {
      if (res.error) {
        msg.innerHTML = `<span style="color:var(--red)">✖ ${esc(res.error)}</span>`;
      } else {
        msg.innerHTML = `<span style="color:var(--green)">✔ ${esc(res.name)} (${res.rows}×${res.cols})</span>`;
        loadDatasets();
        setTimeout(() => { msg.innerHTML = ""; }, 4000);
      }
    });
  document.getElementById("file-input").value = "";
}

// ── Snippets ──────────────────────────────────────────────────
const SNIPPETS = [
  { title: "Print string",          code: `("Hello World!") ကိုဖော်ပြပါ` },
  { title: "Assign variable",       code: `("score") ကို (95) ဟုသတ်မှတ်ပါ` },
  { title: "Load CSV",              code: `("students") ကိုဖတ်ပါ` },
  { title: "Show header",           code: `("students") ကို Header ဖော်ပြပါ` },
  { title: "Show summary",          code: `("students") ကို အကျဥ်းချုပ် ဖော်ပြပါ` },
  { title: "First 10 rows",         code: `("students") ရဲ့ အစပိုင်း "10" လိုင်းဖော်ပြပါ` },
  { title: "Mean of column",        code: `("students" > column = "Math") ကို mean ကိုဖော်ပြပါ` },
  { title: "Filter rows",           code: `("students" > column = "Math" , value = 70 , op = ">=") ကို စစ်ထုတ်ပါ` },
  { title: "Sort descending",       code: `("students" > column = "Math" , order = "descending") ကို စီပေးပါ` },
  { title: "Group by",              code: `("sales" > group by "Region" , agg = "sum" , target = "Revenue") ကို ဖော်ပြပါ` },
  { title: "Impute missing",        code: `("students" > missing values = "mean" , column = "Math") ကို ဖြည့်ပေးပါ` },
  { title: "Drop column",           code: `("students" > column = "StudentID") ကို ဖျက်ပစ်ပါ` },
  { title: "Scatter plot",          code: `("students" > x = "Math" , y = "Science") ကို scatter_plot အဖြစ် ပုံဆွဲပေးပါ` },
  { title: "Histogram",             code: `("students" > group by "Math" , plot = "histogram") ကို ပုံဆွဲပေးပါ` },
  { title: "Bar chart",             code: `("sales" > x = "Region" , y = "Revenue") ကို bar_chart အဖြစ် ပုံဆွဲပေးပါ` },
  { title: "Line chart",            code: `("sales" > x = "Month" , y = "Revenue") ကို line_chart အဖြစ် ပုံဆွဲပေးပါ` },
  { title: "Box plot",              code: `("health" > column = "BMI") ကို box_plot အဖြစ် ပုံဆွဲပေးပါ` },
  { title: "Linear regression",     code: `("housing" > features = "Size_sqft,Bedrooms" , target = "Price_MMK") ကို linear_model တည်ဆောက်ပါ` },
  { title: "Save CSV",              code: `("students" > filename = "output.csv") ကို သိမ်းဆည်းပါ` },
  { title: "Block comment",         code: `/* ရှင်းလင်းချက် */` },
];

function buildSnippets() {
  const el = document.getElementById("snippet-list");
  SNIPPETS.forEach(s => {
    const d = document.createElement("div");
    d.className = "snip-item";
    d.innerHTML = `<div class="snip-title">${esc(s.title)}</div><div class="snip-code">${esc(s.code)}</div>`;
    d.addEventListener("click", () => { editor.replaceSelection(s.code + "\n"); editor.focus(); });
    el.appendChild(d);
  });
}

// ── Sidebar ───────────────────────────────────────────────────
function switchSidebar(btn) {
  document.querySelectorAll(".stab").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
  document.querySelectorAll(".sv").forEach(v => v.classList.remove("active"));
  document.getElementById("sv-" + btn.dataset.v).classList.add("active");
}

function toggleSidebar() {
  sidebarOpen = !sidebarOpen;
  document.getElementById("sidebar").classList.toggle("collapsed", !sidebarOpen);
  setTimeout(() => editor.refresh(), 200);
}

// ── Theme ─────────────────────────────────────────────────────
function toggleTheme() {
  currentTheme = currentTheme === "dark" ? "light" : "dark";
  applyTheme(currentTheme);
}
function applyTheme(t) {
  currentTheme = t;
  document.documentElement.setAttribute("data-theme", t);
  const cmTheme = t === "dark" ? "one-dark" : "eclipse";
  if (editor)    editor.setOption("theme", cmTheme);
  if (docEditor) docEditor.setOption("theme", cmTheme);
  const btn = document.getElementById("theme-btn");
  if (btn) btn.textContent = t === "dark" ? "☾" : "☀";
  localStorage.setItem("thida-theme", t);
}

// ── Comment toggle ────────────────────────────────────────────
function toggleComment() {
  const sels = editor.listSelections();
  sels.forEach(sel => {
    const from = Math.min(sel.anchor.line, sel.head.line);
    const to   = Math.max(sel.anchor.line, sel.head.line);
    for (let i = from; i <= to; i++) {
      const line = editor.getLine(i);
      if (/^\s*\/\//.test(line)) {
        editor.replaceRange(line.replace(/^(\s*)\/\/\s?/, "$1"),
          { line: i, ch: 0 }, { line: i, ch: line.length });
      } else {
        editor.replaceRange("// " + line,
          { line: i, ch: 0 }, { line: i, ch: line.length });
      }
    }
  });
}

// ── Dirty tracking ────────────────────────────────────────────
function markDirty() {
  if (!isDirty) { isDirty = true; updateDirtyUI(); }
}
function updateDirtyUI() {
  const show = isDirty ? "" : "none";
  const el1 = document.getElementById("tb-dirty");
  const el2 = document.getElementById("phead-dirty");
  if (el1) el1.style.display = show;
  if (el2) el2.style.display = show;
}
function setFilename(name) {
  const el1 = document.getElementById("tb-filename");
  const el2 = document.getElementById("phead-filename");
  if (el1) el1.textContent = name;
  if (el2) el2.textContent = name;
}

// ── Status ────────────────────────────────────────────────────
function setStatus(state, text) {
  const dot  = document.getElementById("run-dot");
  const txt  = document.getElementById("run-text");
  if (dot) { dot.className = "run-dot " + state; }
  if (txt) txt.textContent = text;
}

// ── Clear all ─────────────────────────────────────────────────
function clearAll() {
  clearConsole();
  clearPlots();
  loadedTables = {};
  activeTable  = null;
  document.getElementById("data-tab-btns").innerHTML = "";
  const body = document.getElementById("data-body");
  body.innerHTML = `
    <div class="pempty">
      <div class="pe-icon">🗃</div>
      <div class="pe-msg">Load a dataset to view it here</div>
      <div class="pe-hint"><code>("students") ကိုဖတ်ပါ</code></div>
    </div>`;
  body.style.display = "";
}

// ── Panel resize (drag) ───────────────────────────────────────
function setupResize() {
  const panels = document.getElementById("panels");

  // Vertical resize (left/right column widths)
  document.querySelectorAll(".vresize").forEach(handle => {
    let startX, startFr;
    handle.addEventListener("mousedown", e => {
      e.preventDefault();
      handle.classList.add("dragging");
      startX = e.clientX;
      const cols = getComputedStyle(panels).gridTemplateColumns.split(" ");
      startFr = parseFloat(cols[0]);
      const onMove = ev => {
        const dx     = ev.clientX - startX;
        const total  = panels.offsetWidth - 4; // minus resize bar
        const newPx  = Math.max(200, Math.min(total - 200, startFr + dx));
        const pct    = (newPx / total * 100).toFixed(1);
        panels.style.gridTemplateColumns = `${pct}% 4px 1fr`;
        editor.refresh();
      };
      const onUp = () => {
        handle.classList.remove("dragging");
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        editor.refresh();
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    });
  });

  // Horizontal resize (top/bottom row heights)
  const hhandle = document.getElementById("hresize");
  if (hhandle) {
    let startY, startPx;
    hhandle.addEventListener("mousedown", e => {
      e.preventDefault();
      hhandle.classList.add("dragging");
      startY = e.clientY;
      const rows = getComputedStyle(panels).gridTemplateRows.split(" ");
      startPx = parseFloat(rows[0]);
      const onMove = ev => {
        const dy    = ev.clientY - startY;
        const total = panels.offsetHeight - 4;
        const newPx = Math.max(120, Math.min(total - 120, startPx + dy));
        const pct   = (newPx / total * 100).toFixed(1);
        panels.style.gridTemplateRows = `${pct}% 4px 1fr`;
        editor.refresh();
      };
      const onUp = () => {
        hhandle.classList.remove("dragging");
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        editor.refresh();
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    });
  }
}

// ── Utility ───────────────────────────────────────────────────
function esc(s) {
  return String(s || "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
