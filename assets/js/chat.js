/* ============================================================
   SAPA BPS — pengontrol widget chat
   Menangani buka/tutup panel melalui:
   - tombol launcher (ikon chat / X) di kanan bawah
   - tombol X di header panel chat
   - tombol "Tanya SAPA" & "Mulai percakapan"
   - tombol Escape
   ============================================================ */
(function () {
  'use strict';

  var widget = document.getElementById('chatWidget');
  var launcher = document.getElementById('chatLauncher');
  var panel = document.getElementById('chatPanel');

  if (!widget || !launcher || !panel) return;

  var closeBtn = panel.querySelector('.icon-btn--close');
  var openBtns = document.querySelectorAll('.header-cta, .hero-actions .btn-primary');
  var input = document.getElementById('chatInput');

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
    // Cegah elemen di panel yang tersembunyi ikut ter-fokus (Tab).
    if ('inert' in panel) panel.inert = !open;

    if (open) {
      if (options.focusInput && input) input.focus({ preventScroll: true });
    } else if (options.focusLauncher) {
      launcher.focus({ preventScroll: true });
    }
  }

  /* Tombol launcher: buka saat tertutup, tutup saat terbuka. */
  launcher.addEventListener('click', function () {
    setOpen(!isOpen(), { focusInput: true });
  });

  /* Tombol X di header panel. */
  if (closeBtn) {
    closeBtn.addEventListener('click', function () {
      setOpen(false, { focusLauncher: true });
    });
  }

  /* Tombol pembuka di halaman. */
  openBtns.forEach(function (btn) {
    btn.addEventListener('click', function () {
      setOpen(true, { focusInput: true });
    });
  });

  /* Tutup dengan tombol Escape. */
  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && isOpen()) {
      setOpen(false, { focusLauncher: true });
    }
  });

  /* Sinkronkan state awal dengan tampilan HTML (tanpa merebut fokus). */
  setOpen(isOpen(), {});
})();
