/**
 * cookie-consent.js
 * Drop-in cookie consent & cookie blocking — zero dependencies, vanilla JS
 *
 * ─── QUICK START ────────────────────────────────────────────────────────────
 *
 *  1. Add this script in <head> BEFORE any analytics/marketing scripts:
 *       <script src="cookie-consent.js"></script>
 *
 *  2. Block inline scripts by changing their type and adding a category:
 *       <script type="text/plain" data-cookie-category="analytics">
 *         // your GA / Hotjar / etc. code here
 *       </script>
 *
 *  3. Block external scripts the same way, using data-src instead of src:
 *       <script type="text/plain"
 *               data-cookie-category="analytics"
 *               data-src="https://www.googletagmanager.com/gtag/js?id=G-XXXXXX">
 *       </script>
 *
 *  4. (Optional) Add a "Cookie preferences" link anywhere in your page:
 *       <a href="#" onclick="CookieConsent.openPreferences(); return false;">
 *         Cookie settings
 *       </a>
 *
 * ─── CATEGORIES ─────────────────────────────────────────────────────────────
 *   necessary    always active, no consent needed
 *   analytics    e.g. Google Analytics, Hotjar
 *   marketing    e.g. Facebook Pixel, ad trackers
 *   preferences  e.g. theme, language choices
 *
 * ─── PUBLIC API ─────────────────────────────────────────────────────────────
 *   CookieConsent.init(options)       initialise (called automatically)
 *   CookieConsent.hasConsent(cat)     check consent at runtime → boolean
 *   CookieConsent.openPreferences()   open the settings modal programmatically
 *   CookieConsent.reset()             clear stored consent & reload (for testing)
 */

const CookieConsent = (() => {
  const STORAGE_KEY = 'cookie_consent';
  const CONSENT_VERSION = '2'; // bump this string to force re-consent

  // ─── Category definitions ────────────────────────────────────────────────
  const CATEGORIES = {
    necessary: {
      label: 'Necessary',
      description: 'Required for the website to function. Cannot be disabled.',
      required: true,
      default: true,
    },
    analytics: {
      label: 'Analytics',
      description: 'Help us understand how visitors interact with the site (e.g. Google Analytics).',
      required: false,
      default: false,
    },
    marketing: {
      label: 'Marketing',
      description: 'Used to deliver relevant ads and track campaign effectiveness.',
      required: false,
      default: false,
    },
    preferences: {
      label: 'Preferences',
      description: 'Remember settings like language and theme across visits.',
      required: false,
      default: false,
    },
  };

  // ─── Known cookie names per category (for cleanup on revoke) ────────────
  const COOKIE_MAP = {
    analytics:   ['_ga', '_gid', '_gat', '_gat_gtag', '__hstc', 'hubspotutk', '_hjid', '_hjSessionUser'],
    marketing:   ['_fbp', '_fbc', 'fr', 'tr', '__gads'],
    preferences: ['lang', 'theme', 'currency'],
  };

  let consent = null;

  // ─── Persistence ─────────────────────────────────────────────────────────
  function save(prefs) {
    const payload = JSON.stringify({ version: CONSENT_VERSION, prefs, ts: Date.now() });
    try {
      localStorage.setItem(STORAGE_KEY, payload);
    } catch (_) {
      const exp = new Date(Date.now() + 365 * 864e5).toUTCString();
      document.cookie = `${STORAGE_KEY}=${encodeURIComponent(payload)};expires=${exp};path=/;SameSite=Lax`;
    }
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const d = JSON.parse(raw);
        if (d.version === CONSENT_VERSION) return d.prefs;
      }
    } catch (_) {}
    const m = document.cookie.match(new RegExp(`(?:^|; )${STORAGE_KEY}=([^;]*)`));
    if (m) {
      try {
        const d = JSON.parse(decodeURIComponent(m[1]));
        if (d.version === CONSENT_VERSION) return d.prefs;
      } catch (_) {}
    }
    return null;
  }

  // ─── Script activation ───────────────────────────────────────────────────
  function activateScripts(category) {
    document.querySelectorAll(
      `script[type="text/plain"][data-cookie-category="${category}"]`
    ).forEach(el => {
      const s = document.createElement('script');
      Array.from(el.attributes).forEach(a => {
        if (a.name === 'type') return;
        if (a.name === 'data-src') s.src = a.value;
        else s.setAttribute(a.name, a.value);
      });
      s.type = 'text/javascript';
      if (!el.getAttribute('data-src')) s.textContent = el.textContent;
      el.parentNode.replaceChild(s, el);
    });
  }

  // ─── Cookie cleanup ──────────────────────────────────────────────────────
  function deleteCookies(category) {
    (COOKIE_MAP[category] || []).forEach(name => {
      [`path=/`, `path=/;domain=${location.hostname}`, `path=/;domain=.${location.hostname}`].forEach(tail => {
        document.cookie = `${name}=;expires=Thu,01 Jan 1970 00:00:00 GMT;${tail}`;
      });
    });
  }

  // ─── Apply consent ───────────────────────────────────────────────────────
  function applyConsent(prefs) {
    // Delete cookies for newly-revoked categories
    if (consent) {
      Object.keys(CATEGORIES).forEach(cat => {
        if (consent[cat] && !prefs[cat]) deleteCookies(cat);
      });
    }
    consent = prefs;
    Object.entries(prefs).forEach(([cat, allowed]) => {
      if (allowed) activateScripts(cat);
    });
    save(prefs);
    document.dispatchEvent(new CustomEvent('cc:consent', { detail: prefs }));
  }

  function defaultPrefs() {
    return Object.fromEntries(
      Object.entries(CATEGORIES).map(([k, v]) => [k, v.required ? true : v.default])
    );
  }

  function acceptAll() {
    applyConsent(Object.fromEntries(Object.keys(CATEGORIES).map(k => [k, true])));
  }

  function rejectAll() {
    applyConsent(defaultPrefs());
  }

  // ─── Styles (injected once) ───────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById('cc-styles')) return;
    const style = document.createElement('style');
    style.id = 'cc-styles';
    style.textContent = `
      #cc-banner,#cc-overlay,#cc-modal{box-sizing:border-box;font-family:'Segoe UI',system-ui,sans-serif}
      #cc-banner *,#cc-overlay *,#cc-modal *{box-sizing:inherit}

      /* ── Banner ── */
      #cc-banner{
        position:fixed;bottom:1.25rem;left:50%;transform:translateX(-50%);
        width:min(580px,calc(100vw - 1.5rem));
        background:#18181b;color:#e4e4e7;
        border:1px solid #27272a;border-radius:16px;
        padding:1.25rem 1.5rem;font-size:.875rem;line-height:1.55;
        box-shadow:0 12px 50px rgba(0,0,0,.55);
        display:flex;gap:1.25rem;align-items:center;
        z-index:99999;
        animation:cc-up .35s cubic-bezier(.22,1,.36,1) both;
      }
      @keyframes cc-up{from{opacity:0;transform:translateX(-50%) translateY(16px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}
      #cc-banner.cc-out{animation:cc-down .28s ease forwards}
      @keyframes cc-down{to{opacity:0;transform:translateX(-50%) translateY(16px)}}

      #cc-banner .cc-text{flex:1;min-width:0}
      #cc-banner .cc-text p{margin:0}
      #cc-banner .cc-text a{color:#60a5fa;text-decoration:none}
      #cc-banner .cc-actions{display:flex;flex-direction:column;gap:.45rem;flex-shrink:0}

      @media(max-width:500px){
        #cc-banner{flex-direction:column}
        #cc-banner .cc-actions{flex-direction:row;flex-wrap:wrap}
      }

      /* ── Buttons ── */
      .cc-btn{
        border:none;border-radius:8px;padding:.52rem 1.1rem;
        font-size:.8rem;font-weight:600;cursor:pointer;
        transition:opacity .15s,transform .1s;white-space:nowrap;
        line-height:1;
      }
      .cc-btn:hover{opacity:.85}
      .cc-btn:active{transform:scale(.97)}
      .cc-btn-accept{background:#fff;color:#111}
      .cc-btn-reject{background:transparent;color:#a1a1aa;border:1px solid #3f3f46}
      .cc-btn-manage{background:transparent;color:#60a5fa;border:1px solid #27272a}
      .cc-btn-save{background:#2563eb;color:#fff}
      .cc-btn-accept-all{background:#fff;color:#111}

      /* ── Overlay & Modal ── */
      #cc-overlay{
        position:fixed;inset:0;background:rgba(0,0,0,.65);
        z-index:100000;display:flex;align-items:center;justify-content:center;padding:1rem;
        animation:cc-fade .2s ease
      }
      @keyframes cc-fade{from{opacity:0}to{opacity:1}}

      #cc-modal{
        background:#18181b;color:#e4e4e7;
        border:1px solid #27272a;border-radius:18px;
        width:min(520px,100%);max-height:88vh;overflow-y:auto;
        padding:1.75rem 2rem;font-size:.875rem;line-height:1.55;
        box-shadow:0 24px 80px rgba(0,0,0,.6);
      }
      #cc-modal h2{margin:0 0 .4rem;font-size:1.1rem;font-weight:700}
      #cc-modal>.cc-subtitle{margin:0 0 1.5rem;color:#71717a;font-size:.8rem}

      /* ── Category cards ── */
      .cc-cat{
        border:1px solid #27272a;border-radius:12px;
        padding:1rem 1.1rem;margin-bottom:.75rem;
      }
      .cc-cat-header{display:flex;align-items:center;justify-content:space-between;gap:1rem}
      .cc-cat-header strong{font-size:.875rem}
      .cc-cat p{margin:.3rem 0 0;color:#71717a;font-size:.77rem}

      /* ── Toggle switch ── */
      .cc-toggle{position:relative;display:inline-block;width:44px;height:24px;flex-shrink:0}
      .cc-toggle input{opacity:0;width:0;height:0}
      .cc-track{
        position:absolute;inset:0;background:#3f3f46;border-radius:24px;
        cursor:pointer;transition:background .2s;
      }
      .cc-track::before{
        content:'';position:absolute;
        width:18px;height:18px;left:3px;top:3px;
        background:#71717a;border-radius:50%;
        transition:transform .2s,background .2s;
      }
      .cc-toggle input:checked + .cc-track{background:#2563eb}
      .cc-toggle input:checked + .cc-track::before{transform:translateX(20px);background:#fff}
      .cc-toggle input:disabled + .cc-track{cursor:not-allowed;opacity:.5}

      /* ── Modal footer ── */
      .cc-modal-footer{display:flex;gap:.75rem;margin-top:1.5rem;flex-wrap:wrap}
      .cc-modal-footer .cc-btn{flex:1;text-align:center;padding:.7rem 1rem}
      .cc-btn-decline-all{flex-basis:100% !important;order:3}
    `;
    document.head.appendChild(style);
  }

  // ─── Banner ───────────────────────────────────────────────────────────────
  function createBanner() {
    injectStyles();
    const banner = document.createElement('div');
    banner.id = 'cc-banner';
    banner.setAttribute('role', 'dialog');
    banner.setAttribute('aria-label', 'Cookie consent');

    banner.innerHTML = `
      <div class="cc-text">
        <p>We use cookies to enhance your experience.
           <a href="/privacy" target="_blank">Privacy policy</a></p>
      </div>
      <div class="cc-actions">
        <button class="cc-btn cc-btn-accept" id="cc-accept-all">Accept all</button>
        <button class="cc-btn cc-btn-manage" id="cc-manage">Manage</button>
        <button class="cc-btn cc-btn-reject" id="cc-reject-all">Decline all</button>
      </div>
    `;

    document.body.appendChild(banner);

    function dismiss() {
      banner.classList.add('cc-out');
      setTimeout(() => banner.remove(), 300);
    }

    banner.querySelector('#cc-accept-all').onclick = () => { acceptAll(); dismiss(); };
    banner.querySelector('#cc-reject-all').onclick = () => { rejectAll(); dismiss(); };
    banner.querySelector('#cc-manage').onclick = () => openModal(dismiss);
  }

  // ─── Preferences modal ────────────────────────────────────────────────────
  function openModal(onClose) {
    injectStyles();
    const overlay = document.createElement('div');
    overlay.id = 'cc-overlay';

    const modal = document.createElement('div');
    modal.id = 'cc-modal';
    modal.setAttribute('role', 'document');

    const current = consent || defaultPrefs();

    modal.innerHTML = `
      <h2>Cookie Preferences</h2>
      <p class="cc-subtitle">Choose which cookies you allow. Necessary cookies are always active.</p>
      ${Object.entries(CATEGORIES).map(([key, cat]) => `
        <div class="cc-cat">
          <div class="cc-cat-header">
            <strong>${cat.label}</strong>
            <label class="cc-toggle" aria-label="${cat.label}">
              <input type="checkbox" data-cat="${key}"
                ${(cat.required || current[key]) ? 'checked' : ''}
                ${cat.required ? 'disabled' : ''} />
              <span class="cc-track"></span>
            </label>
          </div>
          <p>${cat.description}</p>
        </div>
      `).join('')}
      <div class="cc-modal-footer">
        <button class="cc-btn cc-btn-save" id="cc-save">Save preferences</button>
        <button class="cc-btn cc-btn-accept-all" id="cc-modal-accept">Accept all</button>
        <button class="cc-btn cc-btn-reject cc-btn-decline-all" id="cc-modal-decline">Decline all</button>
      </div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    function close() { overlay.remove(); if (onClose) onClose(); }

    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

    modal.querySelector('#cc-save').onclick = () => {
      const prefs = defaultPrefs();
      modal.querySelectorAll('input[data-cat]').forEach(inp => {
        prefs[inp.dataset.cat] = inp.checked;
      });
      applyConsent(prefs);
      close();
    };

    modal.querySelector('#cc-modal-accept').onclick = () => { acceptAll(); close(); };
    modal.querySelector('#cc-modal-decline').onclick = () => { rejectAll(); close(); };
  }

  // ─── Public API ───────────────────────────────────────────────────────────
  return {
    init(options = {}) {
      if (options.categories) Object.assign(CATEGORIES, options.categories);
      if (options.cookieMap)  Object.assign(COOKIE_MAP, options.cookieMap);

      const stored = load();
      if (stored) {
        // Returning visitor: silently honour saved choices
        consent = stored;
        Object.entries(stored).forEach(([cat, allowed]) => {
          if (allowed) activateScripts(cat);
        });
      } else {
        // First visit: activate necessary-only, show banner
        activateScripts('necessary');
        const show = () => createBanner();
        document.readyState === 'loading'
          ? document.addEventListener('DOMContentLoaded', show)
          : show();
      }
    },

    /** Returns true if the given category has been consented to */
    hasConsent(category) {
      return !!(consent && consent[category]);
    },

    /** Open preferences modal (e.g. from a footer link) */
    openPreferences() {
      openModal(null);
    },

    /** Wipe stored consent and reload — useful for testing */
    reset() {
      try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}
      const exp = 'Thu,01 Jan 1970 00:00:00 GMT';
      document.cookie = `${STORAGE_KEY}=;expires=${exp};path=/`;
      location.reload();
    },
  };
})();

// Auto-initialise — remove this line to init manually via CookieConsent.init()
CookieConsent.init();