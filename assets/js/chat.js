/* ============================================================
   SAPA BPS — pengontrol widget chat
   - buka/tutup panel
   - kirim pesan ke webhook n8n
   - render bubble bots/user, kartu sumber, typing, error
   - simpan riwayat & sessionId di localStorage
   Konfigurasi ada di assets/js/config.js (window.SAPA_CONFIG).
   ============================================================ */
(function () {
  'use strict';

  var CFG = window.SAPA_CONFIG || {};
  var webhookUrl = CFG.webhookUrl || '';
  var timeoutMs = CFG.timeoutMs || 60000;
  var storageKey = CFG.storageKey || 'sapa-bps-history-v1';
  var greeting = CFG.greeting || '';
  var suggestions = CFG.suggestions || [];

  var widget = document.getElementById('chatWidget');
  var launcher = document.getElementById('chatLauncher');
  var panel = document.getElementById('chatPanel');

  if (!widget || !launcher || !panel) return;

  var closeBtn = panel.querySelector('.icon-btn--close');
  var restartBtn = panel.querySelector('[aria-label="Mulai ulang percakapan"]');
  var openBtns = document.querySelectorAll('.header-cta, .hero-actions .btn-primary');
  var input = document.getElementById('chatInput');
  var form = document.getElementById('chatForm');
  var sendBtn = document.getElementById('sendBtn');
  var messagesEl = document.getElementById('chatMessages');
  var suggestionsEl = document.getElementById('chatSuggestions');

  var state = { sessionId: '', history: [], busy: false };

  /* ---------- util ---------- */
  function nowTime() {
    var d = new Date();
    var h = String(d.getHours()).padStart(2, '0');
    var m = String(d.getMinutes()).padStart(2, '0');
    return h + '.' + m;
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function safeUrl(url) {
    return /^https?:\/\//i.test(String(url || '')) ? url : '';
  }

  /* Render teks: baris kosong -> paragraf, "- " -> list, **tebal**, [teks](url). */
  function textToHtml(text) {
    var lines = String(text || '').split(/\r?\n/);
    var html = '';
    var inList = false;

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      var trimmed = line.trim();

      if (/^[-*]\s+/.test(trimmed)) {
        if (!inList) { html += '<ul>'; inList = true; }
        html += '<li>' + inline(trimmed.replace(/^[-*]\s+/, '')) + '</li>';
      } else {
        if (inList) { html += '</ul>'; inList = false; }
        if (trimmed === '') continue;
        html += '<p>' + inline(trimmed) + '</p>';
      }
    }
    if (inList) html += '</ul>';
    return html;
  }

  function inline(text) {
    var out = escapeHtml(text);
    out = out.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    out = out.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, function (m, label, url) {
      return '<a href="' + url + '" target="_blank" rel="noopener noreferrer">' + label + '</a>';
    });
    return out;
  }

  function normalizeSources(raw) {
    if (!raw) return [];
    var arr = Array.isArray(raw) ? raw : [];
    return arr
      .map(function (s) {
        if (typeof s === 'string') {
          var u = safeUrl(s);
          return u ? { title: u, url: u } : null;
        }
        if (s && typeof s === 'object') {
          var url = safeUrl(s.url || s.link);
          var title = s.title || s.name || s.label || url;
          return url ? { title: title, url: url } : null;
        }
        return null;
      })
      .filter(Boolean);
  }

  var BOT_AVATAR_SVG =
    '<svg viewBox="0 0 48 48"><rect width="48" height="48" rx="12" fill="#0b5cab"/>' +
    '<rect x="11" y="26" width="6" height="12" rx="2" fill="#ffffff"/>' +
    '<rect x="21" y="19" width="6" height="19" rx="2" fill="#8ec5f2"/>' +
    '<rect x="31" y="12" width="6" height="26" rx="2" fill="#f5a623"/>' +
    '<path d="M10 20c6-7 13-7 19-2s9 1 12-3" fill="none" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" opacity=".9"/></svg>';

  var CHECK_SVG =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 12.5 4 4L17 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="m12 16.5 9-9" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" opacity=".65"/></svg>';

  /* ---------- render ---------- */
  function scrollBottom() {
    if (messagesEl) messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function addBotMessage(text, sources) {
    var wrap = document.createElement('div');
    wrap.className = 'msg msg--bot';

    var sourcesHtml = '';
    var list = normalizeSources(sources);
    if (list.length) {
      sourcesHtml = '<div class="sources"><div class="sources-title">' +
        '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>' +
        '<span>Sumber resmi</span></div>';
      list.forEach(function (s) {
        sourcesHtml += '<a href="' + s.url + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(s.title) + '</a>';
      });
      sourcesHtml += '</div>';
    }

    wrap.innerHTML =
      '<div class="msg-avatar" aria-hidden="true">' + BOT_AVATAR_SVG + '</div>' +
      '<div class="bubble">' + textToHtml(text) + sourcesHtml +
      '<div class="msg-meta"><span>' + nowTime() + '</span></div></div>';

    messagesEl.appendChild(wrap);
    scrollBottom();
    return wrap;
  }

  function addUserMessage(text) {
    var wrap = document.createElement('div');
    wrap.className = 'msg msg--user';
    wrap.innerHTML =
      '<div class="bubble">' + textToHtml(text) +
      '<div class="msg-meta"><span>' + nowTime() + '</span>' + CHECK_SVG + '</div></div>';
    messagesEl.appendChild(wrap);
    scrollBottom();
    return wrap;
  }

  function showTyping() {
    var wrap = document.createElement('div');
    wrap.className = 'msg msg--bot typing';
    wrap.innerHTML =
      '<div class="msg-avatar" aria-hidden="true">' + BOT_AVATAR_SVG + '</div>' +
      '<div class="bubble"><span></span><span></span><span></span></div>';
    messagesEl.appendChild(wrap);
    scrollBottom();
    return wrap;
  }

  /* ---------- state ---------- */
  function loadState() {
    try {
      var raw = localStorage.getItem(storageKey);
      if (!raw) return;
      var data = JSON.parse(raw);
      if (data && typeof data === 'object') {
        state.sessionId = data.sessionId || '';
        state.history = Array.isArray(data.history) ? data.history : [];
        state.history.forEach(function (item) {
          if (item.role === 'user') addUserMessage(item.content);
          else if (item.role === 'bot') addBotMessage(item.content, item.sources);
        });
      }
    } catch (e) { /* rusak -> abaikan */ }
  }

  function saveState() {
    try {
      localStorage.setItem(storageKey, JSON.stringify({
        sessionId: state.sessionId,
        history: state.history.slice(-40)
      }));
    } catch (e) { /* penuh -> abaikan */ }
  }

  function newSession() {
    state.sessionId = 'ses-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  }

  function clearConversation() {
    state.history = [];
    newSession();
    saveState();
    messagesEl.innerHTML = '';
    if (greeting) {
      addBotMessage(greeting, []);
      state.history.push({ role: 'bot', content: greeting });
    }
    saveState();
    scrollBottom();
  }

  /* ---------- kirim ---------- */
  function setBusy(busy) {
    state.busy = busy;
    if (sendBtn) sendBtn.disabled = busy;
    if (input) input.disabled = busy;
  }

  function send(text) {
    var message = String(text || '').trim();
    if (!message || state.busy) return;

    if (!state.sessionId) newSession();

    addUserMessage(message);
    state.history.push({ role: 'user', content: message });
    saveState();

    if (input) { input.value = ''; autoGrow(); }
    setBusy(true);
    var typing = showTyping();

    if (!webhookUrl) {
      typing.remove();
      addBotMessage('Alamat webhook n8n belum diatur. Buka `assets/js/config.js` lalu isi `webhookUrl`.', []);
      setBusy(false);
      return;
    }

    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, timeoutMs);

    fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({
        message: message,
        sessionId: state.sessionId,
        history: state.history.slice(-20)
      }),
      signal: controller.signal
    })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) {
        typing.remove();
        var reply = pickReply(data);
        var sources = pickSources(data);
        if (!reply) {
          reply = 'Maaf, saya belum bisa memproses jawaban saat ini. Silakan coba lagi.';
        }
        addBotMessage(reply, sources);
        state.history.push({ role: 'bot', content: reply, sources: normalizeSources(sources) });
        saveState();
      })
      .catch(function (err) {
        typing.remove();
        var msg;
        if (err && err.name === 'AbortError') {
          msg = 'Permintaan melebihi batas waktu. Silakan coba lagi.';
        } else {
          msg = 'Maaf, terjadi kendala koneksi ke server. Coba lagi beberapa saat lagi.';
        }
        addBotMessage(msg, []);
        if (window.console) console.error('[SAPA BPS]', err);
      })
      .then(function () {
        clearTimeout(timer);
        setBusy(false);
        if (input) input.focus({ preventScroll: true });
      });
  }

  /* Tangkap ragam bentuk respons n8n. */
  function pickReply(data) {
    if (!data) return '';
    if (typeof data === 'string') return data;
    var candidates = [data.reply, data.output, data.text, data.message, data.answer, data.response];
    for (var i = 0; i < candidates.length; i++) {
      var v = candidates[i];
      if (typeof v === 'string' && v.trim()) return v.trim();
      if (Array.isArray(v) && v[0] && typeof v[0] === 'object') return pickReply(v[0]);
    }
    if (Array.isArray(data) && data[0]) return pickReply(data[0]);
    return '';
  }

  function pickSources(data) {
    if (!data || typeof data !== 'object') return [];
    return data.sources || data.references || data.citations || data.source || [];
  }

  /* ---------- input ---------- */
  function autoGrow() {
    if (!input) return;
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight, 108) + 'px';
  }

  /* ---------- suggestions ---------- */
  function renderSuggestions() {
    if (!suggestionsEl) return;
    suggestionsEl.innerHTML = '';
    suggestions.forEach(function (label) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = label;
      btn.addEventListener('click', function () { send(label); });
      suggestionsEl.appendChild(btn);
    });
  }

  /* ---------- buka/tutup ---------- */
  function isOpen() {
    return widget.classList.contains('is-open');
  }

  function setOpen(open, options) {
    options = options || {};
    widget.classList.toggle('is-open', open);

    launcher.setAttribute('aria-expanded', String(open));
    launcher.setAttribute(
      'aria-label',
      open ? 'Tutup chatbot SAPA BPS' : 'Buka chatbot SAPA BPS'
    );

    panel.setAttribute('aria-hidden', String(!open));
    if ('inert' in panel) panel.inert = !open;

    if (open) {
      if (options.focusInput && input) input.focus({ preventScroll: true });
      scrollBottom();
    } else if (options.focusLauncher) {
      launcher.focus({ preventScroll: true });
    }
  }

  launcher.addEventListener('click', function () {
    setOpen(!isOpen(), { focusInput: true });
  });

  if (closeBtn) {
    closeBtn.addEventListener('click', function () {
      setOpen(false, { focusLauncher: true });
    });
  }

  if (restartBtn) {
    restartBtn.addEventListener('click', function () {
      clearConversation();
      if (input) input.focus({ preventScroll: true });
    });
  }

  openBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      setOpen(true, { focusInput: true });
    });
  });

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && isOpen()) {
      setOpen(false, { focusLauncher: true });
    }
  });

  /* ---------- form ---------- */
  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      send(input ? input.value : '');
    });
  }

  if (sendBtn) {
    sendBtn.addEventListener('click', function (e) {
      e.preventDefault();
      send(input ? input.value : '');
    });
  }

  if (input) {
    input.addEventListener('input', autoGrow);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        send(input.value);
      }
    });
  }

  /* ---------- init ---------- */
  renderSuggestions();
  loadState();

  var started = state.history.length > 0;
  if (!started && greeting) {
    addBotMessage(greeting, []);
    state.history.push({ role: 'bot', content: greeting });
    saveState();
  }

  setOpen(isOpen(), {});
  autoGrow();
})();