/* ============================================================
   SAPA BPS — konfigurasi
   Ubah nilai di bawah sesuai setelan n8n Anda.
   Lihat README-CHATBOT.md untuk cara mendapatkannya.
   ============================================================ */
window.SAPA_CONFIG = {
  // URL webhook n8n (mode Production = /webhook/... , mode Test = /webhook-test/...)
  webhookUrl: 'http://localhost:5678/webhook/sapa-bps',

  // Timeout permintaan (ms). LLM kadang lambat -> beri ruang.
  timeoutMs: 60000,

  // Kunci localStorage untuk menyimpan riwayat percakapan.
  storageKey: 'sapa-bps-history-v1',

  // Sapaan awal (boleh kosong -> tidak ditampilkan).
  greeting: 'Selamat datang di SAPA BPS. Ada yang bisa saya bantu terkait data statistik?',

  // Tombol pertanyaan cepat.
  suggestions: [
    'Unduh publikasi',
    'Data kependudukan',
    'Inflasi',
    'Sensus penduduk',
    'Kontak BPS'
  ]
};