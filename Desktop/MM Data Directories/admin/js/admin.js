/* ── Init ──────────────────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', async () => {
  const { authenticated } = await api('/api/admin/check');
  if (authenticated) showApp();
  else showLogin();
});

/* ── Auth ──────────────────────────────────────────────────────────────────── */
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
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({
        username: document.getElementById('login-user').value,
        password: document.getElementById('login-pass').value
      })
    });
    showApp();
  } catch {
    err.textContent = 'Invalid username or password.';
    btn.textContent = 'Sign in'; btn.disabled = false;
  }
});

document.getElementById('logout-btn').addEventListener('click', async () => {
  await api('/api/admin/logout', { method: 'POST' });
  showLogin();
});

/* ── App Init ──────────────────────────────────────────────────────────────── */
function initApp() {
  setupSidebarNav();
  loadDatasets();
  loadCategories();
  loadArticles();
  loadGuides();
  loadCaseStudies();
  loadSubmissions();
  loadSettings();
  setupDatasetForm();
  setupCategoryForm();
  setupSettingsForms();
  setupSubmissionsFilter();
  setupImageUpload('ds');
  setupImageUpload('art');
}

/* ── Sidebar navigation ────────────────────────────────────────────────────── */
function setupSidebarNav() {
  document.querySelectorAll('.admin-nav-item').forEach(item => {
    item.addEventListener('click', e => {
      e.preventDefault();
      const section = item.dataset.section;
      document.querySelectorAll('.admin-nav-item').forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      document.querySelectorAll('.admin-section').forEach(s => s.classList.remove('active'));
      document.getElementById(`section-${section}`)?.classList.add('active');
    });
  });
}

/* ── Datasets ──────────────────────────────────────────────────────────────── */
let allCategories = [];
let dsSearchTimeout;

async function loadDatasets(q = '', categoryId = '') {
  const params = new URLSearchParams({ limit: 200 });
  if (q) params.set('q', q);
  if (categoryId) params.set('category', categoryId);
  const { datasets, total } = await api(`/api/admin/datasets?${params}`);
  document.getElementById('ds-count-label').textContent = `${total} total datasets`;
  renderDatasetTable(datasets);
}

function renderDatasetTable(datasets) {
  const tbody = document.getElementById('datasets-tbody');
  const empty = document.getElementById('ds-empty');
  if (!datasets.length) { tbody.innerHTML = ''; empty.style.display = 'block'; return; }
  empty.style.display = 'none';
  tbody.innerHTML = datasets.map(d => `
    <tr>
      <td class="td-title"><div class="td-title-text">${escHtml(d.title)}</div></td>
      <td>
        <span class="td-cat" style="color:${getCatColor(d.category_id)}">
          <span class="td-cat-dot" style="background:${getCatColor(d.category_id)}"></span>
          ${escHtml(d.category_name || '—')}
        </span>
      </td>
      <td>${escHtml(d.source || '—')}</td>
      <td>${escHtml(d.year || '—')}</td>
      <td>${d.featured ? '<span class="badge-featured">Featured</span>' : ''}</td>
      <td>
        <div class="td-actions">
          <button class="a-btn-icon" title="Edit" onclick="openEditDataset(${d.id})">
            <svg viewBox="0 0 16 16" fill="none"><path d="M11.5 2.5l2 2-8 8H3.5v-2l8-8z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>
          </button>
          <button class="a-btn-icon" title="Delete" onclick="confirmDeleteDataset(${d.id}, '${escAttr(d.title)}')">
            <svg viewBox="0 0 16 16" fill="none"><path d="M3 4h10M6 4V3h4v1M5 4v8h6V4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
        </div>
      </td>
    </tr>`).join('');
}

function getCatColor(catId) {
  const c = allCategories.find(c => c.id === catId);
  return c ? c.color : '#888';
}

// Search + filter
document.getElementById('ds-search').addEventListener('input', e => {
  clearTimeout(dsSearchTimeout);
  dsSearchTimeout = setTimeout(() => {
    loadDatasets(e.target.value, document.getElementById('ds-filter-cat').value);
  }, 300);
});
document.getElementById('ds-filter-cat').addEventListener('change', e => {
  loadDatasets(document.getElementById('ds-search').value, e.target.value);
});

// Add dataset button
document.getElementById('add-dataset-btn').addEventListener('click', () => openAddDataset());
document.getElementById('dataset-modal-close').addEventListener('click', closeDatasetModal);
document.getElementById('dataset-modal').addEventListener('click', e => {
  if (e.target.id === 'dataset-modal') closeDatasetModal();
});

window.closeDatasetModal = () => {
  document.getElementById('dataset-modal').classList.remove('open');
  document.getElementById('dataset-form').reset();
};

window.openAddDataset = () => {
  document.getElementById('dataset-modal-title').textContent = 'Add dataset';
  document.getElementById('ds-save-btn').textContent = 'Add dataset';
  document.getElementById('ds-id').value = '';
  document.getElementById('dataset-form').reset();
  setImagePreview('ds', '');
  document.getElementById('dataset-modal').classList.add('open');
};

window.openEditDataset = async (id) => {
  let d;
  try { d = await api(`/api/admin/datasets/${id}`); } catch(e) { toast(e.message, true); return; }
  document.getElementById('dataset-modal-title').textContent = 'Edit dataset';
  document.getElementById('ds-save-btn').textContent = 'Save changes';
  const form = document.getElementById('dataset-form');
  form.reset();
  form.elements['id'].value = d.id;
  form.elements["title"].value = d.title || '';
  form.elements["description"].value = d.description || '';
  form.elements["category_id"].value = d.category_id || '';
  form.elements["source"].value = d.source || '';
  form.elements["source_url"].value = d.source_url || '';
  form.elements["license"].value = d.license || '';
  form.elements["data_types"].value = d.data_types || '';
  form.elements["tags"].value = d.tags || '';
  form.elements["label"].value = d.label || '';
  form.elements["year"].value = d.year || '';
  document.getElementById('ds-featured').checked = !!d.featured;
  setImagePreview('ds', d.cover_image || '');
  document.getElementById('dataset-modal').classList.add('open');
};

function setupDatasetForm() {
  document.getElementById('dataset-form').addEventListener('submit', async e => {
    e.preventDefault();
    const form = e.target;
    const btn = document.getElementById('ds-save-btn');
    btn.textContent = 'Saving…'; btn.disabled = true;
    const id = form.elements['id'].value;
    const body = {
      title: form.elements["title"].value,
      description: form.elements["description"].value,
      category_id: form.elements["category_id"].value || null,
      source: form.elements["source"].value,
      source_url: form.elements["source_url"].value,
      license: form.elements["license"].value,
      data_types: form.elements["data_types"].value,
      tags: form.elements["tags"].value,
      label: form.elements["label"].value,
      year: form.elements["year"].value,
      featured: document.getElementById('ds-featured').checked,
      cover_image: document.getElementById('ds-cover-image').value || null
    };
    try {
      if (id) {
        await api(`/api/admin/datasets/${id}`, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body) });
        toast('Dataset updated');
      } else {
        await api('/api/admin/datasets', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body) });
        toast('Dataset added');
      }
      closeDatasetModal();
      loadDatasets(document.getElementById('ds-search').value, document.getElementById('ds-filter-cat').value);
    } catch (err) {
      toast(err.message || 'Error saving dataset', true);
    }
    btn.textContent = id ? 'Save changes' : 'Add dataset'; btn.disabled = false;
  });
}

window.confirmDeleteDataset = (id, title) => {
  document.getElementById('confirm-msg').textContent = `Delete "${title}"? This cannot be undone.`;
  document.getElementById('confirm-ok').onclick = async () => {
    await api(`/api/admin/datasets/${id}`, { method: 'DELETE' });
    closeConfirm();
    toast('Dataset deleted');
    loadDatasets(document.getElementById('ds-search').value, document.getElementById('ds-filter-cat').value);
  };
  document.getElementById('confirm-modal').classList.add('open');
};

/* ── Categories ────────────────────────────────────────────────────────────── */
async function loadCategories() {
  const cats = await api('/api/admin/categories');
  allCategories = cats;

  // populate filter dropdown
  const filterSel = document.getElementById('ds-filter-cat');
  filterSel.innerHTML = '<option value="">All categories</option>' +
    cats.map(c => `<option value="${c.id}">${escHtml(c.name)}</option>`).join('');

  // populate dataset form select
  const dsSel = document.getElementById('ds-cat-select');
  dsSel.innerHTML = '<option value="">No category</option>' +
    cats.map(c => `<option value="${c.id}">${escHtml(c.name)}</option>`).join('');

  // render table
  const tbody = document.getElementById('categories-tbody');
  tbody.innerHTML = cats.map(c => `
    <tr>
      <td style="font-weight:500">${escHtml(c.name)}</td>
      <td style="color:var(--ink-lt);font-family:monospace;font-size:12px">${escHtml(c.slug)}</td>
      <td><span style="display:inline-flex;align-items:center;gap:6px">
        <span style="width:14px;height:14px;border-radius:50%;background:${c.color};display:inline-block"></span>
        <span style="font-size:12px;font-family:monospace;color:var(--ink-lt)">${c.color}</span>
      </span></td>
      <td>${c.count}</td>
      <td>
        <div class="td-actions">
          <button class="a-btn-icon" onclick="openEditCategory(${c.id})">
            <svg viewBox="0 0 16 16" fill="none"><path d="M11.5 2.5l2 2-8 8H3.5v-2l8-8z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>
          </button>
          <button class="a-btn-icon" onclick="confirmDeleteCategory(${c.id}, '${escAttr(c.name)}')">
            <svg viewBox="0 0 16 16" fill="none"><path d="M3 4h10M6 4V3h4v1M5 4v8h6V4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
        </div>
      </td>
    </tr>`).join('');
}

document.getElementById('add-category-btn').addEventListener('click', () => {
  document.getElementById('cat-modal-title').textContent = 'Add category';
  document.getElementById('category-form').reset();
  document.getElementById('cat-id').value = '';
  document.getElementById('category-modal').classList.add('open');
});
document.getElementById('category-modal-close').addEventListener('click', closeCategoryModal);
document.getElementById('category-modal').addEventListener('click', e => {
  if (e.target.id === 'category-modal') closeCategoryModal();
});
window.closeCategoryModal = () => document.getElementById('category-modal').classList.remove('open');

window.openEditCategory = async (id) => {
  const cats = await api('/api/admin/categories');
  const c = cats.find(c => c.id === id);
  if (!c) return;
  document.getElementById('cat-modal-title').textContent = 'Edit category';
  const form = document.getElementById('category-form');
  form.reset();
  form.elements['id'].value = c.id;
  form.elements["name"].value = c.name;
  form.elements["slug"].value = c.slug;
  form.elements["color"].value = c.color;
  document.getElementById('category-modal').classList.add('open');
};

function setupCategoryForm() {
  document.getElementById('category-form').addEventListener('submit', async e => {
    e.preventDefault();
    const form = e.target;
    const id = form.elements['id'].value;
    const body = { name: form.elements["name"].value, slug: form.elements["slug"].value, color: form.elements["color"].value };
    try {
      if (id) {
        await api(`/api/admin/categories/${id}`, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body) });
        toast('Category updated');
      } else {
        await api('/api/admin/categories', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body) });
        toast('Category added');
      }
      closeCategoryModal();
      loadCategories();
    } catch (err) {
      toast(err.message || 'Error', true);
    }
  });
}

window.confirmDeleteCategory = (id, name) => {
  document.getElementById('confirm-msg').textContent = `Delete category "${name}"? All datasets in this category will be uncategorized.`;
  document.getElementById('confirm-ok').onclick = async () => {
    try {
      await api(`/api/admin/categories/${id}`, { method: 'DELETE' });
      closeConfirm(); toast('Category deleted'); loadCategories();
    } catch (err) {
      closeConfirm(); toast(err.message || 'Error', true);
    }
  };
  document.getElementById('confirm-modal').classList.add('open');
};

/* ── Articles ──────────────────────────────────────────────────────────────── */
async function loadArticles() {
  const rows = await api('/api/admin/articles');
  const tbody = document.getElementById('articles-tbody');
  const empty = document.getElementById('art-empty');
  document.getElementById('art-count-label').textContent = `${rows.length} total articles`;
  if (!rows.length) { tbody.innerHTML = ''; empty.style.display = 'block'; return; }
  empty.style.display = 'none';
  tbody.innerHTML = rows.map(a => `
    <tr>
      <td class="td-title"><div class="td-title-text">${escHtml(a.title)}${a.label ? `<span class="badge-label">${escHtml(a.label)}</span>` : ''}</div></td>
      <td>${a.tag ? `<span class="badge-featured">${escHtml(a.tag)}</span>` : '—'}</td>
      <td>${escHtml(a.author || '—')}</td>
      <td>${a.published ? '<span class="badge-published">Published</span>' : '<span class="badge-draft">Draft</span>'}</td>
      <td style="color:var(--ink-lt);font-size:12.5px">${formatAdminDate(a.created_at)}</td>
      <td>
        <div class="td-actions">
          <a href="/articles/${escHtml(a.slug)}" target="_blank" class="a-btn-icon" title="View on site">
            <svg viewBox="0 0 16 16" fill="none"><path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </a>
          <button class="a-btn-icon" title="Edit" onclick="openEditArticle(${a.id})">
            <svg viewBox="0 0 16 16" fill="none"><path d="M11.5 2.5l2 2-8 8H3.5v-2l8-8z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>
          </button>
          <button class="a-btn-icon" title="Delete" onclick="confirmDeleteArticle(${a.id}, '${escAttr(a.title)}')">
            <svg viewBox="0 0 16 16" fill="none"><path d="M3 4h10M6 4V3h4v1M5 4v8h6V4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
        </div>
      </td>
    </tr>`).join('');
}

document.getElementById('add-article-btn').addEventListener('click', () => {
  document.getElementById('article-modal-title').textContent = 'Add article';
  document.getElementById('art-save-btn').textContent = 'Add article';
  document.getElementById('article-form').reset();
  document.getElementById('art-id').value = '';
  document.getElementById('art-published').checked = true;
  setImagePreview('art', '');
  document.getElementById('article-modal').classList.add('open');
});
document.getElementById('article-modal-close').addEventListener('click', closeArticleModal);
document.getElementById('article-modal').addEventListener('click', e => {
  if (e.target.id === 'article-modal') closeArticleModal();
});
window.closeArticleModal = () => document.getElementById('article-modal').classList.remove('open');

window.openEditArticle = async (id) => {
  let a;
  try { a = await api(`/api/admin/articles/${id}`); } catch(e) { toast(e.message, true); return; }
  document.getElementById('article-modal-title').textContent = 'Edit article';
  document.getElementById('art-save-btn').textContent = 'Save changes';
  const form = document.getElementById('article-form');
  form.reset();
  form.elements['id'].value = a.id;
  form.elements["title"].value = a.title || '';
  form.elements["slug"].value = a.slug || '';
  form.elements["tag"].value = a.tag || '';
  form.elements["label"].value = a.label || '';
  form.elements["author"].value = a.author || '';
  form.elements["excerpt"].value = a.excerpt || '';
  form.elements["content"].value = a.content || '';
  document.getElementById('art-published').checked = !!a.published;
  setImagePreview('art', a.cover_image || '');
  document.getElementById('article-modal').classList.add('open');
};

document.getElementById('article-form').addEventListener('submit', async e => {
  e.preventDefault();
  const form = e.target;
  const btn = document.getElementById('art-save-btn');
  btn.textContent = 'Saving…'; btn.disabled = true;
  const id = form.elements['id'].value;
  const body = {
    title: form.elements["title"].value, slug: form.elements["slug"].value,
    excerpt: form.elements["excerpt"].value, content: form.elements["content"].value,
    author: form.elements["author"].value, tag: form.elements["tag"].value,
    label: form.elements["label"].value,
    cover_image: document.getElementById('art-cover-image').value || null,
    published: document.getElementById('art-published').checked
  };
  try {
    if (id) {
      await api(`/api/admin/articles/${id}`, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body) });
      toast('Article updated');
    } else {
      await api('/api/admin/articles', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(body) });
      toast('Article added');
    }
    closeArticleModal();
    loadArticles();
  } catch (err) { toast(err.message || 'Error', true); }
  btn.textContent = id ? 'Save changes' : 'Add article'; btn.disabled = false;
});

window.confirmDeleteArticle = (id, title) => {
  document.getElementById('confirm-msg').textContent = `Delete article "${title}"? This cannot be undone.`;
  document.getElementById('confirm-ok').onclick = async () => {
    await api(`/api/admin/articles/${id}`, { method: 'DELETE' });
    closeConfirm(); toast('Article deleted'); loadArticles();
  };
  document.getElementById('confirm-modal').classList.add('open');
};

function formatAdminDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/* ── Settings ──────────────────────────────────────────────────────────────── */
async function loadSettings() {
  const s = await api('/api/settings');
  const fill = (formId, keys) => {
    const form = document.getElementById(formId);
    if (!form) return;
    keys.forEach(k => { if (form[k]) form[k].value = s[k] || ''; });
  };
  fill('settings-form', ['site_title', 'hero_eyebrow', 'hero_title', 'tagline']);
  fill('about-form',    ['about_lead', 'about_content']);
  fill('footer-form',   ['footer_copy']);
}

async function saveSettings(formId, feedbackId, keys) {
  const form = document.getElementById(formId);
  const body = {};
  keys.forEach(k => { if (form[k]) body[k] = form[k].value; });
  await api('/api/admin/settings', { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
  const fb = document.getElementById(feedbackId);
  fb.textContent = '✓ Saved';
  fb.style.color = 'var(--green)';
  setTimeout(() => { fb.textContent = ''; }, 2500);
}

function setupSettingsForms() {
  document.getElementById('settings-form').addEventListener('submit', async e => {
    e.preventDefault();
    await saveSettings('settings-form', 'settings-feedback', ['site_title','hero_eyebrow','hero_title','tagline']);
  });

  document.getElementById('about-form').addEventListener('submit', async e => {
    e.preventDefault();
    await saveSettings('about-form', 'about-feedback', ['about_lead','about_content']);
  });

  document.getElementById('footer-form').addEventListener('submit', async e => {
    e.preventDefault();
    await saveSettings('footer-form', 'footer-feedback', ['footer_copy']);
  });

  document.getElementById('pw-form').addEventListener('submit', async e => {
    e.preventDefault();
    const form = e.target;
    const fb = document.getElementById('pw-feedback');
    try {
      const res = await api('/api/admin/change-password', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ currentPassword: form.currentPassword.value, newPassword: form.newPassword.value })
      });
      fb.style.color = 'var(--green)';
      fb.textContent = 'Done. Update your .env file with: ' + res.newHash;
      form.reset();
    } catch {
      fb.style.color = 'var(--accent)';
      fb.textContent = 'Current password is incorrect.';
    }
  });
}

/* ── Guides ────────────────────────────────────────────────────────────────── */
async function loadGuides() {
  const rows = await api('/api/admin/guides');
  document.getElementById('guides-count-label').textContent = `${rows.length} total guides`;
  const tbody = document.getElementById('guides-tbody');
  const empty = document.getElementById('guides-empty');
  if (!rows.length) { tbody.innerHTML = ''; empty.style.display = 'block'; return; }
  empty.style.display = 'none';
  tbody.innerHTML = rows.map(g => `
    <tr>
      <td class="td-title"><div class="td-title-text">${escHtml(g.title)}</div></td>
      <td><span class="badge-featured">${escHtml(g.section)}</span></td>
      <td><span style="font-size:12px;font-weight:600;color:${g.difficulty==='Beginner'?'#0e7a5f':g.difficulty==='Intermediate'?'#1a4a8a':'#c0392b'}">${escHtml(g.difficulty)}</span></td>
      <td style="color:var(--ink-lt);font-size:13px">${g.sort_order}</td>
      <td>${g.published ? '<span class="badge-published">Published</span>' : '<span class="badge-draft">Draft</span>'}</td>
      <td>
        <div class="td-actions">
          <button class="a-btn-icon" title="Edit" onclick="openEditGuide(${g.id})">
            <svg viewBox="0 0 16 16" fill="none"><path d="M11.5 2.5l2 2-8 8H3.5v-2l8-8z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>
          </button>
          <button class="a-btn-icon" title="Delete" onclick="deleteGuide(${g.id},'${escAttr(g.title)}')">
            <svg viewBox="0 0 16 16" fill="none"><path d="M3 4h10M6 4V3h4v1M5 4v8h6V4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
        </div>
      </td>
    </tr>`).join('');
}

document.getElementById('add-guide-btn').addEventListener('click', () => {
  document.getElementById('guide-modal-title').textContent = 'Add guide';
  document.getElementById('guide-save-btn').textContent = 'Add guide';
  document.getElementById('guide-form').reset();
  document.getElementById('guide-id').value = '';
  document.getElementById('guide-published').checked = true;
  document.getElementById('guide-modal').classList.add('open');
});
document.getElementById('guide-modal-close').addEventListener('click', () => closeGuideModal());
document.getElementById('guide-modal').addEventListener('click', e => { if (e.target.id === 'guide-modal') closeGuideModal(); });
window.closeGuideModal = () => document.getElementById('guide-modal').classList.remove('open');

window.openEditGuide = async (id) => {
  const rows = await api('/api/admin/guides');
  const g = rows.find(r => r.id === id);
  if (!g) return;
  document.getElementById('guide-modal-title').textContent = 'Edit guide';
  document.getElementById('guide-save-btn').textContent = 'Save changes';
  const form = document.getElementById('guide-form');
  form.reset();
  form.elements['id'].value = g.id;
  form.elements["title"].value = g.title || '';
  form.elements["slug"].value = g.slug || '';
  form.elements["section"].value = g.section || 'Tools';
  form.elements["difficulty"].value = g.difficulty || 'Beginner';
  form.elements["sort_order"].value = g.sort_order || 0;
  form.elements["excerpt"].value = g.excerpt || '';
  form.elements["content"].value = g.content || '';
  document.getElementById('guide-published').checked = !!g.published;
  document.getElementById('guide-modal').classList.add('open');
};

document.getElementById('guide-form').addEventListener('submit', async e => {
  e.preventDefault();
  const form = e.target;
  const btn = document.getElementById('guide-save-btn');
  btn.textContent = 'Saving…'; btn.disabled = true;
  const id = form.elements['id'].value;

  // auto-generate slug from title if empty
  let slug = form.elements["slug"].value.trim();
  if (!slug) slug = form.elements["title"].value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  const body = {
    title: form.elements["title"].value, slug,
    section: form.elements["section"].value, difficulty: form.elements["difficulty"].value,
    sort_order: parseInt(form.elements["sort_order"].value) || 0,
    excerpt: form.elements["excerpt"].value, content: form.elements["content"].value,
    published: document.getElementById('guide-published').checked
  };
  try {
    if (id) {
      await api(`/api/admin/guides/${id}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
      toast('Guide updated');
    } else {
      await api('/api/admin/guides', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
      toast('Guide added');
    }
    closeGuideModal(); loadGuides();
  } catch (err) { toast(err.message || 'Error saving guide', true); }
  btn.textContent = id ? 'Save changes' : 'Add guide'; btn.disabled = false;
});

window.deleteGuide = (id, title) => {
  document.getElementById('confirm-msg').textContent = `Delete "${title}"? This cannot be undone.`;
  document.getElementById('confirm-ok').onclick = async () => {
    await api(`/api/admin/guides/${id}`, { method:'DELETE' });
    closeConfirm(); toast('Guide deleted'); loadGuides();
  };
  document.getElementById('confirm-modal').classList.add('open');
};

/* ── Case Studies ──────────────────────────────────────────────────────────── */
async function loadCaseStudies() {
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
      <td>${escHtml(c.org || '—')}</td>
      <td>${escHtml(c.year || '—')}</td>
      <td>${c.published ? '<span class="badge-published">Published</span>' : '<span class="badge-draft">Draft</span>'}</td>
      <td>
        <div class="td-actions">
          <button class="a-btn-icon" title="Edit" onclick="openEditCs(${c.id})">
            <svg viewBox="0 0 16 16" fill="none"><path d="M11.5 2.5l2 2-8 8H3.5v-2l8-8z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/></svg>
          </button>
          <button class="a-btn-icon" title="Delete" onclick="deleteCs(${c.id},'${escAttr(c.title)}')">
            <svg viewBox="0 0 16 16" fill="none"><path d="M3 4h10M6 4V3h4v1M5 4v8h6V4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
        </div>
      </td>
    </tr>`).join('');
}

document.getElementById('add-cs-btn').addEventListener('click', () => {
  document.getElementById('cs-modal-title').textContent = 'Add case study';
  document.getElementById('cs-save-btn').textContent = 'Add case study';
  document.getElementById('cs-form').reset();
  document.getElementById('cs-id').value = '';
  document.getElementById('cs-published').checked = true;
  document.getElementById('cs-modal').classList.add('open');
});
document.getElementById('cs-modal-close').addEventListener('click', () => closeCsModal());
document.getElementById('cs-modal').addEventListener('click', e => { if (e.target.id === 'cs-modal') closeCsModal(); });
window.closeCsModal = () => document.getElementById('cs-modal').classList.remove('open');

window.openEditCs = async (id) => {
  const rows = await api('/api/admin/case-studies');
  const c = rows.find(r => r.id === id);
  if (!c) return;
  document.getElementById('cs-modal-title').textContent = 'Edit case study';
  document.getElementById('cs-save-btn').textContent = 'Save changes';
  const form = document.getElementById('cs-form');
  form.reset();
  form.elements['id'].value = c.id;
  form.elements["title"].value = c.title || '';
  form.elements["tag"].value = c.tag || '';
  form.elements["org"].value = c.org || '';
  form.elements["year"].value = c.year || '';
  form.elements["datasets_used"].value = c.datasets_used || '';
  form.elements["excerpt"].value = c.excerpt || '';
  document.getElementById('cs-published').checked = !!c.published;
  document.getElementById('cs-modal').classList.add('open');
};

document.getElementById('cs-form').addEventListener('submit', async e => {
  e.preventDefault();
  const form = e.target;
  const btn = document.getElementById('cs-save-btn');
  btn.textContent = 'Saving…'; btn.disabled = true;
  const id = form.elements['id'].value;
  const body = {
    title: form.elements["title"].value, tag: form.elements["tag"].value,
    org: form.elements["org"].value, year: form.elements["year"].value,
    datasets_used: form.elements["datasets_used"].value, excerpt: form.elements["excerpt"].value,
    published: document.getElementById('cs-published').checked
  };
  try {
    if (id) {
      await api(`/api/admin/case-studies/${id}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
      toast('Case study updated');
    } else {
      await api('/api/admin/case-studies', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(body) });
      toast('Case study added');
    }
    closeCsModal(); loadCaseStudies();
  } catch (err) { toast(err.message || 'Error', true); }
  btn.textContent = id ? 'Save changes' : 'Add case study'; btn.disabled = false;
});

window.deleteCs = (id, title) => {
  document.getElementById('confirm-msg').textContent = `Delete "${title}"? This cannot be undone.`;
  document.getElementById('confirm-ok').onclick = async () => {
    await api(`/api/admin/case-studies/${id}`, { method:'DELETE' });
    closeConfirm(); toast('Case study deleted'); loadCaseStudies();
  };
  document.getElementById('confirm-modal').classList.add('open');
};

/* ── Submissions ───────────────────────────────────────────────────────────── */
let allSubmissions = [];

async function loadSubmissions() {
  allSubmissions = await api('/api/admin/submissions');
  const pending = allSubmissions.filter(s => s.status === 'pending').length;
  const badge = document.getElementById('submissions-badge');
  if (pending > 0) { badge.textContent = pending; badge.style.display = 'inline-block'; }
  else { badge.style.display = 'none'; }
  renderSubmissions(allSubmissions);
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
      <td>${escHtml(s.source || '—')}</td>
      <td>${escHtml(s.category || '—')}</td>
      <td>${escHtml(s.email || '—')}</td>
      <td>${new Date(s.created_at).toLocaleDateString('en-GB')}</td>
      <td><span class="badge-status badge-${s.status}">${s.status}</span></td>
      <td>
        <div class="td-actions">
          ${s.status === 'pending' ? `
            <button class="a-btn a-btn-xs a-btn-green" onclick="updateSubmission(${s.id},'approved')">Approve</button>
            <button class="a-btn a-btn-xs a-btn-ghost" onclick="updateSubmission(${s.id},'rejected')">Reject</button>
          ` : `
            <button class="a-btn a-btn-xs a-btn-ghost" onclick="updateSubmission(${s.id},'pending')">Reset</button>
          `}
          <button class="a-btn-icon" title="Delete" onclick="deleteSubmission(${s.id})">
            <svg viewBox="0 0 16 16" fill="none"><path d="M3 4h10M6 4V3h4v1M5 4v8h6V4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
        </div>
      </td>
    </tr>`).join('');
}

function setupSubmissionsFilter() {
  document.getElementById('sub-filter-status').addEventListener('change', e => {
    const v = e.target.value;
    renderSubmissions(v ? allSubmissions.filter(s => s.status === v) : allSubmissions);
  });
}

window.updateSubmission = async (id, status) => {
  await api(`/api/admin/submissions/${id}`, { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ status }) });
  toast(`Submission marked as ${status}`);
  loadSubmissions();
};

window.deleteSubmission = (id) => {
  document.getElementById('confirm-msg').textContent = 'Delete this submission? This cannot be undone.';
  document.getElementById('confirm-ok').onclick = async () => {
    await api(`/api/admin/submissions/${id}`, { method:'DELETE' });
    closeConfirm(); toast('Submission deleted'); loadSubmissions();
  };
  document.getElementById('confirm-modal').classList.add('open');
};

/* ── Confirm modal ─────────────────────────────────────────────────────────── */
window.closeConfirm = () => document.getElementById('confirm-modal').classList.remove('open');
document.getElementById('confirm-modal').addEventListener('click', e => {
  if (e.target.id === 'confirm-modal') closeConfirm();
});

/* ── Toast ─────────────────────────────────────────────────────────────────── */
/* ── Image upload helpers ──────────────────────────────────────────────────── */
function setImagePreview(prefix, url) {
  const hidden = document.getElementById(`${prefix}-cover-image`);
  const preview = document.getElementById(`${prefix}-img-preview`);
  const removeBtn = document.getElementById(`${prefix}-img-remove`);
  if (url) {
    hidden.value = url;
    preview.innerHTML = `<img src="${url}" alt="cover" />`;
    preview.classList.add('has-img');
    removeBtn.style.display = 'inline-block';
  } else {
    hidden.value = '';
    preview.innerHTML = '';
    preview.classList.remove('has-img');
    removeBtn.style.display = 'none';
  }
}

window.removeImage = (prefix) => setImagePreview(prefix, '');

function setupImageUpload(prefix) {
  const fileInput = document.getElementById(`${prefix}-img-file`);
  if (!fileInput) return;
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    if (!file) return;
    const label = fileInput.closest('label');
    label.classList.add('uploading');
    label.querySelector('svg').style.display = 'none';
    label.childNodes[label.childNodes.length - 2].textContent = ' Uploading…';
    try {
      const fd = new FormData();
      fd.append('image', file);
      const res = await fetch('/api/admin/upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      setImagePreview(prefix, data.url);
      toast('Image uploaded');
    } catch (err) {
      toast(err.message || 'Upload failed', true);
    }
    label.classList.remove('uploading');
    label.querySelector('svg').style.display = '';
    label.childNodes[label.childNodes.length - 2].textContent = ' Upload image';
    fileInput.value = '';
  });
}

function toast(msg, isError = false) {
  let el = document.querySelector('.a-toast');
  if (!el) { el = document.createElement('div'); el.className = 'a-toast'; document.body.appendChild(el); }
  el.textContent = msg;
  el.classList.toggle('error', isError);
  el.classList.add('show');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 3000);
}

/* ── Helpers ───────────────────────────────────────────────────────────────── */
async function api(url, opts) {
  const r = await fetch(url, { credentials: 'include', ...opts });
  const data = await r.json().catch(() => ({}));
  if (r.status === 401) { showLogin(); throw new Error('Session expired — please log in again'); }
  if (!r.ok) throw new Error(data.error || r.statusText);
  return data;
}
function escHtml(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function escAttr(s) { return String(s||'').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
