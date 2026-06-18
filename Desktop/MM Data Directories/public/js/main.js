/* ── State ─────────────────────────────────────────────────────────────────── */
let state = {
  datasets: [], total: 0, offset: 0, limit: 100,
  query: '', category: '', featured: false,
  view: 'grid', loading: false
};

/* ── Init ──────────────────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', async () => {
  setupRouter();
  setupSearch();
  setupViewToggle();
  setupNavToggle();
  setupModal();
  setupSubmitForm();
  loadSettings();
  loadStats();
  loadCategories();
  fetchDatasets(true);
});

/* ── Router ────────────────────────────────────────────────────────────────── */
function setupRouter() {
  function navigate(path) {
    const staticPages = { '/': 'home', '/browse': 'browse', '/about': 'about', '/submit': 'submit', '/articles': 'articles', '/contact': 'contact', '/case-studies': 'case-studies', '/learn': 'learn' };
    let pageId = staticPages[path];

    if (!pageId && path.startsWith('/articles/')) {
      pageId = 'article';
      const slug = path.replace('/articles/', '');
      loadArticle(slug);
    } else if (!pageId) {
      pageId = 'home';
    }

    if (pageId === 'articles') loadArticles();
    if (pageId === 'case-studies') loadCaseStudies();
    if (pageId === 'learn') loadGuides();
    if (pageId === 'browse') fetchDatasets(true);

    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const target = document.getElementById(`page-${pageId}`);
    if (target) target.classList.add('active');
    document.querySelectorAll('.nav-link').forEach(l => {
      l.classList.toggle('active',
        l.dataset.page === pageId ||
        (pageId === 'article' && l.dataset.page === 'articles') ||
        (pageId === 'article' && l.dataset.page === 'articles')
      );
    });
    window.scrollTo(0, 0);
  }

  document.addEventListener('click', e => {
    const link = e.target.closest('[data-page]');
    if (!link) return;
    e.preventDefault();
    const page = link.dataset.page;
    const pathMap = { home:'/', browse:'/browse', about:'/about', submit:'/submit', articles:'/articles', contact:'/contact', 'case-studies':'/case-studies', learn:'/learn' };
    const path = pathMap[page] || `/${page}`;
    history.pushState({}, '', path);
    navigate(path);
    document.querySelector('.main-nav')?.classList.remove('open');
  });

  document.addEventListener('click', e => {
    const link = e.target.closest('[data-article-slug]');
    if (!link) return;
    e.preventDefault();
    const slug = link.dataset.articleSlug;
    history.pushState({}, '', `/articles/${slug}`);
    navigate(`/articles/${slug}`);
  });

  window.addEventListener('popstate', () => navigate(location.pathname));
  navigate(location.pathname);
}

/* ── Articles ──────────────────────────────────────────────────────────────── */
let currentTag = '';

async function loadArticles(tag = currentTag) {
  currentTag = tag;
  const params = new URLSearchParams({ limit: 50 });
  if (tag) params.set('tag', tag);
  const { articles } = await api(`/api/articles?${params}`);
  const grid = document.getElementById('articles-grid');
  const featured = document.getElementById('insights-featured');
  const empty = document.getElementById('articles-empty');

  document.querySelectorAll('.ins-tag-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tag === tag);
    btn.onclick = () => loadArticles(btn.dataset.tag);
  });

  if (!articles.length) {
    grid.innerHTML = '';
    if (featured) featured.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  const [first, ...rest] = articles;

  // Featured card (first article)
  if (featured) {
    featured.innerHTML = `
      <div class="ins-featured" data-article-slug="${escHtml(first.slug)}">
        <div class="ins-featured-body">
          ${first.tag ? `<span class="ins-tag">${escHtml(first.tag)}</span>` : ''}
          <h2 class="ins-featured-title">${escHtml(first.title)}</h2>
          <p class="ins-featured-excerpt">${escHtml(first.excerpt || '')}</p>
          <div class="ins-featured-meta">
            <span>${escHtml(first.author || '')}</span>
            <span class="ins-meta-dot">·</span>
            <span>${formatDate(first.created_at)}</span>
          </div>
        </div>
        <div class="ins-featured-cta">Read article →</div>
      </div>`;
  }

  // Rest as grid cards
  grid.innerHTML = rest.map(a => `
    <div class="ins-card" data-article-slug="${escHtml(a.slug)}">
      <div class="ins-card-body">
        ${a.tag ? `<span class="ins-tag">${escHtml(a.tag)}</span>` : ''}
        <h3 class="ins-card-title">${escHtml(a.title)}</h3>
        <p class="ins-card-excerpt">${escHtml(a.excerpt || '')}</p>
      </div>
      <div class="ins-card-footer">
        <span class="ins-card-meta">${escHtml(a.author || '')} · ${formatDate(a.created_at)}</span>
        <span class="ins-card-arrow">→</span>
      </div>
    </div>`).join('');
}

async function loadArticle(slug) {
  const wrap = document.getElementById('article-content-wrap');
  wrap.innerHTML = `<div style="padding:80px 0;text-align:center;color:var(--ink-lt)">Loading…</div>`;
  try {
    const a = await api(`/api/articles/${slug}`);
    const readingTime = a.content ? Math.max(1, Math.ceil(a.content.replace(/<[^>]+>/g,'').split(' ').length / 200)) : 1;
    wrap.innerHTML = `
      <div class="article-page">
        <div class="article-page-header">
          <div class="container">
            <a href="/articles" data-page="articles" class="article-back">
              <svg viewBox="0 0 14 14" fill="none"><path d="M9 2L4 7l5 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
              Back to Insights
            </a>
            ${a.tag ? `<span class="ins-tag" style="margin-top:18px;display:inline-block">${escHtml(a.tag)}</span>` : ''}
            <h1 class="article-page-title">${escHtml(a.title)}</h1>
            <p class="article-page-excerpt">${escHtml(a.excerpt || '')}</p>
            <div class="article-page-meta">
              <span class="article-page-author">${escHtml(a.author || '')}</span>
              <span class="ins-meta-dot">·</span>
              <span>${formatDate(a.created_at)}</span>
              <span class="ins-meta-dot">·</span>
              <span>${readingTime} min read</span>
            </div>
          </div>
        </div>
        <div class="article-page-body">
          <div class="container">
            <div class="article-prose">${a.content || ''}</div>
          </div>
        </div>
      </div>`;
  } catch {
    wrap.innerHTML = `<div style="padding:80px 0;text-align:center;color:var(--ink-lt)">Article not found.</div>`;
  }
}

/* ── Case Studies ──────────────────────────────────────────────────────────── */
async function loadCaseStudies() {
  const grid = document.getElementById('cs-grid');
  if (!grid) return;
  try {
    const rows = await api('/api/case-studies');
    if (!rows.length) {
      grid.innerHTML = '';
      return;
    }
    grid.innerHTML = rows.map((c, i) => `
      <article class="cs-card cs-card-full">
        <div class="cs-card-header">
          ${c.tag ? `<div class="cs-tag">${escHtml(c.tag)}</div>` : ''}
          <div class="cs-card-meta-top">
            <span class="cs-org-top">${escHtml(c.org || '')}</span>
            ${c.year ? `<span class="cs-year">${escHtml(c.year)}</span>` : ''}
          </div>
        </div>
        <h2 class="cs-title">${escHtml(c.title)}</h2>
        <p class="cs-excerpt">${escHtml(c.excerpt || '')}</p>
        ${c.content ? `
          <div class="cs-body" id="cs-body-${i}" style="display:none">${c.content}</div>
          <button class="cs-toggle-btn" onclick="toggleCsBody(${i})">Read full case study ↓</button>
        ` : ''}
        <div class="cs-footer">
          ${c.datasets_used ? `<div class="cs-datasets"><span class="cs-datasets-label">Datasets used:</span> ${escHtml(c.datasets_used)}</div>` : ''}
          ${c.source_url ? `<a href="${escAttr(c.source_url)}" target="_blank" rel="noopener" class="cs-source-link">View on GitHub ↗</a>` : ''}
        </div>
      </article>`).join('');
  } catch (e) { console.error(e); }
}

window.toggleCsBody = (i) => {
  const body = document.getElementById('cs-body-' + i);
  const btn = body.nextElementSibling;
  const open = body.style.display === 'none';
  body.style.display = open ? 'block' : 'none';
  btn.textContent = open ? 'Collapse ↑' : 'Read full case study ↓';
};

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

/* ── Settings / Stats ──────────────────────────────────────────────────────── */
async function loadSettings() {
  try {
    const s = await api('/api/settings');
    const set = (id, val, html = false) => {
      const el = document.getElementById(id);
      if (!el || !val) return;
      if (html) el.innerHTML = val; else el.textContent = val;
    };
    set('hero-eyebrow',  s.hero_eyebrow);
    set('hero-title',    s.hero_title);
    set('hero-tagline',  s.tagline);
    set('about-lead',    s.about_lead);
    set('about-content', s.about_content, true);
    set('footer-copy',   s.footer_copy);
    if (s.site_title) document.title = s.site_title;
  } catch {}
}

async function loadStats() {
  try {
    const s = await api('/api/stats');
    animateNum('stat-datasets', s.totalDatasets);
    animateNum('stat-categories', s.totalCategories);
    animateNum('stat-sources', s.totalSources);
  } catch {}
}

function animateNum(id, target) {
  const el = document.getElementById(id);
  if (!el) return;
  let current = 0;
  const step = Math.ceil(target / 30);
  const t = setInterval(() => {
    current = Math.min(current + step, target);
    el.textContent = current;
    if (current >= target) clearInterval(t);
  }, 30);
}

/* ── Categories ────────────────────────────────────────────────────────────── */
async function loadCategories() {
  const cats = await api('/api/categories');
  const list = document.getElementById('category-list');
  const submitSel = document.getElementById('submit-category');

  cats.forEach(c => {
    const li = document.createElement('li');
    li.innerHTML = `<button class="cat-btn" data-slug="${c.slug}" style="--cat-color:${c.color}">
      ${c.name} <span class="cat-count">${c.count}</span>
    </button>`;
    list.appendChild(li);
    if (submitSel) {
      const opt = new Option(c.name, c.slug);
      submitSel.appendChild(opt);
    }
  });

  list.addEventListener('click', e => {
    const btn = e.target.closest('.cat-btn');
    if (!btn) return;
    list.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.category = btn.dataset.slug;
    fetchDatasets(true);
  });
}

/* ── Search ────────────────────────────────────────────────────────────────── */
function setupSearch() {
  const input = document.getElementById('search-input');
  const clear = document.getElementById('search-clear');
  let debounce;

  input.addEventListener('input', () => {
    state.query = input.value.trim();
    clear.style.display = state.query ? 'block' : 'none';
    clearTimeout(debounce);
    debounce = setTimeout(() => fetchDatasets(true), 300);
  });

  clear.addEventListener('click', () => {
    input.value = '';
    state.query = '';
    clear.style.display = 'none';
    fetchDatasets(true);
    input.focus();
  });

  document.getElementById('featured-only').addEventListener('change', e => {
    state.featured = e.target.checked;
    fetchDatasets(true);
  });
}

window.clearSearch = () => {
  document.getElementById('search-input').value = '';
  document.getElementById('featured-only').checked = false;
  document.getElementById('search-clear').style.display = 'none';
  state.query = ''; state.category = ''; state.featured = false;
  document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
  document.querySelector('.cat-btn[data-slug=""]')?.classList.add('active');
  fetchDatasets(true);
};

/* ── View toggle ───────────────────────────────────────────────────────────── */
function setupViewToggle() {
  document.getElementById('view-grid').addEventListener('click', () => setView('grid'));
  document.getElementById('view-list').addEventListener('click', () => setView('list'));
}
function setView(v) {
  state.view = v;
  const grid = document.getElementById('dataset-grid');
  grid.classList.toggle('list-view', v === 'list');
  document.getElementById('view-grid').classList.toggle('active', v === 'grid');
  document.getElementById('view-list').classList.toggle('active', v === 'list');
}

/* ── Nav toggle ────────────────────────────────────────────────────────────── */
function setupNavToggle() {
  document.getElementById('nav-toggle').addEventListener('click', () => {
    document.querySelector('.main-nav')?.classList.toggle('open');
  });
}

/* ── Fetch datasets ────────────────────────────────────────────────────────── */
async function fetchDatasets(reset = false) {
  if (state.loading) return;
  if (reset) { state.offset = 0; state.datasets = []; }
  state.loading = true;

  const grid = document.getElementById('dataset-grid');
  if (reset) { grid.innerHTML = renderSkeletons(6); }

  const params = new URLSearchParams({ limit: state.limit, offset: state.offset });
  if (state.query) params.set('q', state.query);
  if (state.category) params.set('category', state.category);
  if (state.featured) params.set('featured', '1');

  try {
    const { datasets, total } = await api(`/api/datasets?${params}`);
    state.datasets = reset ? datasets : [...state.datasets, ...datasets];
    state.total = total;
    state.offset += datasets.length;

    if (reset) grid.innerHTML = '';
    datasets.forEach(d => grid.insertAdjacentHTML('beforeend', renderCard(d)));

    document.getElementById('results-count').textContent =
      `${state.total.toLocaleString()} dataset${state.total !== 1 ? 's' : ''}`;
    document.getElementById('load-more-wrap').style.display =
      state.offset < state.total ? 'block' : 'none';
    document.getElementById('empty-state').style.display =
      state.total === 0 ? 'flex' : 'none';
    document.getElementById('empty-state').style.flexDirection = 'column';
    document.getElementById('empty-state').style.alignItems = 'center';
  } catch (e) {
    console.error(e);
  }
  state.loading = false;
}

document.getElementById('load-more-btn')?.addEventListener('click', () => fetchDatasets(false));

/* ── Card render ───────────────────────────────────────────────────────────── */
function renderCard(d) {
  const tags = (d.tags || '').split(',').filter(Boolean).slice(0, 3);
  return `
    <div class="dataset-card" style="--cat-color:${d.category_color||'#888'}" data-id="${d.id}" onclick="openModal(${d.id})">
      ${d.featured ? '<span class="card-featured-badge">Featured</span>' : ''}
      <div class="card-cat">
        <span class="card-cat-dot" style="background:${d.category_color||'#888'}"></span>
        ${escHtml(d.category_name || 'General')}
      </div>
      <div class="card-title">${escHtml(d.title)}</div>
      <div class="card-desc">${escHtml(d.description || '—')}</div>
      <div class="card-meta">
        ${d.source ? `<span class="card-meta-item">
          <svg viewBox="0 0 12 12" fill="none"><circle cx="6" cy="6" r="4.5" stroke="currentColor" stroke-width="1.2"/><path d="M6 3.5v3l1.5 1.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>
          ${escHtml(d.source)}</span>` : ''}
        ${d.license ? `<span class="card-meta-item">
          <svg viewBox="0 0 12 12" fill="none"><rect x="1.5" y="3" width="9" height="7" rx="1" stroke="currentColor" stroke-width="1.2"/><path d="M4 3V2.5a2 2 0 0 1 4 0V3" stroke="currentColor" stroke-width="1.2"/></svg>
          ${escHtml(d.license)}</span>` : ''}
        ${d.year ? `<span class="card-meta-item">${escHtml(d.year)}</span>` : ''}
      </div>
    </div>`;
}

function renderSkeletons(n) {
  return Array.from({length: n}, () => `
    <div class="skeleton-card">
      <div class="skeleton sk-cat"></div>
      <div class="skeleton sk-title"></div>
      <div class="skeleton sk-title2"></div>
      <div class="skeleton sk-line"></div>
      <div class="skeleton sk-line"></div>
      <div class="skeleton sk-line-sm"></div>
    </div>`).join('');
}

/* ── Modal ─────────────────────────────────────────────────────────────────── */
function setupModal() {
  const overlay = document.getElementById('dataset-modal');
  document.getElementById('modal-close').addEventListener('click', closeModal);
  overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
}

window.openModal = async (id) => {
  const overlay = document.getElementById('dataset-modal');
  const content = document.getElementById('modal-content');
  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
  content.innerHTML = `<div style="padding:60px;text-align:center;color:var(--ink-lt)">Loading…</div>`;
  try {
    const d = await api(`/api/datasets/${id}`);
    const tags = (d.tags || '').split(',').filter(Boolean);
    content.innerHTML = `
      <div class="modal-cat" style="color:${d.category_color||'#888'}">${escHtml(d.category_name||'General')}</div>
      <h2 class="modal-title">${escHtml(d.title)}</h2>
      <p class="modal-desc">${escHtml(d.description||'No description available.')}</p>
      <div class="modal-grid">
        ${d.source ? `<div><div class="modal-field-label">Source</div><div class="modal-field-value">${escHtml(d.source)}</div></div>` : ''}
        ${d.license ? `<div><div class="modal-field-label">License</div><div class="modal-field-value">${escHtml(d.license)}</div></div>` : ''}
        ${d.data_types ? `<div><div class="modal-field-label">Data Types</div><div class="modal-field-value">${escHtml(d.data_types)}</div></div>` : ''}
        ${d.year ? `<div><div class="modal-field-label">Year</div><div class="modal-field-value">${escHtml(d.year)}</div></div>` : ''}
      </div>
      ${tags.length ? `<div class="modal-tags">${tags.map(t=>`<span class="modal-tag">${escHtml(t.trim())}</span>`).join('')}</div>` : ''}
      <div class="modal-actions">
        ${d.source_url ? `<a href="${escAttr(d.source_url)}" target="_blank" rel="noopener" class="btn btn-ext">View Dataset ↗</a>` : ''}
        <button class="btn btn-ghost" onclick="closeModal()">Close</button>
      </div>`;
  } catch { content.innerHTML = '<p style="padding:20px">Failed to load dataset.</p>'; }
};

window.closeModal = () => {
  document.getElementById('dataset-modal').classList.remove('open');
  document.body.style.overflow = '';
};

/* ── Submit form ───────────────────────────────────────────────────────────── */
function setupSubmitForm() {
  document.getElementById('submit-form')?.addEventListener('submit', async e => {
    e.preventDefault();
    const form = e.target;
    const msg = document.getElementById('submit-msg');
    const btn = form.querySelector('button[type="submit"]');

    if (!form.title.value.trim() || !form.url.value.trim()) {
      msg.textContent = 'Please fill in the dataset name and URL.';
      msg.style.color = 'var(--accent)';
      msg.style.display = 'block';
      return;
    }

    btn.textContent = 'Submitting…';
    btn.disabled = true;

    try {
      await api('/api/submissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title:       form.title.value.trim(),
          url:         form.url.value.trim(),
          source:      form.source?.value.trim() || '',
          category:    form.category?.value || '',
          description: form.description?.value.trim() || '',
          email:       form.email?.value.trim() || ''
        })
      });
      msg.textContent = 'Thank you — your submission has been received and will be reviewed by our team.';
      msg.style.color = 'var(--green)';
      msg.style.display = 'block';
      form.reset();
    } catch {
      msg.textContent = 'Something went wrong. Please try again.';
      msg.style.color = 'var(--accent)';
      msg.style.display = 'block';
    }

    btn.textContent = 'Submit for review';
    btn.disabled = false;
  });
}

/* ── Contact form ──────────────────────────────────────────────────────────── */
function setupContactForm() {
  document.getElementById('contact-form')?.addEventListener('submit', e => {
    e.preventDefault();
    const form = e.target;
    const btn  = document.getElementById('contact-submit-btn');
    const fb   = document.getElementById('contact-feedback');

    // Basic validation
    if (!form.name.value.trim() || !form.email.value.trim() || !form.message.value.trim()) {
      fb.textContent = 'Please fill in your name, email, and message.';
      fb.className = 'contact-feedback error';
      fb.style.display = 'block';
      return;
    }

    btn.textContent = 'Sending…';
    btn.disabled = true;

    // Simulate send (no mail server wired up — replace with real endpoint if needed)
    setTimeout(() => {
      fb.textContent = 'Message received — thank you! We will get back to you within 2–3 business days.';
      fb.className = 'contact-feedback success';
      fb.style.display = 'block';
      form.reset();
      btn.textContent = 'Send message';
      btn.disabled = false;
    }, 800);
  });
}

/* ── Learn / Guides ────────────────────────────────────────────────────────── */
const diffColor = { Beginner: '#0e7a5f', Intermediate: '#1a4a8a', Advanced: '#c0392b' };
let allGuides = [];
let activeSection = '';

async function loadGuides(section) {
  if (section !== undefined) activeSection = section;
  const list = document.getElementById('learn-list');

  if (!allGuides.length) allGuides = await api('/api/guides');
  const filtered = activeSection ? allGuides.filter(g => g.section === activeSection) : allGuides;

  list.innerHTML = filtered.map(g => `
    <div class="learn-guide-item" data-slug="${escHtml(g.slug)}">
      <div class="learn-guide-item-top">
        <span class="learn-section-tag">${escHtml(g.section)}</span>
        <span class="learn-diff" style="color:${diffColor[g.difficulty]||'#64748b'}">${escHtml(g.difficulty)}</span>
      </div>
      <p class="learn-guide-item-title">${escHtml(g.title)}</p>
    </div>`).join('');

  document.querySelectorAll('.learn-nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.section === activeSection);
    btn.onclick = () => loadGuides(btn.dataset.section);
  });

  list.querySelectorAll('.learn-guide-item').forEach(item => {
    item.addEventListener('click', () => {
      list.querySelectorAll('.learn-guide-item').forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      openGuide(item.dataset.slug);
    });
  });

  // auto-open first guide
  if (filtered.length) {
    list.querySelector('.learn-guide-item')?.classList.add('active');
    openGuide(filtered[0].slug);
  }
}

async function openGuide(slug) {
  const content = document.getElementById('learn-detail-content');
  content.innerHTML = '<div class="learn-loading">Loading…</div>';
  try {
    const g = await api('/api/guides/' + slug);
    content.innerHTML = `
      <div class="guide-header">
        <div class="guide-meta-top">
          <span class="learn-section-tag">${escHtml(g.section)}</span>
          <span class="learn-diff" style="color:${diffColor[g.difficulty]||'#64748b'}">${escHtml(g.difficulty)}</span>
        </div>
        <h1 class="guide-title">${escHtml(g.title)}</h1>
        <p class="guide-excerpt">${escHtml(g.excerpt || '')}</p>
      </div>
      <div class="guide-body">${g.content || ''}</div>`;
  } catch {
    content.innerHTML = '<p style="padding:20px;color:var(--ink-lt)">Guide not found.</p>';
  }
}

/* ── Helpers ───────────────────────────────────────────────────────────────── */
async function api(url, opts) {
  const r = await fetch(url, opts);
  if (!r.ok) throw new Error(r.statusText);
  return r.json();
}
function escHtml(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function escAttr(str) {
  return String(str || '').replace(/"/g,'&quot;');
}

/* ── Research Papers Filter ────────────────────────────────────────────────── */
document.getElementById('papers-filter-bar')?.addEventListener('click', e => {
  const btn = e.target.closest('.papers-filter-btn');
  if (!btn) return;
  document.querySelectorAll('.papers-filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  const filter = btn.dataset.filter;
  document.querySelectorAll('.paper-card').forEach(card => {
    const tags = card.dataset.tags || '';
    card.classList.toggle('hidden', filter !== '' && !tags.includes(filter));
  });
});

/* ── Explore Tab Switching ─────────────────────────────────────────────────── */
document.querySelector('.explore-tabs')?.addEventListener('click', e => {
  const tab = e.target.closest('.explore-tab');
  if (!tab) return;
  const id = tab.dataset.tab;
  document.querySelectorAll('.explore-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.explore-tab-panel').forEach(p => p.classList.remove('active'));
  tab.classList.add('active');
  document.getElementById(`tab-${id}`)?.classList.add('active');
});

/* ── Explore Publications Filter ───────────────────────────────────────────── */
document.getElementById('explore-papers-filter')?.addEventListener('click', e => {
  const btn = e.target.closest('.papers-filter-btn');
  if (!btn) return;
  document.querySelectorAll('#explore-papers-filter .papers-filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  const filter = btn.dataset.filter;
  document.querySelectorAll('#explore-papers-grid .paper-card').forEach(card => {
    card.classList.toggle('hidden', filter !== '' && !(card.dataset.tags || '').includes(filter));
  });
});
