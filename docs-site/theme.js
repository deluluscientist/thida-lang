/* ─── Thida Lang Docs — Theme Toggle ─── */
(function () {
  const KEY = 'thida-docs-theme';
  const root = document.documentElement;

  function apply(t) {
    root.setAttribute('data-theme', t);
    const btn = document.getElementById('theme-btn');
    if (btn) btn.textContent = t === 'dark' ? '☀' : '☾';
    localStorage.setItem(KEY, t);
  }

  // Load saved preference (default: dark)
  const saved = localStorage.getItem(KEY) || 'dark';
  apply(saved);

  window.toggleTheme = function () {
    apply(root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
  };

  // Apply again once DOM is ready (fixes flash if script loads in <head>)
  document.addEventListener('DOMContentLoaded', function () {
    apply(localStorage.getItem(KEY) || 'dark');
  });
})();
