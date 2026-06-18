/* ══════════════════════════════════════════════════════════════════════════
   Project M.E.S.S.I — CMS Admin
══════════════════════════════════════════════════════════════════════════ */

/* ── API helper ─────────────────────────────────────────────────────────── */
async function api(url, opts = {}) {
  const r = await fetch(url, { credentials: 'include', ...opts });
  const data = await r.json().catch(() => ({}));
  if (r.status === 401) { showLogin(); throw new Error('Session expired — please sign in again'); }
  if (!r.ok) throw new Error(data.error || r.statusText);
  return data;
}

async function uploadImage(file) {
  const fd = new FormData();
  fd.append('image', file);
  const r = await fetch('/api/admin/upload', { credentials: 'include', method: 'POST', body: fd });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || 'Upload failed');
  return data.url;
}

/* ── Auth ───────────────────────────────────────────────────────────────── */
function showLogin() {
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('admin-app').style.display = 'none';
}
function showApp() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('admin-app').style.display = 'flex';
  initApp();
}

document.getElementById('login-form').addEventListener('submit', async e => {
  e.preventDefault();
  const btn = document.getElementById('login-btn');
  const err = document.getElementById('login-error');
  btn.textContent = 'Signing in…'; btn.disabled = true; err.textContent = '';
  try {
    await api('/api/admin/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: document.getElementById('login-user').value, password: document.getElementById('login-pass').value })
    });
    showApp();
  } catch {
    err.textContent = 'Invalid username or password.';
    btn.textContent = 'Sign in'; btn.disabled = false;
  }
});

document.getElementById('logout-btn').addEventListener('click', async () => {
  await api('/api/admin/logout', { method: 'POST' }).catch(() => {});
  showLogin();
});

/* ── Init ───────────────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', async () => {
  const { authenticated } = await api('/api/admin/check');
  if (authenticated) showApp(); else showLogin();
});

let articleQuill, guideQuill;
let allCategories = [];

function initApp() {
  setupSidebarNav();
  initQuillEditors();
  setupSettingsForms();
  setupModalImageUploads();
  setupEpCoverUploads();

  loadCategories();
  loadDatasets();
  loadArticles();
  loadGuides();
  loadCaseStudies();
  loadSubmissions();
  loadSettings();

  // dataset modal
  document.getElementById('add-dataset-btn').addEventListener('click', openAddDataset);
  document.getElementById('dataset-modal-close').addEventListener('click', closeDatasetModal);
  document.getElementById('dataset-modal').addEventListener('click', e => { if (e.target.id === 'dataset-modal') closeDatasetModal(); });
  document.getElementById('dataset-form').addEventListener('submit', saveDataset);

  // category modal
  document.getElementById('add-category-btn').addEventListener('click', openAddCategory);
  document.getElementById('category-modal-close').addEventListener('click', closeCategoryModal);
  document.getElementById('category-modal').addEventListener('click', e => { if (e.target.id === 'category-modal') closeCategoryModal(); });
  document.getElementById('category-form').addEventListener('submit', saveCategory);

  // case study modal
  document.getElementById('add-cs-btn').addEventListener('click', openAddCs);
  document.getElementById('cs-modal-close').addEventListener('click', closeCsModal);
  document.getElementById('cs-modal').addEventListener('click', e => { if (e.target.id === 'cs-modal') closeCsModal(); });
  document.getElementById('cs-form').addEventListener('submit', saveCs);

  // article / guide new
  document.getElementById('add-article-btn').addEventListener('click', () => openArticleEditor(null));
  document.getElementById('add-guide-btn').addEventListener('click', () => openGuideEditor(null));

  // editor save buttons
  document.getElementById('art-ep-save-btn').addEventListener('click', saveArticle);
  document.getElementById('guide-ep-save-btn').addEventListener('click', saveGuide);

  // search / filter
  let dsTimer;
  document.getElementById('ds-search').addEventListener('input', e => {
    clearTimeout(dsTimer);
    dsTimer = setTimeout(() => loadDatasets(e.target.value, document.getElementById('ds-filter-cat').value), 300);
  });
  document.getElementById('ds-filter-cat').addEventListener('change', e => {
    loadDatasets(document.getElementById('ds-search').value, e.target.value);
  });

  // submissions filter
  document.getElementById('sub-filter-status').addEventListener('change', e => {
    renderSubmissions(e.target.value ? _allSubs.filter(s => s.status === e.target.value) : _allSubs);
  });
}

/* ── Sidebar nav ─────────────────────────────────────────────────────────── */
function setupSidebarNav() {
  document.querySelectorAll('.admin-nav-item').forEach(item => {
    item.addEventListener('click', e => {
      e.preventDefault();
      switchToSection(item.dataset.section);
    });
  });
}

function switchToSection(sectionId) {
  // hide any open editors
  document.getElementById('article-editor').style.display = 'none';
  document.getElementById('guide-editor').style.display = 'none';

  document.querySelectorAll('.admin-nav-item').forEach(i => i.classList.remove('active'));
  document.querySelector(`[data-section="${sectionId}"]`)?.classList.add('active');
  document.querySelectorAll('.admin-section').forEach(s => s.classList.remove('active'));
  document.getElementById(`section-${sectionId}`)?.classList.add('active');
}

/* ── Quill editors ───────────────────────────────────────────────────────── */
function initQuillEditors() {
  const toolbarOptions = [
    [{ header: [2, 3, 4, false] }],
    ['bold', 'italic', 'underline', 'strike'],
    ['blockquote', 'code-block'],
    [{ list: 'ordered' }, { list: 'bullet' }],
    ['link', 'image'],
    ['clean']
  ];

  articleQuill = new Quill('#art-quill', {
    theme: 'snow',
    placeholder: 'Write your article content here…',
    modules: { toolbar: { container: toolbarOptions, handlers: { image: () => quillImageHandler(articleQuill) } } }
  });

  guideQuill = new Quill('#guide-quill', {
    theme: 'snow',
    placeholder: 'Write your guide content here…',
    modules: { toolbar: { container: toolbarOptions, handlers: { image: () => quillImageHandler(guideQuill) } } }
  });
}

async function quillImageHandler(quill) {
  const input = document.createElement('input');
  input.type = 'file'; input.accept = 'image/*';
  input.click();
  input.onchange = async () => {
    const file = input.files[0]; if (!file) return;
    toast('Uploading image…');
    try {
      const url = await uploadImage(file);
      const range = quill.getSelection(true);
      quill.insertEmbed(range.index, 'image', url, Quill.sources.USER);
      quill.setSelection(range.index + 1, Quill.sources.SILENT);
      toast('Image inserted');
    } catch (err) { toast('Upload failed: ' + err.message, true); }
  };
}

/* ── Editor panel: cover image uploads ──────────────────────────────────── */
function setupEpCoverUploads() {
  setupEpCoverInput('art');
  setupEpCoverInput('guide');
}

function setupEpCoverInput(prefix) {
  const input = document.getElementById(`${prefix}-ep-cover-file`);
  if (!input) return;
  input.addEventListener('change', async () => {
    const file = input.files[0]; if (!file) return;
    const label = document.getElementById(`${prefix}-cover-upload-label`);
    const textEl = document.getElementById(`${prefix}-cover-upload-text`);
    label.classList.add('uploading'); textEl.textContent = 'Uploading…';
    try {
      const url = await uploadImage(file);
      setEpCover(prefix, url);
      toast('Cover image uploaded');
    } catch (err) { toast(err.message, true); }
    label.classList.remove('uploading'); textEl.textContent = 'Upload cover image';
    input.value = '';
  });
}

function setEpCover(prefix, url) {
  document.getElementById(`${prefix}-ep-cover-image`).value = url || '';
  const preview = document.getElementById(`${prefix}-ep-cover-preview`);
  const img = document.getElementById(`${prefix}-ep-cover-img`);
  if (url) { img.src = url; preview.style.display = 'block'; }
  else { preview.style.display = 'none'; }
}

window.removeCoverEp = prefix => setEpCover(prefix, '');

/* ── Modal image uploads ─────────────────────────────────────────────────── */
function setupModalImageUploads() {
  ['ds', 'cs'].forEach(prefix => {
    const input = document.getElementById(`${prefix}-img-file`);
    if (!input) return;
    input.addEventListener('change', async () => {
      const file = input.files[0]; if (!file) return;
      const label = document.getElementById(`${prefix}-upload-label`);
      const textEl = document.getElementById(`${prefix}-upload-text`);
      label.classList.add('uploading'); textEl.textContent = 'Uploading…';
      try {
        const url = await uploadImage(file);
        setModalImage(prefix, url);
        toast('Image uploaded');
      } catch (err) { toast(err.message, true); }
      label.classList.remove('uploading'); textEl.textContent = 'Upload image';
      input.value = '';
    });
  });
}

function setModalImage(prefix, url) {
  const hidden = document.getElementById(`${prefix}-cover-image`);
  const preview = document.getElementById(`${prefix}-img-preview`);
  const removeBtn = document.getElementById(`${prefix}-img-remove`);
  if (url) {
    hidden.value = url;
    preview.innerHTML = `<img src="${url}" alt="cover" />`;
    preview.classList.add('has-img');
    removeBtn.style.display = 'inline-block';
  } else {
    hidden.value = ''; preview.innerHTML = '';
    preview.classList.remove('has-img'); removeBtn.style.display = 'none';
  }
}

window.removeModalImage = prefix => setModalImage(prefix, '');

/* ══════════════════════════════════════════════════════════════════════════
   DATASETS
══════════════════════════════════════════════════════════════════════════ */
async function loadDatasets(q = '', catId = '') {
  try {
    const params = new URLSearchParams({ limit: 200 });
    if (q) params.set('q', q);
    if (catId) params.set('category', catId);
    const { datasets, total } = await api(`/api/admin/datasets?${params}`);
    document.getElementById('ds-count-label').textContent = `${total} total`;
    const tbody = document.getElementById('datasets-tbody');
    const empty = document.getElementById('ds-empty');
    if (!datasets.length) { tbody.innerHTML = ''; empty.style.display = 'block'; return; }
    empty.style.display = 'none';
    tbody.innerHTML = datasets.map(d => `
      <tr>
        <td class="td-title">
          <div class="td-title-text">${escHtml(d.title)}</div>
          ${d.cover_image ? '<span style="font-size:11px;color:var(--ink-lt)">📷 image</span>' : ''}
        </td>
        <td><span class="td-cat" style="color:${getCatColor(d.category_id)}">
          <span class="td-cat-dot" style="background:${getCatColor(d.category_id)}"></span>
          ${escHtml(d.category_name || '—')}</span></td>
        <td style="color:var(--ink-lt)">${escHtml(d.source || '—')}</td>
        <td style="color:var(--ink-lt)">${escHtml(d.year || '—')}</td>
        <td>${d.featured ? '<span class="badge-featured">Featured</span>' : ''}</td>
        <td><div class="td-actions">
          <button class="a-btn-icon" title="Edit" onclick="openEditDataset(${d.id})">
            <svg viewBox="0 0 16 16" fill="none"><path d="M11.5 2.5l2 2-8 8H3.5v-2l8-8z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>
          </button>
          <button class="a-btn-icon" title="Delete" onclick="confirmDelete('Delete &quot;${escAttr(d.title)}&quot;? This cannot be undone.', () => deleteDataset(${d.id}))">
            <svg viewBox="0 0 16 16" fill="none"><path d="M3 4h10M6 4V3h4v1M5 4v8h6V4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
        </div></td>
      </tr>`).join('');
  } catch (err) { toast(err.message, true); }
}

function getCatColor(catId) {
  return allCategories.find(c => c.id === catId)?.color || '#888';
}

function openAddDataset() {
  document.getElementById('dataset-modal-title').textContent = 'Add dataset';
  document.getElementById('ds-save-btn').textContent = 'Add dataset';
  document.getElementById('dataset-form').reset();
  document.getElementById('ds-id').value = '';
  setModalImage('ds', '');
  document.getElementById('dataset-modal').classList.add('open');
}

window.openEditDataset = async id => {
  try {
    const d = await api(`/api/admin/datasets/${id}`);
    document.getElementById('dataset-modal-title').textContent = 'Edit dataset';
    document.getElementById('ds-save-btn').textContent = 'Save changes';
    const f = document.getElementById('dataset-form');
    f.reset();
    f.elements['id'].value = d.id;
    f.elements['title'].value = d.title || '';
    f.elements['description'].value = d.description || '';
    f.elements['category_id'].value = d.category_id || '';
    f.elements['source'].value = d.source || '';
    f.elements['source_url'].value = d.source_url || '';
    f.elements['license'].value = d.license || '';
    f.elements['data_types'].value = d.data_types || '';
    f.elements['tags'].value = d.tags || '';
    f.elements['label'].value = d.label || '';
    f.elements['year'].value = d.year || '';
    document.getElementById('ds-featured').checked = !!d.featured;
    setModalImage('ds', d.cover_image || '');
    document.getElementById('dataset-modal').classList.add('open');
  } catch (err) { toast(err.message, true); }
};

window.closeDatasetModal = () => { document.getElementById('dataset-modal').classList.remove('open'); };

async function saveDataset(e) {
  e.preventDefault();
  const f = e.target;
  const btn = document.getElementById('ds-save-btn');
  const id = f.elements['id'].value;
  btn.textContent = 'Saving…'; btn.disabled = true;
  const body = {
    title: f.elements['title'].value, description: f.elements['description'].value,
    category_id: f.elements['category_id'].value || null, source: f.elements['source'].value,
    source_url: f.elements['source_url'].value, license: f.elements['license'].value,
    data_types: f.elements['data_types'].value, tags: f.elements['tags'].value,
    label: f.elements['label'].value, year: f.elements['year'].value,
    featured: document.getElementById('ds-featured').checked,
    cover_image: document.getElementById('ds-cover-image').value || null
  };
  try {
    if (id) { await api(`/api/admin/datasets/${id}`, jsonPut(body)); toast('Dataset updated'); }
    else { await api('/api/admin/datasets', jsonPost(body)); toast('Dataset added'); }
    closeDatasetModal();
    loadDatasets(document.getElementById('ds-search').value, document.getElementById('ds-filter-cat').value);
  } catch (err) { toast(err.message, true); }
  btn.textContent = id ? 'Save changes' : 'Add dataset'; btn.disabled = false;
}

async function deleteDataset(id) {
  try { await api(`/api/admin/datasets/${id}`, { method: 'DELETE' }); toast('Dataset deleted'); loadDatasets(); }
  catch (err) { toast(err.message, true); }
}

/* ══════════════════════════════════════════════════════════════════════════
   CATEGORIES
══════════════════════════════════════════════════════════════════════════ */
async function loadCategories() {
  try {
    const cats = await api('/api/admin/categories');
    allCategories = cats;

    const filterSel = document.getElementById('ds-filter-cat');
    filterSel.innerHTML = '<option value="">All categories</option>' +
      cats.map(c => `<option value="${c.id}">${escHtml(c.name)}</option>`).join('');

    const dsSel = document.getElementById('ds-cat-select');
    dsSel.innerHTML = '<option value="">No category</option>' +
      cats.map(c => `<option value="${c.id}">${escHtml(c.name)}</option>`).join('');

    const tbody = document.getElementById('categories-tbody');
    tbody.innerHTML = cats.map(c => `
      <tr>
        <td style="font-weight:500">${escHtml(c.name)}</td>
        <td style="color:var(--ink-lt);font-family:monospace;font-size:12px">${escHtml(c.slug)}</td>
        <td><span style="display:inline-flex;align-items:center;gap:7px">
          <span style="width:14px;height:14px;border-radius:50%;background:${c.color};display:inline-block;flex-shrink:0"></span>
          <span style="font-size:12px;font-family:monospace;color:var(--ink-lt)">${c.color}</span>
        </span></td>
        <td>${c.count}</td>
        <td><div class="td-actions">
          <button class="a-btn-icon" onclick="openEditCategory(${c.id})">
            <svg viewBox="0 0 16 16" fill="none"><path d="M11.5 2.5l2 2-8 8H3.5v-2l8-8z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>
          </button>
          <button class="a-btn-icon" onclick="confirmDelete('Delete category &quot;${escAttr(c.name)}&quot;? All datasets in it will be uncategorized.', () => deleteCategory(${c.id}))">
            <svg viewBox="0 0 16 16" fill="none"><path d="M3 4h10M6 4V3h4v1M5 4v8h6V4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
        </div></td>
      </tr>`).join('');
  } catch (err) { toast(err.message, true); }
}

function openAddCategory() {
  document.getElementById('cat-modal-title').textContent = 'Add category';
  document.getElementById('category-form').reset();
  document.getElementById('cat-id').value = '';
  document.getElementById('category-modal').classList.add('open');
}
window.openEditCategory = async id => {
  const c = allCategories.find(x => x.id === id);
  if (!c) return;
  document.getElementById('cat-modal-title').textContent = 'Edit category';
  const f = document.getElementById('category-form');
  f.reset();
  f.elements['id'].value = c.id;
  f.elements['name'].value = c.name;
  f.elements['slug'].value = c.slug;
  f.elements['color'].value = c.color;
  document.getElementById('category-modal').classList.add('open');
};
window.closeCategoryModal = () => document.getElementById('category-modal').classList.remove('open');

async function saveCategory(e) {
  e.preventDefault();
  const f = e.target;
  const id = f.elements['id'].value;
  const body = { name: f.elements['name'].value, slug: f.elements['slug'].value, color: f.elements['color'].value };
  try {
    if (id) { await api(`/api/admin/categories/${id}`, jsonPut(body)); toast('Category updated'); }
    else { await api('/api/admin/categories', jsonPost(body)); toast('Category added'); }
    closeCategoryModal(); loadCategories();
  } catch (err) { toast(err.message, true); }
}
async function deleteCategory(id) {
  try { await api(`/api/admin/categories/${id}`, { method: 'DELETE' }); toast('Category deleted'); loadCategories(); }
  catch (err) { toast(err.message, true); }
}

/* ══════════════════════════════════════════════════════════════════════════
   ARTICLES — full-page editor
══════════════════════════════════════════════════════════════════════════ */
async function loadArticles() {
  try {
    const rows = await api('/api/admin/articles');
    document.getElementById('art-count-label').textContent = `${rows.length} total`;
    const tbody = document.getElementById('articles-tbody');
    const empty = document.getElementById('art-empty');
    if (!rows.length) { tbody.innerHTML = ''; empty.style.display = 'block'; return; }
    empty.style.display = 'none';
    tbody.innerHTML = rows.map(a => `
      <tr>
        <td class="td-title">
          <div class="td-title-text">${escHtml(a.title)}${a.label ? `<span class="badge-label">${escHtml(a.label)}</span>` : ''}</div>
        </td>
        <td>${a.tag ? `<span class="badge-featured">${escHtml(a.tag)}</span>` : '<span style="color:var(--ink-lt)">—</span>'}</td>
        <td style="color:var(--ink-lt)">${escHtml(a.author || '—')}</td>
        <td>${a.published ? '<span class="badge-published">Published</span>' : '<span class="badge-draft">Draft</span>'}</td>
        <td style="color:var(--ink-lt);font-size:12.5px">${fmtDate(a.created_at)}</td>
        <td><div class="td-actions">
          <button class="a-btn-icon" title="Edit" onclick="openArticleEditor(${a.id})">
            <svg viewBox="0 0 16 16" fill="none"><path d="M11.5 2.5l2 2-8 8H3.5v-2l8-8z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>
          </button>
          <button class="a-btn-icon" title="Delete" onclick="confirmDelete('Delete article &quot;${escAttr(a.title)}&quot;?', () => deleteArticle(${a.id}))">
            <svg viewBox="0 0 16 16" fill="none"><path d="M3 4h10M6 4V3h4v1M5 4v8h6V4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
        </div></td>
      </tr>`).join('');
  } catch (err) { toast(err.message, true); }
}

async function openArticleEditor(id) {
  // Clear state
  document.getElementById('art-ep-id').value = '';
  document.getElementById('art-ep-title').value = '';
  document.getElementById('art-ep-excerpt').value = '';
  document.getElementById('art-ep-slug').value = '';
  document.getElementById('art-ep-author').value = 'MM Data Directories';
  document.getElementById('art-ep-tag').value = '';
  document.getElementById('art-ep-label').value = '';
  document.getElementById('art-ep-published').checked = true;
  articleQuill.setContents([]);
  setEpCover('art', '');

  if (id) {
    try {
      const a = await api(`/api/admin/articles/${id}`);
      document.getElementById('art-ep-id').value = a.id;
      document.getElementById('art-ep-title').value = a.title || '';
      document.getElementById('art-ep-excerpt').value = a.excerpt || '';
      document.getElementById('art-ep-slug').value = a.slug || '';
      document.getElementById('art-ep-author').value = a.author || 'MM Data Directories';
      document.getElementById('art-ep-tag').value = a.tag || '';
      document.getElementById('art-ep-label').value = a.label || '';
      document.getElementById('art-ep-published').checked = !!a.published;
      articleQuill.clipboard.dangerouslyPasteHTML(a.content || '');
      setEpCover('art', a.cover_image || '');
    } catch (err) { toast(err.message, true); return; }
  }

  // Show editor, hide list sections
  document.querySelectorAll('.admin-section').forEach(s => s.classList.remove('active'));
  document.getElementById('guide-editor').style.display = 'none';
  document.getElementById('article-editor').style.display = 'flex';
  document.getElementById('art-ep-title').focus();
}

window.closeArticleEditor = () => {
  document.getElementById('article-editor').style.display = 'none';
  switchToSection('articles');
};

async function saveArticle() {
  const btn = document.getElementById('art-ep-save-btn');
  const saving = document.getElementById('art-ep-saving');
  btn.textContent = 'Saving…'; btn.disabled = true; saving.textContent = 'Saving…';

  const id = document.getElementById('art-ep-id').value;
  const title = document.getElementById('art-ep-title').value.trim();
  if (!title) { toast('Title is required', true); btn.textContent = 'Save'; btn.disabled = false; saving.textContent = ''; return; }

  const body = {
    title,
    excerpt: document.getElementById('art-ep-excerpt').value,
    content: articleQuill.root.innerHTML,
    slug: document.getElementById('art-ep-slug').value,
    author: document.getElementById('art-ep-author').value,
    tag: document.getElementById('art-ep-tag').value,
    label: document.getElementById('art-ep-label').value,
    cover_image: document.getElementById('art-ep-cover-image').value || null,
    published: document.getElementById('art-ep-published').checked
  };

  try {
    if (id) {
      await api(`/api/admin/articles/${id}`, jsonPut(body));
      toast('Article saved');
    } else {
      const res = await api('/api/admin/articles', jsonPost(body));
      document.getElementById('art-ep-id').value = res.id;
      toast('Article created');
    }
    saving.textContent = 'Saved';
    setTimeout(() => { saving.textContent = ''; }, 2000);
    loadArticles();
  } catch (err) { toast(err.message, true); saving.textContent = ''; }
  btn.textContent = 'Save'; btn.disabled = false;
}

async function deleteArticle(id) {
  try { await api(`/api/admin/articles/${id}`, { method: 'DELETE' }); toast('Article deleted'); loadArticles(); }
  catch (err) { toast(err.message, true); }
}

/* ══════════════════════════════════════════════════════════════════════════
   GUIDES — full-page editor
══════════════════════════════════════════════════════════════════════════ */
async function loadGuides() {
  try {
    const rows = await api('/api/admin/guides');
    document.getElementById('guides-count-label').textContent = `${rows.length} total`;
    const tbody = document.getElementById('guides-tbody');
    const empty = document.getElementById('guides-empty');
    if (!rows.length) { tbody.innerHTML = ''; empty.style.display = 'block'; return; }
    empty.style.display = 'none';
    const diffColor = { Beginner: '#0e7a5f', Intermediate: '#1a4a8a', Advanced: '#c0392b' };
    tbody.innerHTML = rows.map(g => `
      <tr>
        <td class="td-title">
          <div class="td-title-text">${escHtml(g.title)}</div>
          ${g.cover_image ? '<span style="font-size:11px;color:var(--ink-lt)">📷 image</span>' : ''}
        </td>
        <td><span class="badge-featured">${escHtml(g.section)}</span></td>
        <td><span style="font-size:12px;font-weight:600;color:${diffColor[g.difficulty]||'#555'}">${escHtml(g.difficulty)}</span></td>
        <td style="color:var(--ink-lt);font-size:13px">${g.sort_order}</td>
        <td>${g.published ? '<span class="badge-published">Published</span>' : '<span class="badge-draft">Draft</span>'}</td>
        <td><div class="td-actions">
          <button class="a-btn-icon" title="Edit" onclick="openGuideEditor(${g.id})">
            <svg viewBox="0 0 16 16" fill="none"><path d="M11.5 2.5l2 2-8 8H3.5v-2l8-8z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>
          </button>
          <button class="a-btn-icon" title="Delete" onclick="confirmDelete('Delete guide &quot;${escAttr(g.title)}&quot;?', () => deleteGuide(${g.id}))">
            <svg viewBox="0 0 16 16" fill="none"><path d="M3 4h10M6 4V3h4v1M5 4v8h6V4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
        </div></td>
      </tr>`).join('');
  } catch (err) { toast(err.message, true); }
}

async function openGuideEditor(id) {
  document.getElementById('guide-ep-id').value = '';
  document.getElementById('guide-ep-title').value = '';
  document.getElementById('guide-ep-excerpt').value = '';
  document.getElementById('guide-ep-slug').value = '';
  document.getElementById('guide-ep-section').value = 'Myanmar NLP';
  document.getElementById('guide-ep-difficulty').value = 'Beginner';
  document.getElementById('guide-ep-sort').value = '0';
  document.getElementById('guide-ep-published').checked = true;
  guideQuill.setContents([]);
  setEpCover('guide', '');

  if (id) {
    try {
      const g = await api(`/api/admin/guides/${id}`);
      document.getElementById('guide-ep-id').value = g.id;
      document.getElementById('guide-ep-title').value = g.title || '';
      document.getElementById('guide-ep-excerpt').value = g.excerpt || '';
      document.getElementById('guide-ep-slug').value = g.slug || '';
      document.getElementById('guide-ep-section').value = g.section || 'Myanmar NLP';
      document.getElementById('guide-ep-difficulty').value = g.difficulty || 'Beginner';
      document.getElementById('guide-ep-sort').value = g.sort_order ?? 0;
      document.getElementById('guide-ep-published').checked = !!g.published;
      guideQuill.clipboard.dangerouslyPasteHTML(g.content || '');
      setEpCover('guide', g.cover_image || '');
    } catch (err) { toast(err.message, true); return; }
  }

  document.querySelectorAll('.admin-section').forEach(s => s.classList.remove('active'));
  document.getElementById('article-editor').style.display = 'none';
  document.getElementById('guide-editor').style.display = 'flex';
  document.getElementById('guide-ep-title').focus();
}

window.closeGuideEditor = () => {
  document.getElementById('guide-editor').style.display = 'none';
  switchToSection('guides');
};

async function saveGuide() {
  const btn = document.getElementById('guide-ep-save-btn');
  const saving = document.getElementById('guide-ep-saving');
  btn.textContent = 'Saving…'; btn.disabled = true; saving.textContent = 'Saving…';

  const id = document.getElementById('guide-ep-id').value;
  const title = document.getElementById('guide-ep-title').value.trim();
  if (!title) { toast('Title is required', true); btn.textContent = 'Save'; btn.disabled = false; saving.textContent = ''; return; }

  let slug = document.getElementById('guide-ep-slug').value.trim();
  if (!slug) slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  const body = {
    title, slug,
    excerpt: document.getElementById('guide-ep-excerpt').value,
    content: guideQuill.root.innerHTML,
    section: document.getElementById('guide-ep-section').value,
    difficulty: document.getElementById('guide-ep-difficulty').value,
    sort_order: parseInt(document.getElementById('guide-ep-sort').value) || 0,
    cover_image: document.getElementById('guide-ep-cover-image').value || null,
    published: document.getElementById('guide-ep-published').checked
  };

  try {
    if (id) {
      await api(`/api/admin/guides/${id}`, jsonPut(body));
      toast('Guide saved');
    } else {
      const res = await api('/api/admin/guides', jsonPost(body));
      document.getElementById('guide-ep-id').value = res.id;
      toast('Guide created');
    }
    saving.textContent = 'Saved';
    setTimeout(() => { saving.textContent = ''; }, 2000);
    loadGuides();
  } catch (err) { toast(err.message, true); saving.textContent = ''; }
  btn.textContent = 'Save'; btn.disabled = false;
}

async function deleteGuide(id) {
  try { await api(`/api/admin/guides/${id}`, { method: 'DELETE' }); toast('Guide deleted'); loadGuides(); }
  catch (err) { toast(err.message, true); }
}

/* ══════════════════════════════════════════════════════════════════════════
   CASE STUDIES
══════════════════════════════════════════════════════════════════════════ */
async function loadCaseStudies() {
  try {
    const rows = await api('/api/admin/case-studies');
    document.getElementById('cs-count-label').textContent = `${rows.length} total`;
    const tbody = document.getElementById('cs-tbody');
    const empty = document.getElementById('cs-empty');
    if (!rows.length) { tbody.innerHTML = ''; empty.style.display = 'block'; return; }
    empty.style.display = 'none';
    tbody.innerHTML = rows.map(c => `
      <tr>
        <td class="td-title"><div class="td-title-text">${escHtml(c.title)}</div></td>
        <td>${c.tag ? `<span class="badge-featured">${escHtml(c.tag)}</span>` : '—'}</td>
        <td style="color:var(--ink-lt)">${escHtml(c.org || '—')}</td>
        <td style="color:var(--ink-lt)">${escHtml(c.year || '—')}</td>
        <td>${c.published ? '<span class="badge-published">Published</span>' : '<span class="badge-draft">Draft</span>'}</td>
        <td><div class="td-actions">
          <button class="a-btn-icon" title="Edit" onclick="openEditCs(${c.id})">
            <svg viewBox="0 0 16 16" fill="none"><path d="M11.5 2.5l2 2-8 8H3.5v-2l8-8z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>
          </button>
          <button class="a-btn-icon" title="Delete" onclick="confirmDelete('Delete case study &quot;${escAttr(c.title)}&quot;?', () => deleteCaseStudy(${c.id}))">
            <svg viewBox="0 0 16 16" fill="none"><path d="M3 4h10M6 4V3h4v1M5 4v8h6V4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
        </div></td>
      </tr>`).join('');
  } catch (err) { toast(err.message, true); }
}

function openAddCs() {
  document.getElementById('cs-modal-title').textContent = 'Add case study';
  document.getElementById('cs-save-btn').textContent = 'Add case study';
  document.getElementById('cs-form').reset();
  document.getElementById('cs-id').value = '';
  document.getElementById('cs-published').checked = true;
  setModalImage('cs', '');
  document.getElementById('cs-modal').classList.add('open');
}
window.openEditCs = async id => {
  try {
    const rows = await api('/api/admin/case-studies');
    const c = rows.find(r => r.id === id);
    if (!c) return;
    document.getElementById('cs-modal-title').textContent = 'Edit case study';
    document.getElementById('cs-save-btn').textContent = 'Save changes';
    const f = document.getElementById('cs-form');
    f.reset();
    f.elements['id'].value = c.id;
    f.elements['title'].value = c.title || '';
    f.elements['tag'].value = c.tag || '';
    f.elements['org'].value = c.org || '';
    f.elements['year'].value = c.year || '';
    f.elements['datasets_used'].value = c.datasets_used || '';
    f.elements['excerpt'].value = c.excerpt || '';
    document.getElementById('cs-published').checked = !!c.published;
    setModalImage('cs', c.cover_image || '');
    document.getElementById('cs-modal').classList.add('open');
  } catch (err) { toast(err.message, true); }
};
window.closeCsModal = () => document.getElementById('cs-modal').classList.remove('open');

async function saveCs(e) {
  e.preventDefault();
  const f = e.target;
  const btn = document.getElementById('cs-save-btn');
  const id = f.elements['id'].value;
  btn.textContent = 'Saving…'; btn.disabled = true;
  const body = {
    title: f.elements['title'].value, tag: f.elements['tag'].value,
    org: f.elements['org'].value, year: f.elements['year'].value,
    datasets_used: f.elements['datasets_used'].value, excerpt: f.elements['excerpt'].value,
    cover_image: document.getElementById('cs-cover-image').value || null,
    published: document.getElementById('cs-published').checked
  };
  try {
    if (id) { await api(`/api/admin/case-studies/${id}`, jsonPut(body)); toast('Case study updated'); }
    else { await api('/api/admin/case-studies', jsonPost(body)); toast('Case study added'); }
    closeCsModal(); loadCaseStudies();
  } catch (err) { toast(err.message, true); }
  btn.textContent = id ? 'Save changes' : 'Add case study'; btn.disabled = false;
}
async function deleteCaseStudy(id) {
  try { await api(`/api/admin/case-studies/${id}`, { method: 'DELETE' }); toast('Case study deleted'); loadCaseStudies(); }
  catch (err) { toast(err.message, true); }
}

/* ══════════════════════════════════════════════════════════════════════════
   SUBMISSIONS
══════════════════════════════════════════════════════════════════════════ */
let _allSubs = [];
async function loadSubmissions() {
  try {
    _allSubs = await api('/api/admin/submissions');
    const pending = _allSubs.filter(s => s.status === 'pending').length;
    const badge = document.getElementById('submissions-badge');
    badge.textContent = pending; badge.style.display = pending > 0 ? 'inline-block' : 'none';
    renderSubmissions(_allSubs);
  } catch (err) { toast(err.message, true); }
}
function renderSubmissions(rows) {
  const tbody = document.getElementById('submissions-tbody');
  const empty = document.getElementById('sub-empty');
  if (!rows.length) { tbody.innerHTML = ''; empty.style.display = 'block'; return; }
  empty.style.display = 'none';
  tbody.innerHTML = rows.map(s => `
    <tr>
      <td class="td-title"><div class="td-title-text">${escHtml(s.title)}</div></td>
      <td><a href="${escAttr(s.url)}" target="_blank" class="sub-url">View ↗</a></td>
      <td style="color:var(--ink-lt)">${escHtml(s.source || '—')}</td>
      <td style="color:var(--ink-lt)">${escHtml(s.category || '—')}</td>
      <td style="color:var(--ink-lt)">${escHtml(s.email || '—')}</td>
      <td style="color:var(--ink-lt);font-size:12.5px">${new Date(s.created_at).toLocaleDateString('en-GB')}</td>
      <td><span class="badge-status badge-${s.status}">${s.status}</span></td>
      <td><div class="td-actions">
        ${s.status === 'pending'
          ? `<button class="a-btn a-btn-xs a-btn-green" onclick="updateSub(${s.id},'approved')">Approve</button>
             <button class="a-btn a-btn-xs a-btn-ghost" onclick="updateSub(${s.id},'rejected')">Reject</button>`
          : `<button class="a-btn a-btn-xs a-btn-ghost" onclick="updateSub(${s.id},'pending')">Reset</button>`}
        <button class="a-btn-icon" title="Delete" onclick="confirmDelete('Delete this submission?', () => deleteSub(${s.id}))">
          <svg viewBox="0 0 16 16" fill="none"><path d="M3 4h10M6 4V3h4v1M5 4v8h6V4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
      </div></td>
    </tr>`).join('');
}
window.updateSub = async (id, status) => {
  try { await api(`/api/admin/submissions/${id}`, jsonPut({ status })); toast(`Marked as ${status}`); loadSubmissions(); }
  catch (err) { toast(err.message, true); }
};
async function deleteSub(id) {
  try { await api(`/api/admin/submissions/${id}`, { method: 'DELETE' }); toast('Submission deleted'); loadSubmissions(); }
  catch (err) { toast(err.message, true); }
}

/* ══════════════════════════════════════════════════════════════════════════
   SETTINGS
══════════════════════════════════════════════════════════════════════════ */
async function loadSettings() {
  try {
    const s = await api('/api/settings');
    const fill = (formId, keys) => {
      const form = document.getElementById(formId); if (!form) return;
      keys.forEach(k => { if (form[k]) form[k].value = s[k] || ''; });
    };
    fill('settings-form', ['site_title','hero_eyebrow','hero_title','tagline']);
    fill('about-form',    ['about_lead','about_content']);
    fill('footer-form',  ['footer_copy']);
  } catch (err) { toast(err.message, true); }
}

function setupSettingsForms() {
  const save = async (formId, fbId, keys) => {
    const form = document.getElementById(formId);
    const body = {}; keys.forEach(k => { if (form[k]) body[k] = form[k].value; });
    await api('/api/admin/settings', jsonPut(body));
    const fb = document.getElementById(fbId);
    fb.textContent = '✓ Saved'; fb.style.color = 'var(--green)';
    setTimeout(() => { fb.textContent = ''; }, 2500);
  };

  document.getElementById('settings-form').addEventListener('submit', async e => { e.preventDefault(); try { await save('settings-form','settings-feedback',['site_title','hero_eyebrow','hero_title','tagline']); } catch(err) { toast(err.message,true); } });
  document.getElementById('about-form').addEventListener('submit', async e => { e.preventDefault(); try { await save('about-form','about-feedback',['about_lead','about_content']); } catch(err) { toast(err.message,true); } });
  document.getElementById('footer-form').addEventListener('submit', async e => { e.preventDefault(); try { await save('footer-form','footer-feedback',['footer_copy']); } catch(err) { toast(err.message,true); } });

  document.getElementById('pw-form').addEventListener('submit', async e => {
    e.preventDefault();
    const f = e.target; const fb = document.getElementById('pw-feedback');
    try {
      const res = await api('/api/admin/change-password', jsonPost({ currentPassword: f.currentPassword.value, newPassword: f.newPassword.value }));
      fb.style.color = 'var(--green)'; fb.textContent = 'Done! New hash: ' + res.newHash; f.reset();
    } catch { fb.style.color = 'var(--accent)'; fb.textContent = 'Current password is incorrect.'; }
  });
}

/* ══════════════════════════════════════════════════════════════════════════
   CONFIRM MODAL
══════════════════════════════════════════════════════════════════════════ */
window.confirmDelete = (msg, cb) => {
  document.getElementById('confirm-msg').innerHTML = msg;
  document.getElementById('confirm-ok').onclick = () => { closeConfirm(); cb(); };
  document.getElementById('confirm-modal').classList.add('open');
};
window.closeConfirm = () => document.getElementById('confirm-modal').classList.remove('open');
document.getElementById('confirm-modal').addEventListener('click', e => { if (e.target.id === 'confirm-modal') closeConfirm(); });

/* ══════════════════════════════════════════════════════════════════════════
   UTILITIES
══════════════════════════════════════════════════════════════════════════ */
function toast(msg, isError = false) {
  let el = document.querySelector('.a-toast');
  if (!el) { el = document.createElement('div'); el.className = 'a-toast'; document.body.appendChild(el); }
  el.textContent = msg;
  el.classList.toggle('error', isError);
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 3500);
}

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function escHtml(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function escAttr(s) {
  return String(s || '').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function jsonPost(body) { return { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }; }
function jsonPut(body)  { return { method: 'PUT',  headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }; }
