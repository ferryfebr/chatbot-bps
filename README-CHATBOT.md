# SAPA BPS — Panduan Sambung Frontend ke n8n

Frontend sudah dinamis. Yang tersisa: menyalakan webhook n8n dan mengisi URL-nya.
Ikuti berurutan. Tidak perlu paham LLM dulu.

---

## 1. Peta file

| File | Fungsi |
|------|--------|
| `index.html` | Tampilan. Bubble chat kini kosong, diisi lewat JS. |
| `assets/js/config.js` | **Satu-satunya file yang perlu Anda ubah.** URL webhook & teks sapaan. |
| `assets/js/chat.js` | Logika kirim pesan, render, simpan riwayat. Jangan diubah dulu. |

Format yang dikirim frontend ke n8n (POST JSON):

```json
{
  "message": "berapa inflasi bulan ini?",
  "sessionId": "ses-abc123",
  "history": [ { "role": "user", "content": "halo" }, { "role": "bot", "content": "..." } ]
}
```

Format balasan yang diharapkan (JSON):

```json
{
  "reply": "Inflasi November 2025 sebesar ...",
  "sources": [
    { "title": "Berita Resmi Statistik", "url": "https://www.bps.go.id/..." }
  ]
}
```

`reply` wajib. `sources` opsional (array). Beberapa nama field alternatif juga diterima:
`output`, `text`, `message`, `answer` untuk isi; `references`, `citations` untuk sumber.

---

## 2. Menyalakan n8n (Docker)

Jika belum jalan:

```powershell
docker run -d --name n8n -p 5678:5678 -v n8n_data:/home/node/.n8n docker.n8n.io/n8nio/n8n
```

Buka `http://localhost:5678`. Buat akun lokal saat diminta.

> Penting untuk CORS: frontend di Laragon (`http://chatbot-bps.test` atau `http://localhost/chatbot-bps`)
> berbeda origin dengan n8n (`http://localhost:5678`). Supaya browser mengizinkan, jalankan n8n
> dengan env CORS longgar (khusus pengembangan):

```powershell
docker rm -f n8n
docker run -d --name n8n -p 5678:5678 ^
  -e N8N_CORS_ALLOWED_ORIGINS=* ^
  -v n8n_data:/home/node/.n8n docker.n8n.io/n8nio/n8n
```

Untuk produksi, ganti `*` dengan domain asli, mis. `https://chatbot-bps.test`.

---

## 3. Workflow webhook di n8n (sudah terpasang)

Susunan node yang sudah aktif:

```
Webhook (POST /sapa-bps)
   -> Klasifikasi (Code, regex — gratis)
        -> Cek Sapaan (If: category == "sapaan")
             ├─ TRUE  -> Sapaan (Set)          -> Respond to Webhook
             └─ FALSE -> AI Agent (Gemini)     -> Respond to Webhook
```

- **Klasifikasi**: node Code berisi regex untuk deteksi sapaan/terima kasih/perkenalan.
  Gratis, instan, tanpa panggilan LLM.
- **Cek Sapaan**: node If, cabang TRUE balas perkenalan, FALSE diteruskan ke AI.
- **AI Agent**: model `gemini-flash-lite-latest`. Topik di luar BPS ditolak lewat system prompt.
- **Respond to Webhook**: balas JSON `{ "reply": "...", "sources": [] }`.

Hemat biaya: hanya pesan non-sapaan yang memanggil Gemini (1 panggilan/pesan, bukan 2).
Pertanyaan sapaan dijawab template tanpa biaya.

### Catatan model (penting)

Model yang diuji langsung ke API (Nov 2026):

| Model | Latensi | Status |
|---|---|---|
| `gemini-flash-lite-latest` | ~1.7s | **dipakai** |
| `gemini-3.5-flash-lite` | ~1.6s | alternatif |
| `gemini-3.1-flash-lite` | ~2.1s | alternatif |
| `gemini-2.5-flash`, `gemini-2.0-flash` | — | ditolak (tidak tersedia untuk pengguna baru) |
| `gemini-3.8-flash` | timeout >60s | **jangan dipakai** |

Ganti model di node **Google Gemini Chat Model** (field `Model`). Kalau model error 404
"no longer available", pilih model lain dari daftar yang tersedia untuk API key tersebut.

---

## 4. Mengisi config.js

Buka `assets/js/config.js`, ubah:

```js
webhookUrl: 'http://localhost:5678/webhook/sapa-bps',
```

Muat ulang halaman, coba kirim pesan. Cek tab Network di DevTools bila gagal:
- `blocked by CORS policy` -> env CORS n8n belum benar (bagian 2).
- `404` -> workflow belum Active atau path salah.
- `500` -> node AI/Respond error, cek Executions di n8n.

Selama AI belum siap, pakai node **Set** yang mengembalikan teks tetap untuk uji alur:

```json
{ "reply": "Halo, ini balasan uji dari n8n.", "sources": [] }
```

---

## 5. Prompt sistem khas chatbot BPS

Rekomendasi isi system prompt pada node AI/LLM:

```
Anda asisten statistik BPS. Jawab dalam Bahasa Indonesia yang ringkas dan sopan.
Aturan:
- Jawab HANYA berdasarkan konteks/data yang diberikan. Jika tidak ada, katakan belum tersedia
  dan arahkan ke bps.go.id.
- Jangan mengarang angka. Sebut periode data (bulan/tahun) bila ada.
- Sertakan sumber (judul publikasi + tautan) bila tersedia.
- Format angka gaya Indonesia (pemisah ribuan titik, desimal koma).
- Jika pertanyaan di luar topik statistik/layanan BPS, tolak dengan halus.
```

---

## 6. Soal data yang "menunggu diselipkan"

Tiga pilihan, dari termudah:

1. **Manual (uji cepat):** taruh isi FAQ/tabel sebagai teks panjang di system prompt atau
   node Set. Cukup untuk beberapa puluh entri.
2. **Google Sheets / Airtable:** node Google Sheets ambil baris, gabungkan teks, kirim ke LLM.
   Cocok bila data diisi non-teknis.
3. **RAG (produksi):** Postgres + pgvector atau Vector Store node n8n. Potong publikasi/tabel
   jadi chunk, embed, cari yang relevan per pertanyaan. Skala besar, jawaban lebih akurat.

Frontend tidak tergantung pada pilihan ini. Selama node mengembalikan `reply`, UI bekerja.

---

## 7. Fitur frontend yang sudah aktif

- Kirim via Enter (Shift+Enter untuk baris baru) atau tombol kirim.
- Indikator "mengetik" saat menunggu balasan.
- Kartu "Sumber resmi" bila `sources` dikirim.
- Riwayat + `sessionId` disimpan di localStorage (bertahan setelah reload).
- Tombol restart di header menghapus percakapan.
- Timeout 60 detik dengan pesan kendala koneksi.
- Render aman: HTML di-escape, hanya tautan `http/https` diterima.

Ubah teks sapaan & tombol cepat di `config.js` (`greeting`, `suggestions`).