// Applies the saved (or system) colour theme before first paint to avoid a flash.
// Keep in sync with src/store/ThemeContext.tsx.
(function () {
  try {
    var saved = localStorage.getItem('bookworm:theme');
    var theme = saved === 'light' || saved === 'dark'
      ? saved
      : window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    var cls = document.documentElement.classList;
    cls.remove('cds--white', 'cds--g100');
    cls.add(theme === 'light' ? 'cds--white' : 'cds--g100');
  } catch (e) {
    /* storage unavailable: keep the default dark theme */
  }
})();
