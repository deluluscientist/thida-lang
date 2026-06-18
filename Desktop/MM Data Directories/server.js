require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const path = require('path');
const multer = require('multer');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cors = require('cors');
const xss = require('xss');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.SESSION_SECRET || 'mmdata_dev_secret';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/^image\/(jpeg|png|gif|webp|svg\+xml)$/.test(file.mimetype)) cb(null, true);
    else cb(new Error('Images only'));
  }
});

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true); // same-origin / server-to-server
    const allowed = process.env.ALLOWED_ORIGINS
      ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim())
      : ['http://localhost:3000'];
    if (allowed.some(o => origin === o || origin.endsWith('.netlify.app'))) return cb(null, true);
    cb(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Too many login attempts. Try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  message: { error: 'Too many requests.' },
});
app.use('/api/', apiLimiter);
app.use('/public', express.static(path.join(__dirname, 'public')));
app.use('/admin-assets', express.static(path.join(__dirname, 'admin')));

// ── Sanitize ─────────────────────────────────────────────────────────────────
const clean = v => (v == null ? v : xss(String(v)));
const cleanBody = (obj, fields) => {
  const out = {};
  fields.forEach(f => { out[f] = obj[f] != null ? clean(obj[f]) : obj[f]; });
  return out;
};

// ── Auth ──────────────────────────────────────────────────────────────────────
function requireAuth(req, res, next) {
  const token = req.cookies?.auth_token;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try { jwt.verify(token, JWT_SECRET); next(); }
  catch { res.status(401).json({ error: 'Unauthorized' }); }
}

// ── Stats ─────────────────────────────────────────────────────────────────────
app.get('/api/stats', async (req, res) => {
  try {
    const [{ count: totalDatasets }, { count: totalCategories }, { data: srcRows }] = await Promise.all([
      supabase.from('datasets').select('*', { count: 'exact', head: true }),
      supabase.from('categories').select('*', { count: 'exact', head: true }),
      supabase.from('datasets').select('source').not('source', 'is', null).not('source', 'eq', ''),
    ]);
    const totalSources = new Set((srcRows || []).map(r => r.source)).size;
    res.json({ totalDatasets, totalCategories, totalSources });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Categories ────────────────────────────────────────────────────────────────
app.get('/api/categories', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('categories')
      .select('*, datasets(id)');
    if (error) throw error;
    const rows = data.map(c => ({ ...c, count: c.datasets?.length || 0, datasets: undefined }))
      .sort((a, b) => b.count - a.count);
    res.json(rows);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Datasets ──────────────────────────────────────────────────────────────────
app.get('/api/datasets', async (req, res) => {
  try {
    const { q, category, featured, limit = 50, offset = 0 } = req.query;
    let query = supabase.from('datasets').select('*, categories(name, slug, color)', { count: 'exact' });
    if (q) query = query.or(`title.ilike.%${q}%,description.ilike.%${q}%,tags.ilike.%${q}%,source.ilike.%${q}%`);
    if (featured === '1') query = query.eq('featured', 1);
    if (category) {
      const { data: cat } = await supabase.from('categories').select('id').eq('slug', category).single();
      if (cat) query = query.eq('category_id', cat.id);
    }
    const { data, count, error } = await query
      .order('featured', { ascending: false })
      .order('created_at', { ascending: false })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);
    if (error) throw error;
    const datasets = (data || []).map(d => ({
      ...d, category_name: d.categories?.name,
      category_slug: d.categories?.slug, category_color: d.categories?.color, categories: undefined
    }));
    res.json({ datasets, total: count || 0, limit: parseInt(limit), offset: parseInt(offset) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/datasets/:id', async (req, res) => {
  try {
    const { data, error } = await supabase.from('datasets')
      .select('*, categories(name, slug, color)').eq('id', req.params.id).single();
    if (error || !data) return res.status(404).json({ error: 'Not found' });
    res.json({ ...data, category_name: data.categories?.name, category_slug: data.categories?.slug, category_color: data.categories?.color, categories: undefined });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Settings ──────────────────────────────────────────────────────────────────
app.get('/api/settings', async (req, res) => {
  try {
    const { data } = await supabase.from('site_settings').select('key, value');
    const obj = {};
    (data || []).forEach(r => { obj[r.key] = r.value; });
    res.json(obj);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Admin Auth ────────────────────────────────────────────────────────────────
app.post('/api/admin/login', loginLimiter, async (req, res) => {
  const { username, password } = req.body;
  if (username !== process.env.ADMIN_USERNAME) return res.status(401).json({ error: 'Invalid credentials' });
  const valid = await bcrypt.compare(password, process.env.ADMIN_PASSWORD_HASH);
  if (!valid) return res.status(401).json({ error: 'Invalid credentials' });
  const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: '8h' });
  const isProd = process.env.NODE_ENV === 'production';
  res.cookie('auth_token', token, { httpOnly: true, maxAge: 8 * 60 * 60 * 1000, sameSite: isProd ? 'none' : 'lax', secure: isProd, path: '/' });
  res.json({ success: true });
});

app.post('/api/admin/logout', (req, res) => {
  const isProd = process.env.NODE_ENV === 'production';
  res.clearCookie('auth_token', { path: '/', sameSite: isProd ? 'none' : 'lax', secure: isProd });
  res.json({ success: true });
});

app.get('/api/admin/check', (req, res) => {
  const token = req.cookies?.auth_token;
  if (!token) return res.json({ authenticated: false });
  try { jwt.verify(token, JWT_SECRET); res.json({ authenticated: true }); }
  catch { res.json({ authenticated: false }); }
});

app.post('/api/admin/change-password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const valid = await bcrypt.compare(currentPassword, process.env.ADMIN_PASSWORD_HASH);
  if (!valid) return res.status(401).json({ error: 'Current password is incorrect' });
  const newHash = await bcrypt.hash(newPassword, 12);
  res.json({ success: true, newHash, message: 'Update ADMIN_PASSWORD_HASH in your .env and Netlify env vars.' });
});

// ── Admin: Categories ─────────────────────────────────────────────────────────
app.get('/api/admin/categories', requireAuth, async (req, res) => {
  try {
    const { data } = await supabase.from('categories').select('*, datasets(id)').order('name');
    res.json((data || []).map(c => ({ ...c, count: c.datasets?.length || 0, datasets: undefined })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/categories', requireAuth, async (req, res) => {
  try {
    const { name, slug, color } = cleanBody(req.body, ['name','slug','color']);
    const { data, error } = await supabase.from('categories')
      .insert({ name, slug: slug || name.toLowerCase().replace(/\s+/g, '-'), color: color || '#4a7c59' })
      .select().single();
    if (error) throw error;
    res.json({ id: data.id });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.put('/api/admin/categories/:id', requireAuth, async (req, res) => {
  try {
    const { name, slug, color } = cleanBody(req.body, ['name','slug','color']);
    await supabase.from('categories').update({ name, slug, color }).eq('id', req.params.id);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/admin/categories/:id', requireAuth, async (req, res) => {
  try {
    const { count } = await supabase.from('datasets').select('*', { count: 'exact', head: true }).eq('category_id', req.params.id);
    if (count > 0) return res.status(400).json({ error: `Cannot delete — ${count} dataset(s) use this category` });
    await supabase.from('categories').delete().eq('id', req.params.id);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Admin: Datasets ───────────────────────────────────────────────────────────
app.get('/api/admin/datasets', requireAuth, async (req, res) => {
  try {
    const { q, category, limit = 200, offset = 0 } = req.query;
    let query = supabase.from('datasets').select('*, categories(name)', { count: 'exact' });
    if (q) query = query.or(`title.ilike.%${q}%,source.ilike.%${q}%`);
    if (category) query = query.eq('category_id', category);
    const { data, count } = await query.order('created_at', { ascending: false })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);
    const datasets = (data || []).map(d => ({ ...d, category_name: d.categories?.name, categories: undefined }));
    res.json({ datasets, total: count || 0 });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/admin/datasets/:id', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabase.from('datasets').select('*, categories(name)').eq('id', req.params.id).single();
    if (error || !data) return res.status(404).json({ error: 'Not found' });
    res.json({ ...data, category_name: data.categories?.name, categories: undefined });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/upload', requireAuth, upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  try {
    const ext = path.extname(req.file.originalname).toLowerCase();
    const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
    const { error } = await supabase.storage.from('uploads').upload(filename, req.file.buffer, { contentType: req.file.mimetype });
    if (error) throw error;
    const { data: { publicUrl } } = supabase.storage.from('uploads').getPublicUrl(filename);
    res.json({ url: publicUrl });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/datasets', requireAuth, async (req, res) => {
  try {
    const { title, description, category_id, source, source_url, license, data_types, tags, label, year, featured, cover_image } = cleanBody(req.body, ['title','description','source','source_url','license','data_types','tags','label','year','cover_image']);
    const { data, error } = await supabase.from('datasets')
      .insert({ title, description, category_id: category_id || null, source, source_url, license, data_types, tags, label, year, featured: featured ? 1 : 0, cover_image: cover_image || null })
      .select().single();
    if (error) throw error;
    res.json({ id: data.id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/admin/datasets/:id', requireAuth, async (req, res) => {
  try {
    const { title, description, category_id, source, source_url, license, data_types, tags, label, year, featured, cover_image } = cleanBody(req.body, ['title','description','source','source_url','license','data_types','tags','label','year','cover_image']);
    await supabase.from('datasets').update({ title, description, category_id: category_id || null, source, source_url, license, data_types, tags, label, year, featured: featured ? 1 : 0, cover_image: cover_image || null, updated_at: new Date().toISOString() }).eq('id', req.params.id);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/admin/datasets/:id', requireAuth, async (req, res) => {
  try {
    await supabase.from('datasets').delete().eq('id', req.params.id);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/admin/settings', requireAuth, async (req, res) => {
  try {
    const rows = Object.entries(req.body).map(([key, value]) => ({ key, value }));
    await supabase.from('site_settings').upsert(rows, { onConflict: 'key' });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Articles ──────────────────────────────────────────────────────────────────
app.get('/api/articles', async (req, res) => {
  try {
    const { tag, label, limit = 20, offset = 0 } = req.query;
    let query = supabase.from('articles').select('id, title, slug, excerpt, author, tag, label, cover_image, created_at', { count: 'exact' }).eq('published', 1);
    if (tag) query = query.eq('tag', tag);
    if (label) query = query.eq('label', label);
    const { data, count } = await query.order('created_at', { ascending: false })
      .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);
    res.json({ articles: data || [], total: count || 0 });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/articles/:slug', async (req, res) => {
  try {
    const { data, error } = await supabase.from('articles').select('*').eq('slug', req.params.slug).eq('published', 1).single();
    if (error || !data) return res.status(404).json({ error: 'Not found' });
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/admin/articles', requireAuth, async (req, res) => {
  try {
    const { data } = await supabase.from('articles').select('id, title, slug, excerpt, author, tag, label, cover_image, published, created_at').order('created_at', { ascending: false });
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/admin/articles/:id', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabase.from('articles').select('*').eq('id', req.params.id).single();
    if (error || !data) return res.status(404).json({ error: 'Not found' });
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/articles', requireAuth, async (req, res) => {
  try {
    const { title, slug, excerpt, content, author, tag, label, cover_image, published } = cleanBody(req.body, ['title','slug','excerpt','author','tag','label','cover_image']);
    const autoSlug = slug || title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const { data, error } = await supabase.from('articles')
      .insert({ title, slug: autoSlug, excerpt, content, author: author || 'MM Data Directories', tag, label: label || null, cover_image: cover_image || null, published: published ? 1 : 0 })
      .select().single();
    if (error) throw error;
    res.json({ id: data.id });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.put('/api/admin/articles/:id', requireAuth, async (req, res) => {
  try {
    const { title, slug, excerpt, content, author, tag, label, cover_image, published } = cleanBody(req.body, ['title','slug','excerpt','author','tag','label','cover_image']);
    await supabase.from('articles').update({ title, slug, excerpt, content, author, tag, label: label || null, cover_image: cover_image || null, published: published ? 1 : 0, updated_at: new Date().toISOString() }).eq('id', req.params.id);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/admin/articles/:id', requireAuth, async (req, res) => {
  try {
    await supabase.from('articles').delete().eq('id', req.params.id);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Guides ────────────────────────────────────────────────────────────────────
app.get('/api/guides', async (req, res) => {
  try {
    const { section } = req.query;
    let query = supabase.from('guides').select('id, title, slug, section, excerpt, difficulty, sort_order').eq('published', 1);
    if (section) query = query.eq('section', section);
    const { data } = await query.order('section').order('sort_order').order('id');
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/guides/:slug', async (req, res) => {
  try {
    const { data, error } = await supabase.from('guides').select('*').eq('slug', req.params.slug).eq('published', 1).single();
    if (error || !data) return res.status(404).json({ error: 'Not found' });
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/admin/guides', requireAuth, async (req, res) => {
  try {
    const { data } = await supabase.from('guides').select('*').order('section').order('sort_order').order('id');
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/admin/guides/:id', requireAuth, async (req, res) => {
  try {
    const { data, error } = await supabase.from('guides').select('*').eq('id', req.params.id).single();
    if (error || !data) return res.status(404).json({ error: 'Not found' });
    res.json(data);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/guides', requireAuth, async (req, res) => {
  try {
    const { title, slug, section, excerpt, content, difficulty, published, sort_order, cover_image } = req.body;
    if (!title || !slug) return res.status(400).json({ error: 'Title and slug required' });
    const { data, error } = await supabase.from('guides')
      .insert({ title, slug, section: section || 'Tools', excerpt: excerpt || '', content: content || '', difficulty: difficulty || 'Beginner', published: published ? 1 : 0, sort_order: sort_order || 0, cover_image: cover_image || null })
      .select().single();
    if (error) throw error;
    res.json({ id: data.id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/admin/guides/:id', requireAuth, async (req, res) => {
  try {
    const { title, slug, section, excerpt, content, difficulty, published, sort_order, cover_image } = req.body;
    await supabase.from('guides').update({ title, slug, section, excerpt: excerpt || '', content: content || '', difficulty: difficulty || 'Beginner', published: published ? 1 : 0, sort_order: sort_order || 0, cover_image: cover_image || null, updated_at: new Date().toISOString() }).eq('id', req.params.id);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/admin/guides/:id', requireAuth, async (req, res) => {
  try {
    await supabase.from('guides').delete().eq('id', req.params.id);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Case Studies ──────────────────────────────────────────────────────────────
app.get('/api/case-studies', async (req, res) => {
  try {
    const { data } = await supabase.from('case_studies').select('*').eq('published', 1).order('created_at', { ascending: false });
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/admin/case-studies', requireAuth, async (req, res) => {
  try {
    const { data } = await supabase.from('case_studies').select('*').order('created_at', { ascending: false });
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/admin/case-studies', requireAuth, async (req, res) => {
  try {
    const { title, tag, excerpt, org, year, datasets_used, published, cover_image } = req.body;
    if (!title) return res.status(400).json({ error: 'Title required' });
    const { data, error } = await supabase.from('case_studies')
      .insert({ title, tag: tag || '', excerpt: excerpt || '', org: org || '', year: year || '', datasets_used: datasets_used || '', published: published ? 1 : 0, cover_image: cover_image || null })
      .select().single();
    if (error) throw error;
    res.json({ id: data.id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/admin/case-studies/:id', requireAuth, async (req, res) => {
  try {
    const { title, tag, excerpt, org, year, datasets_used, published, cover_image } = req.body;
    await supabase.from('case_studies').update({ title, tag: tag || '', excerpt: excerpt || '', org: org || '', year: year || '', datasets_used: datasets_used || '', published: published ? 1 : 0, cover_image: cover_image || null }).eq('id', req.params.id);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/admin/case-studies/:id', requireAuth, async (req, res) => {
  try {
    await supabase.from('case_studies').delete().eq('id', req.params.id);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Submissions ───────────────────────────────────────────────────────────────
app.post('/api/submissions', async (req, res) => {
  try {
    const { title, url, source, category, description, email } = cleanBody(req.body, ['title','url','source','category','description','email']);
    if (!title || !url) return res.status(400).json({ error: 'Title and URL are required' });
    await supabase.from('submissions').insert({ title, url, source: source || '', category: category || '', description: description || '', email: email || '' });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/admin/submissions', requireAuth, async (req, res) => {
  try {
    const { data } = await supabase.from('submissions').select('*').order('created_at', { ascending: false });
    res.json(data || []);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/admin/submissions/:id', requireAuth, async (req, res) => {
  try {
    await supabase.from('submissions').update({ status: req.body.status }).eq('id', req.params.id);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/admin/submissions/:id', requireAuth, async (req, res) => {
  try {
    await supabase.from('submissions').delete().eq('id', req.params.id);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ── Pages ─────────────────────────────────────────────────────────────────────
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`\n  MM Data Directories running at http://localhost:${PORT}`);
    console.log(`  Admin panel: http://localhost:${PORT}/admin\n`);
  });
}

module.exports = app;
