/* ==========================================================================
   SAPA BPS — Logika antarmuka chatbot
   --------------------------------------------------------------------------
   Integrasi backend:
   Atur `window.SAPA_BPS.endpoint` sebelum skrip ini dimuat, contoh:

     <script>window.SAPA_BPS = { endpoint: "/api/chat" };</script>

   Saat endpoint diisi, setiap pesan dikirim sebagai POST JSON:
     { message: "…", history: [{ role: "user"|"bot", text: "…" }] }
   dan diharapkan mengembalikan JSON:
     { reply: "teks balasan", sources: [{ label: "…", url: "…" }] }
   Jika endpoint kosong / gagal, bot memakai basis pengetahuan lokal (demo).
   ========================================================================== */

(function () {
  "use strict";

  /* ---------- Konfigurasi ---------- */
  const CONFIG = Object.assign(
    {
      endpoint: null,          // isi path API untuk mode produksi
      storageKey: "sapa-bps-chat-v1",
      themeKey: "sapa-bps-theme",
      maxStored: 60,
      minDelay: 600,
      maxDelay: 1300
    },
    window.SAPA_BPS || {}
  );

  /* ---------- Elemen ---------- */
  const widget = document.getElementById("chatWidget");
  const panel = document.getElementById("chatPanel");
  const launcher = document.getElementById("chatLauncher");
  const badge = document.getElementById("launcherBadge");
  const messagesEl = document.getElementById("chatMessages");
  const form = document.getElementById("chatForm");
  const input = document.getElementById("chatInput");
  const sendBtn = document.getElementById("sendBtn");
  const suggestions = document.getElementById("chatSuggestions");
  const closeBtn = document.getElementById("chatClose");
  const resetBtn = document.getElementById("resetChat");
  const themeBtn = document.getElementById("themeToggle");

  if (!widget || !panel || !messagesEl) return;

  /* ---------- Aset ---------- */
  const LOGO_SVG = `
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <rect width="48" height="48" rx="12" fill="#0b5cab"/>
      <rect x="11" y="26" width="6" height="12" rx="2" fill="#ffffff"/>
      <rect x="21" y="19" width="6" height="19" rx="2" fill="#8ec5f2"/>
      <rect x="31" y="12" width="6" height="26" rx="2" fill="#f5a623"/>
      <path d="M10 20c6-7 13-7 19-2s9 1 12-3" fill="none" stroke="#ffffff"
            stroke-width="2.5" stroke-linecap="round" opacity=".9"/>
    </svg>`;

  const ICON_CHECK = `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m3 12.5 4 4L17 6" fill="none" stroke="currentColor" stroke-width="2"
            stroke-linecap="round" stroke-linejoin="round"/>
      <path d="m12 16.5 9-9" fill="none" stroke="currentColor" stroke-width="2"
            stroke-linecap="round" stroke-linejoin="round" opacity=".65"/>
    </svg>`;

  const ICON_SOURCE = `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" fill="none"
            stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>
      <path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" fill="none"
            stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/>
    </svg>`;

  const SOURCES_PUBLIKASI = [
    { label: "Publikasi BPS", url: "https://www.bps.go.id/id/publication" },
    { label: "Tabel Statistik", url: "https://www.bps.go.id/id/statistics-table" }
  ];

  /* ---------- Basis pengetahuan (mode demo) ---------- */
  const RULES = [
    {
      id: "salam",
      keys: ["halo", "hai", "hi", "hello", "selamat pagi", "selamat siang", "selamat sore", "selamat malam", "pagi", "siang", "sore", "malam"],
      html: `
        <p>Halo! Saya <strong>SAPA BPS</strong>, asisten virtual Badan Pusat Statistik. 👋</p>
        <p>Saya dapat membantu Anda untuk:</p>
        <ul>
          <li>menemukan publikasi dan tabel statistik,</li>
          <li>menjelaskan indikator seperti inflasi, kemiskinan, dan PDB,</li>
          <li>mengarahkan ke layanan PST dan sensus.</li>
        </ul>
        <p>Pertanyaan apa yang bisa saya bantu?</p>`
    },
    {
      id: "publikasi",
      keys: ["publikasi", "unduh", "download", "buku", "laporan", "pdf", "cara mendapat", "mendapatkan data", "cari data"],
      html: `
        <p>Cara mendapatkan publikasi BPS:</p>
        <ul>
          <li>Buka menu <strong>Publikasi</strong> di situs BPS.</li>
          <li>Gunakan filter <em>subjek</em>, <em>tahun</em>, atau kata kunci.</li>
          <li>Pilih publikasi, lalu unduh berkas PDF gratis.</li>
        </ul>
        <p>Data tabel interaktif tersedia di menu <strong>Tabel Statistik</strong>.</p>`,
      sources: SOURCES_PUBLIKASI
    },
    {
      id: "penduduk",
      keys: ["penduduk", "populasi", "jumlah orang", "demografi", "sensus", "sp2020", "kependudukan"],
      html: `
        <p>Data kependudukan resmi BPS bersumber dari <strong>Sensus Penduduk 2020</strong> (SP2020)
        dan proyeksi penduduk yang diperbarui berkala.</p>
        <p>Untuk angka terbaru per provinsi/kabupaten, silakan buka Tabel Statistik dan pilih
        subjek <em>Kependudukan</em>. Saya tidak menampilkan angka dari memori agar tidak keliru —
        data yang ditampilkan sebaiknya selalu merujuk ke rilis resmi.</p>`,
      sources: [
        { label: "Sensus Penduduk 2020", url: "https://sensus.bps.go.id" },
        { label: "Tabel Kependudukan", url: "https://www.bps.go.id/id/statistics-table" }
      ]
    },
    {
      id: "inflasi",
      keys: ["inflasi", "harga", "ihk", "indeks harga konsumen", "kenaikan harga", "deflasi"],
      html: `
        <p><strong>Inflasi</strong> adalah kenaikan harga barang dan jasa secara umum dalam periode tertentu.
        BPS mengukur inflasi nasional melalui <em>Indeks Harga Konsumen (IHK)</em> di sejumlah kota.</p>
        <p>Rilis resmi biasanya dipublikasikan pada <strong>Berita Resmi Statistik</strong> setiap awal bulan,
        lengkap dengan inflasi bulanan dan tahunan per kelompok pengeluaran.</p>`,
      sources: [
        { label: "Berita Resmi Statistik", url: "https://www.bps.go.id/id/pressrelease" },
        { label: "Tabel Inflasi", url: "https://www.bps.go.id/id/statistics-table" }
      ]
    },
    {
      id: "kemiskinan",
      keys: ["miskin", "kemiskinan", "garis kemiskinan", "penduduk miskin"],
      html: `
        <p>BPS menghitung <strong>kemiskinan</strong> menggunakan konsep kemampuan memenuhi kebutuhan dasar
        (pendekatan garis kemiskinan). Angka nasional dirilis berkala melalui Berita Resmi Statistik.</p>
        <p>Rincian menurut provinsi dan kabupaten/kota dapat dilihat pada Tabel Statistik subjek
        <em>Kemiskinan dan Ketimpangan</em>.</p>`,
      sources: [
        { label: "Berita Resmi Statistik", url: "https://www.bps.go.id/id/pressrelease" },
        { label: "Tabel Kemiskinan", url: "https://www.bps.go.id/id/statistics-table" }
      ]
    },
    {
      id: "ketenagakerjaan",
      keys: ["pengangguran", "kerja", "tenaga kerja", "tpak", "buruh", "kesempatan kerja"],
      html: `
        <p>Data <strong>ketenagakerjaan</strong> BPS berasal dari Survei Angkatan Kerja Nasional (Sakernas),
        mencakup Tingkat Pengangguran Terbuka (TPT), Tingkat Partisipasi Angkatan Kerja (TPAK),
        dan lapangan pekerjaan utama.</p>
        <p>Rilis terbaru tersedia di Berita Resmi Statistik dan Tabel Statistik subjek
        <em>Ketenagakerjaan</em>.</p>`,
      sources: [
        { label: "Berita Resmi Statistik", url: "https://www.bps.go.id/id/pressrelease" },
        { label: "Tabel Ketenagakerjaan", url: "https://www.bps.go.id/id/statistics-table" }
      ]
    },
    {
      id: "ekonomi",
      keys: ["pdb", "pertumbuhan ekonomi", "ekonomi", "gdp", "produk domestik bruto", "resesi"],
      html: `
        <p><strong>Pertumbuhan ekonomi</strong> diukur dari perubahan Produk Domestik Bruto (PDB)
        atas dasar harga konstan. BPS merilis data ini setiap kuartal.</p>
        <p>Untuk angka terbaru, lihat Berita Resmi Statistik pertumbuhan ekonomi atau Tabel Statistik
        subjek <em>Produk Domestik Bruto</em>.</p>`,
      sources: [
        { label: "Berita Resmi Statistik", url: "https://www.bps.go.id/id/pressrelease" },
        { label: "Tabel PDB", url: "https://www.bps.go.id/id/statistics-table" }
      ]
    },
    {
      id: "ekspor",
      keys: ["ekspor", "impor", "perdagangan", "neraca dagang"],
      html: `
        <p>Statistik <strong>ekspor–impor</strong> BPS dirilis bulanan, mencakup nilai dan volume
        menurut komoditas, negara tujuan, serta pelabuhan muat.</p>
        <p>Rilis terbaru dapat diakses melalui Berita Resmi Statistik dan Tabel Statistik subjek
        <em>Ekspor dan Impor</em>.</p>`,
      sources: [
        { label: "Berita Resmi Statistik", url: "https://www.bps.go.id/id/pressrelease" },
        { label: "Tabel Ekspor-Impor", url: "https://www.bps.go.id/id/statistics-table" }
      ]
    },
    {
      id: "ipm",
      keys: ["ipm", "indeks pembangunan manusia", "hdi", "harapan hidup", "pendidikan"],
      html: `
        <p><strong>Indeks Pembangunan Manusia (IPM)</strong> mengukur capaian pembangunan manusia
        berdasarkan tiga dimensi: kesehatan (umur harapan hidup), pendidikan (harapan dan rata-rata
        lama sekolah), serta standar hidup layak (pengeluaran per kapita).</p>
        <p>Nilai IPM nasional dan per provinsi dirilis BPS setiap tahun.</p>`,
      sources: [
        { label: "Tabel IPM", url: "https://www.bps.go.id/id/statistics-table" }
      ]
    },
    {
      id: "sensuss",
      keys: ["sensus", "sp2020", "st2023", "se2026", "sensus ekonomi", "sensus pertanian"],
      html: `
        <p>BPS menyelenggarakan sensus secara berkala: <strong>Sensus Penduduk</strong> dan
        <strong>Sensus Perumahan</strong> (10 tahun sekali), <strong>Sensus Pertanian</strong>,
        serta <strong>Sensus Ekonomi</strong>.</p>
        <p>Informasi jadwal, kuesioner, dan hasil sensus tersedia di portal sensus BPS.</p>`,
      sources: [
        { label: "Portal Sensus BPS", url: "https://sensus.bps.go.id" }
      ]
    },
    {
      id: "kontak",
      keys: ["kontak", "hubungi", "telepon", "email", "alamat", "whatsapp", "pst", "pelayanan", "jam layanan", "jam buka"],
      html: `
        <p>Anda dapat menghubungi BPS melalui <strong>Pelayanan Statistik Terpadu (PST)</strong>:</p>
        <ul>
          <li><strong>Alamat:</strong> Jl. Dr. Sutomo No. 6–8, Jakarta 10710</li>
          <li><strong>Telepon:</strong> (021) 3841195, 3842508, 3810291</li>
          <li><strong>Email:</strong> bpshq@bps.go.id</li>
          <li><strong>Jam layanan:</strong> Senin–Jumat, 08.00–15.30 WIB</li>
        </ul>
        <p>Untuk PST daerah, silakan hubungi kantor BPS provinsi/kabupaten/kota terdekat.</p>`,
      sources: [
        { label: "Portal PST BPS", url: "https://www.bps.go.id/id/pst" }
      ]
    },
    {
      id: "tentang",
      keys: ["siapa kamu", "kamu siapa", "apa ini", "tentang", "sapa bps", "chatbot", "bot", "asisten"],
      html: `
        <p>Saya <strong>SAPA BPS</strong>, asisten virtual untuk membantu pengguna menemukan
        informasi statistik dan layanan Badan Pusat Statistik.</p>
        <p>Saya memberikan panduan umum dan tautan ke sumber resmi. Untuk data spesifik,
        selalu gunakan publikasi atau tabel resmi BPS.</p>`
    },
    {
      id: "terima-kasih",
      keys: ["terima kasih", "makasih", "thanks", "thank you", "tq", "oke", "baik"],
      html: `<p>Sama-sama! 😊 Jika ada pertanyaan lain seputar data statistik BPS, silakan tanyakan kembali.</p>`
    }
  ];

  const FALLBACK = {
    html: `
      <p>Maaf, saya belum menemukan jawaban yang tepat untuk pertanyaan itu.</p>
      <p>Coba gunakan kata kunci seperti <strong>inflasi</strong>, <strong>publikasi</strong>,
      <strong>kependudukan</strong>, atau <strong>kontak</strong>. Anda juga dapat menghubungi
      Pelayanan Statistik Terpadu (PST) BPS.</p>`,
    sources: [
      { label: "Situs BPS", url: "https://www.bps.go.id" },
      { label: "PST BPS", url: "https://www.bps.go.id/id/pst" }
    ]
  };

  /* ---------- State ---------- */
  let messages = [];
  let isOpen = false;
  let isTyping = false;
  let unread = 0;
  let queue = Promise.resolve();
  let typingEl = null;

  /* ---------- Util ---------- */
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const now = () => new Date().toISOString();

  function timeLabel(iso) {
    const d = iso ? new Date(iso) : new Date();
    return d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }).replace(".", ":");
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function scrollToBottom(behavior) {
    requestAnimationFrame(() => {
      messagesEl.scrollTo({ top: messagesEl.scrollHeight, behavior: behavior || "smooth" });
    });
  }

  function saveMessages() {
    try {
      localStorage.setItem(CONFIG.storageKey, JSON.stringify(messages.slice(-CONFIG.maxStored)));
    } catch (e) { /* penyimpanan penuh / mode privat */ }
  }

  function loadMessages() {
    try {
      const raw = localStorage.getItem(CONFIG.storageKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) && parsed.length ? parsed : null;
    } catch (e) {
      return null;
    }
  }

  /* ---------- Render pesan ---------- */
  function addMessage(role, html, sources, iso, persist, text) {
    const message = { role, html, sources: sources || null, time: iso || now() };
    if (role === "user") message.text = text == null ? stripHtml(html) : String(text);
    messages.push(message);
    renderMessage(message);
    if (persist !== false) saveMessages();
    return message;
  }

  function renderMessage(message) {
    const wrapper = document.createElement("div");
    wrapper.className = "msg msg--" + (message.role === "user" ? "user" : "bot");

    if (message.role === "bot") {
      const avatar = document.createElement("div");
      avatar.className = "msg-avatar";
      avatar.setAttribute("aria-hidden", "true");
      avatar.innerHTML = LOGO_SVG;
      wrapper.appendChild(avatar);
    }

    const bubble = document.createElement("div");
    bubble.className = "bubble";

    if (message.role === "user") {
      bubble.textContent = message.text || stripHtml(message.html);
    } else {
      bubble.innerHTML = message.html || "";
      if (message.sources && message.sources.length) {
        bubble.appendChild(buildSources(message.sources));
      }
    }

    const meta = document.createElement("div");
    meta.className = "msg-meta";
    meta.innerHTML =
      "<span>" + timeLabel(message.time) + "</span>" +
      (message.role === "user" ? ICON_CHECK : "");
    bubble.appendChild(meta);

    wrapper.appendChild(bubble);
    messagesEl.appendChild(wrapper);
  }

  function stripHtml(html) {
    const tmp = document.createElement("div");
    tmp.innerHTML = html || "";
    return tmp.textContent || "";
  }

  function buildSources(sources) {
    const box = document.createElement("div");
    box.className = "sources";

    const title = document.createElement("div");
    title.className = "sources-title";
    title.innerHTML = ICON_SOURCE + "<span>Sumber resmi</span>";
    box.appendChild(title);

    sources.forEach(function (src) {
      const link = document.createElement("a");
      link.href = src.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = src.label;
      box.appendChild(link);
    });

    return box;
  }

  /* ---------- Indikator mengetik ---------- */
  function showTyping() {
    if (typingEl) return;
    isTyping = true;
    typingEl = document.createElement("div");
    typingEl.className = "msg msg--bot typing";
    typingEl.setAttribute("aria-label", "SAPA BPS sedang mengetik");
    typingEl.innerHTML =
      '<div class="msg-avatar" aria-hidden="true">' + LOGO_SVG + "</div>" +
      '<div class="bubble"><span></span><span></span><span></span></div>';
    messagesEl.appendChild(typingEl);
    scrollToBottom();
  }

  function hideTyping() {
    isTyping = false;
    if (typingEl && typingEl.parentNode) typingEl.parentNode.removeChild(typingEl);
    typingEl = null;
  }

  /* ---------- Balasan bot ---------- */
  function localAnswer(text) {
    const query = " " + text.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ") + " ";
    let best = null;

    RULES.forEach(function (rule) {
      let score = 0;
      rule.keys.forEach(function (key) {
        if (query.indexOf(" " + key.toLowerCase() + " ") !== -1) score += key.length + 4;
        else if (key.length > 4 && query.indexOf(key.toLowerCase()) !== -1) score += key.length;
      });
      if (score > 0 && (!best || score > best.score)) best = { score, rule };
    });

    if (best) return { html: best.rule.html, sources: best.rule.sources };
    return FALLBACK;
  }

  async function fetchAnswer(text) {
    if (!CONFIG.endpoint) return localAnswer(text);

    try {
      const res = await fetch(CONFIG.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          message: text,
          history: messages.map(function (m) {
            return { role: m.role, text: m.role === "user" ? (m.text || "") : stripHtml(m.html) };
          })
        })
      });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      if (!data || !data.reply) throw new Error("Format balasan tidak valid");
      return { html: "<p>" + escapeHtml(data.reply).replace(/\n/g, "<br>") + "</p>", sources: data.sources };
    } catch (err) {
      console.warn("[SAPA BPS] Gagal memanggil endpoint:", err);
      const fallback = localAnswer(text);
      fallback.html = "<p>Koneksi ke server sedang terganggu. Sementara itu:</p>" + fallback.html;
      return fallback;
    }
  }

  async function respond(text) {
    showTyping();
    const delay = CONFIG.minDelay + Math.random() * (CONFIG.maxDelay - CONFIG.minDelay);
    const answerPromise = fetchAnswer(text);
    await wait(delay);
    const answer = await answerPromise;
    hideTyping();

    addMessage("bot", answer.html, answer.sources);
    if (isOpen) scrollToBottom();
    else bumpBadge();
  }

  function sendMessage(rawText) {
    const text = String(rawText || "").trim();
    if (!text) return;

    addMessage("user", null, null, null, true, text);
    saveMessages();

    input.value = "";
    resizeInput();
    updateSendState();
    scrollToBottom();

    queue = queue.then(function () { return respond(text); }).catch(function (err) {
      console.error(err);
      hideTyping();
    });
  }

  /* ---------- Badge & panel ---------- */
  function bumpBadge() {
    unread += 1;
    badge.textContent = unread > 9 ? "9+" : String(unread);
    badge.hidden = false;
  }

  function clearBadge() {
    unread = 0;
    badge.hidden = true;
    badge.textContent = "";
  }

  function openChat(options) {
    if (isOpen) {
      if (options && options.focus) input.focus();
      return;
    }
    isOpen = true;
    widget.classList.add("is-open");
    panel.setAttribute("aria-hidden", "false");
    launcher.setAttribute("aria-expanded", "true");
    clearBadge();
    scrollToBottom("auto");
    if (!options || options.focus !== false) {
      setTimeout(function () { input.focus({ preventScroll: true }); }, 260);
    }
  }

  function closeChat() {
    if (!isOpen) return;
    isOpen = false;
    widget.classList.remove("is-open");
    panel.setAttribute("aria-hidden", "true");
    launcher.setAttribute("aria-expanded", "false");
    launcher.focus({ preventScroll: true });
  }

  /* ---------- Tema ---------- */
  function applyTheme(theme) {
    document.body.setAttribute("data-theme", theme);
    try { localStorage.setItem(CONFIG.themeKey, theme); } catch (e) {}
    themeBtn.setAttribute("aria-label", theme === "dark" ? "Aktifkan tema terang" : "Aktifkan tema gelap");
  }

  function initTheme() {
    let theme = null;
    try { theme = localStorage.getItem(CONFIG.themeKey); } catch (e) {}
    if (!theme) {
      theme = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    applyTheme(theme);
  }

  /* ---------- Input ---------- */
  function resizeInput() {
    input.style.height = "auto";
    input.style.height = Math.min(input.scrollHeight, 108) + "px";
  }

  function updateSendState() {
    sendBtn.disabled = input.value.trim().length === 0;
  }

  /* ---------- Sapaan awal ---------- */
  function seedGreeting() {
    addMessage(
      "bot",
      `<p>Selamat datang di <strong>SAPA BPS</strong> 👋</p>
       <p>Saya siap membantu Anda menemukan publikasi, tabel statistik, dan informasi layanan BPS.</p>
       <p>Silakan pilih pertanyaan di bawah atau tulis langsung pertanyaan Anda.</p>`,
      null,
      null,
      false
    );
    saveMessages();
    if (!isOpen) bumpBadge();
  }

  function restoreHistory() {
    const saved = loadMessages();
    if (saved && saved.length) {
      messages = saved;
      messagesEl.innerHTML = "";
      messages.forEach(renderMessage);
      scrollToBottom("auto");
      if (!isOpen) bumpBadge();
    } else {
      seedGreeting();
    }
  }

  function resetChat() {
    hideTyping();
    messages = [];
    messagesEl.innerHTML = "";
    try { localStorage.removeItem(CONFIG.storageKey); } catch (e) {}
    queue = Promise.resolve();
    seedGreeting();
    clearBadge();
    setTimeout(function () { input.focus({ preventScroll: true }); }, 50);
  }

  /* ---------- Event ---------- */
  launcher.addEventListener("click", function () {
    if (isOpen) closeChat();
    else openChat();
  });

  closeBtn.addEventListener("click", closeChat);
  resetBtn.addEventListener("click", resetChat);

  themeBtn.addEventListener("click", function () {
    const next = document.body.getAttribute("data-theme") === "dark" ? "light" : "dark";
    applyTheme(next);
  });

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    sendMessage(input.value);
  });

  input.addEventListener("input", function () {
    resizeInput();
    updateSendState();
  });

  input.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      if (input.value.trim()) sendMessage(input.value);
    }
  });

  suggestions.addEventListener("click", function (e) {
    const chip = e.target.closest("[data-suggestion]");
    if (!chip) return;
    openChat({ focus: false });
    sendMessage(chip.getAttribute("data-suggestion"));
  });

  document.querySelectorAll("[data-open-chat]").forEach(function (btn) {
    btn.addEventListener("click", function () { openChat(); });
  });

  const attachBtn = document.querySelector(".attach-btn");
  if (attachBtn) {
    attachBtn.addEventListener("click", function () {
      queue = queue.then(async function () {
        if (!isOpen) return;
        showTyping();
        await wait(500);
        hideTyping();
        addMessage(
          "bot",
          "<p>Fitur unggah berkas belum tersedia pada versi demo ini. Silakan ketik pertanyaan Anda, atau hubungi PST BPS untuk pengiriman dokumen.</p>",
          [{ label: "PST BPS", url: "https://www.bps.go.id/id/pst" }]
        );
      });
    });
  }

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && isOpen) closeChat();
  });

  /* ---------- Inisialisasi ---------- */
  initTheme();
  restoreHistory();
  resizeInput();
  updateSendState();

  const yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  /* ---------- API publik (untuk tombol/CTA lain) ---------- */
  window.sapaBps = {
    open: openChat,
    close: closeChat,
    send: function (text) { openChat({ focus: false }); sendMessage(text); },
    reset: resetChat,
    toggleTheme: function () { applyTheme(document.body.getAttribute("data-theme") === "dark" ? "light" : "dark"); }
  };
})();
