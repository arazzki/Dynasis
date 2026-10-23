# Dynasis — Development Guide

Panduan teknis untuk mengembangkan, menguji, dan mem-package **Dynasis** (Dynamic System Island untuk Windows).

- **Versi aplikasi:** `1.0.0`
- **Platform:** Windows 10 (1903+) / Windows 11, x64
- **Stack:** Electron 34 + React 18 + TypeScript + Vite 6 + Framer Motion + Tailwind CSS
- **Dokumen ini** menjelaskan kondisi kode saat ini di branch `main`. Untuk gambaran fitur dari sisi pengguna, lihat `README.md`; untuk rencana produk, lihat `PRD.md`.

> Catatan: `README.md` masih menyebut *clipboard text/link history*. Fitur itu sudah dihapus — Shelf sekarang **khusus gambar/screenshot**. README juga menyebut `npm run build` untuk menghasilkan EXE, sedangkan alur harian yang dipakai adalah `npm run pack`.

---

## 1. Prasyarat

| Kebutuhan | Versi / Catatan |
| --- | --- |
| Node.js | v24.x (dites dengan v24.12.0) |
| npm | 11.x |
| OS | Windows 10/11 — aplikasi memakai Win32, WinRT, dan PowerShell |
| PowerShell | Windows PowerShell 5.1 (`powershell.exe`), dijalankan dengan `-ExecutionPolicy Bypass` |
| Git | Branch kerja utama: `main` |

```bash
npm install
```

Tidak ada kebutuhan webserver terpisah. Electron memuat `dist/index.html` pada mode produksi dan dev server Vite pada mode dev.

---

## 2. Perintah Penting

| Perintah | Yang terjadi | Kapan dipakai |
| --- | --- | --- |
| `npm run dev` | Vite dev server + Electron (via `vite-plugin-electron`), hot reload renderer | Development sehari-hari |
| `npm start` | `tsc` → `vite build` → `electron .` | Uji hasil build lokal tanpa packaging |
| `npm run pack` | `tsc` → `vite build` → `electron-builder --dir` | **Wajib** setelah mengubah kode, untuk memperbarui `release/win-unpacked/Dynasis.exe` |
| `npm run build` | Sama seperti `pack`, tanpa flag `--dir`; target Windows saat ini tetap `dir` | Build distribusi |
| `npx tsc --noEmit` | Type-check seluruh `src` + `electron` | Validasi cepat sebelum commit |
| `npx vite build` | Build renderer + main + copy `preload.cjs` | Validasi build tanpa menjalankan app |

Tidak ada script `lint` atau `test`. Validasi standar proyek:

```bash
npx tsc --noEmit
npx vite build
npm run pack        # bila perlu menguji EXE
```

> `npm run dev` dan `npm start` sama-sama memakai single-instance lock. Kalau Dynasis sudah berjalan, instance baru akan langsung fokus ke instance lama, bukan membuka window kedua.

### Catatan build

- `asar: false` dan `signAndEditExecutable: false` dipakai agar binary Electron tetap membawa signature resmi dan tidak diblokir Windows 11 Smart App Control.
- `electron/scripts/*.ps1` disalin sebagai `extraResources` ke `release/win-unpacked/resources/scripts/`.
- `electron/preload.cjs` disalin ke `dist-electron/preload.cjs` oleh plugin `copy-native-preload-cjs` di `vite.config.ts`. **`preload.cjs` adalah preload yang benar-benar dipakai**; `preload.ts` hanya sumber tipe untuk `window.dynasis`.
- Folder `release/win-unpacked/` di-gitignore. Setelah mengubah kode, EXE lama **tidak** ikut berubah sampai `npm run pack` dijalankan.
- Tutup Dynasis yang sedang berjalan sebelum build/pack agar file EXE tidak terkunci.

---

## 3. Arsitektur

```text
┌─────────────────────────────────────────────────────────────┐
│ Electron Main Process (electron/main.ts)                    │
│  • BrowserWindow transparan 680×280, always-on-top           │
│  • 60 Hz cursor hit-test + click-through                    │
│  • Tray, global shortcut, autostart, single-instance        │
│  • Clipboard image watcher → file temp + thumbnail          │
│  • Spawn & supervise 2 PowerShell host                      │
│  • IPC handler (screenshot, media, apps, autostart, drag)   │
└───────────────┬─────────────────────────────┬───────────────┘
                │ JSON lines (stdout)         │ IPC (contextBridge)
┌───────────────▼──────────────┐   ┌──────────▼───────────────┐
│ PowerShell persistent hosts  │   │ Preload (preload.cjs)    │
│  media-host.ps1  (~900 ms)   │   │  window.dynasis.*        │
│  apps-host.ps1   (~3000 ms)  │   └──────────┬───────────────┘
│  manage-apps-lib.ps1         │              │
└──────────────────────────────┘   ┌──────────▼───────────────┐
                                   │ Renderer (React + Vite)  │
                                   │  App.tsx                 │
                                   │  Island / Media / Shelf  │
                                   │  localStorage prefs      │
                                   └──────────────────────────┘
```

### 3.1 Main process — `electron/main.ts`

Tanggung jawab utama:

- Membuat window frameless/transparent `680×280` di tengah atas layar (`PANEL_W`, `PANEL_H`).
- Menjalankan **cursor poll 16 ms** yang menentukan area mana yang menerima klik. Di luar `islandRect` + margin, window memakai `setIgnoreMouseEvents(true, { forward: true })` sehingga klik tembus ke aplikasi di belakangnya.
- Menerima `islandRect` dari renderer setiap kali ukuran/state island berubah.
- Menjalankan clipboard watcher (800 ms), media host, dan apps host.
- Menangani screenshot (simpan/copy/dismiss), drag file keluar, tray, autostart, dan WhatsApp bridge window.
- Menjaga single-instance: instance kedua memanggil `app.exit(0)`, bukan `app.quit()`, supaya `will-quit` tidak menghapus file temp milik instance utama.

### 3.2 Preload — `electron/preload.cjs`

- `contextIsolation: true`, `nodeIntegration: false`.
- Mengekspos `window.dynasis` (lihat `electron/preload.ts` untuk tipe `DynasisAPI`).
- Dua pola:
  - **`send`**: perintah satu arah (resize, drag, dismiss, media action, close).
  - **`invoke`**: butuh hasil (get media/battery/apps, save screenshot, autostart, copy image).
  - **`on...`**: event dari main (`cursor-moved`, `media-state-changed`, `apps-state-changed`, `screenshot-captured`, `wa-notification`, `tray-command`).

Kalau menambah API baru: ubah **keduanya** (`preload.cjs` dan `preload.ts`), lalu tambahkan handler di `main.ts` dan konsumen di renderer.

### 3.3 Renderer — `src/`

| File | Peran |
| --- | --- |
| `App.tsx` | State utama: island state, view, media, battery, apps, shelf, WhatsApp notif, prefs, timer auto-collapse |
| `components/Island.tsx` | Ukuran/animasi kapsul, sinkronisasi `islandRect`, countdown bar |
| `components/MediaIsland.tsx` | Kartu media expanded: album art, seek bar, Prev/Pause/Next |
| `components/ShelfIsland.tsx` | Grid screenshot, copy/save/dismiss, native drag-out |
| `components/PlayingBars.tsx` | Equalizer `compact` / `mini` / default |
| `components/BatteryHUD.tsx` | Indikator baterai |
| `components/ErrorBoundary.tsx` | Fallback UI saat renderer crash + reload/close |
| `hooks/usePrefersReducedMotion.ts` | Deteksi `prefers-reduced-motion` |
| `types/dynasis.d.ts` | Deklarasi `window.dynasis` |

`src/main.tsx` membungkus `App` dengan `React.StrictMode` dan `ErrorBoundary`.

---

## 4. Window, Hit-Test, dan State Island

### 4.1 Kanvas tetap

Window **tidak pernah berubah ukuran**. Ukuran tetap `680×280` supaya animasi spring tidak terpotong. Yang berubah hanyalah `islandRect` — kotak hit-test yang dikirim renderer ke main.

| State | Ukuran visual | Posisi `y` | Border radius |
| --- | --- | --- | --- |
| `hidden` (Stealth Edge) | `184×5` | `0` | bawah `10px` |
| `compact` | `336×34` (`360×36` saat hover) | notch `0` / pill `6` | bawah `16px` / pill `20px` |
| `compact` + notif WA | `396×38` (`416×38` hover) | notch `0` / pill `6` | bawah `18px` / pill `20px` |
| `battery` | `296×44` | notch `0` / pill `6` | bawah `18px` / pill `22px` |
| `expanded` | `580×192` | notch `0` / pill `6` | bawah `24px` / pill `26px` |

Wake strip di mode `hidden` selalu **`200×6`** di tengah atas, terlepas dari ukuran visual `184×5`. Tujuannya: tab browser (biasanya mulai `y ≥ 8`) tidak ikut terklik.

### 4.2 Alur state

```text
hidden ──(kursor dwell 110 ms di wake strip)──► compact
compact ──(klik)──► expanded
expanded ──(Esc / klik luar / auto-close)──► compact atau hidden
notifikasi WA ──► compact (3,25 s) ──► hidden bila autoHideToEdge
```

- `openOnHover: true` membuat wake strip langsung membuka `expanded`; default-nya `compact`.
- `autoCloseSeconds` mengatur auto-collapse saat expanded. `0` = tidak pernah.
- `autoHideToEdge` menentukan tujuan collapse: `hidden` (Stealth Edge) atau tetap `compact`.
- Notifikasi WhatsApp selalu memaksa `compact`, termasuk saat sedang `hidden`.

### 4.3 Aturan hit-test

- `HIT_MARGIN = 12` px ditambahkan di sekitar `islandRect`.
- `islandRect.h > 10` dianggap "bangun"; saat tidur, satu-satunya area interaktif adalah wake strip.
- Renderer mengirim rect lewat `setIslandRect(x, y, w, h)` setiap `state`/dimensi berubah. Jangan mengubah ukuran island tanpa memperbarui rect — kalau lupa, tombol bisa tidak bisa diklik atau window malah memblokir area lain.
- `ErrorBoundary` sengaja memperluas rect ke seluruh window saat crash agar tombol pemulihan tetap bisa diklik.

---

## 5. Persistent PowerShell Hosts

Dulu main process melakukan `spawn powershell.exe` setiap ~1,2 detik (media) dan ~2 detik (apps). Sekarang ada **dua proses PowerShell berumur panjang** yang menulis JSON per baris ke stdout. Main process hanya membaca baris dan meneruskannya ke renderer.

### 5.1 `media-host.ps1`

- Interval polling: **1200 ms**.
- Sumber: WinRT `GlobalSystemMediaTransportControlsSessionManager`.
- Prioritas session:
  1. Spotify yang sedang playing
  2. Session apa pun yang sedang playing
  3. Spotify (walau paused)
  4. Session aktif / pertama
- Hanya menulis baris saat JSON berubah (`$script:lastJson`).
- Album art (base64 PNG) hanya dikirim **saat track berubah**. Main process menyimpan salinan terakhir untuk snapshot awal/reload, tetapi **tidak** menempelkannya ke update posisi/status berikutnya. Jadi string ~200 KB tidak dikirim ulang tiap detik; renderer mempertahankan art selama `trackKey` sama.
- Payload: `hasMedia`, `trackKey`, `title`, `artist`, `albumTitle`, `albumArt`, `albumArtCached`, `status`, `duration`, `position`, `appId`.

### 5.2 `apps-host.ps1`

- Interval polling: **4000 ms**.
- Memuat `manage-apps-lib.ps1` (Win32 `EnumWindows`, UIA, notifikasi, deteksi SEB).
- Scan UIA browser yang mahal hanya dijalankan setiap **tick ke-3** (≈ 12 detik).
- Menulis snapshot hanya saat berubah.
- Berhenti sendiri (`exit 0`) saat `sebDetected` bernilai true; main process juga langsung `app.exit(0)`.

### 5.3 Lifecycle & recovery

- Host di-spawn saat `createWindow()`.
- Kalau proses mati, main menjadwalkan restart **2 detik** kemudian (`scheduleHostRestart`).
- `stopHosts()` dipanggil saat quit/SEB dan membatalkan timer restart.
- Saat renderer selesai load, snapshot terakhir (`lastMediaState`, `lastAppsSnapshot`) dikirim ulang.
- Jangan menulis debug/log ke **stdout** host — stdout khusus JSON. Log harus ke stderr.

### 5.4 Trade-off CPU ↔ RAM

Ini keputusan sadar:

- **Sebelum:** spawn PowerShell terus-menerus → CPU idle tinggi (pernah ~80%), RAM rendah karena proses cepat mati.
- **Sesudah:** dua host persisten → CPU idle ~4,5%, tetapi ada dua proses PowerShell yang selalu hidup.

Konsekuensi:

- Task Manager akan menghitung main + renderer + GPU + utility + 2 PowerShell. Total ~400–600 MB adalah **normal** untuk arsitektur ini.
- Animasi UI (transform/opacity) bukan penyebab utama konsumsi RAM. Kontributor lain: baseline Electron, base64 album art yang disimpan di state renderer, dan preview screenshot di memori.
- Kalau ingin menurunkan RAM: naikkan interval host, kecilkan `previewMaxDimension`, atau kurangi `SHELF_LIMIT`. Semua itu menambah latency/berkurangnya kualitas, jadi ukur dulu.

---

## 6. Media Pipeline

1. `media-host.ps1` membaca SMTC dan mengirim JSON saat berubah.
2. `main.ts` menyimpan `lastMediaState`, mengisi ulang `albumArt` yang hilang, lalu mengirim `media-state-changed`.
3. `App.tsx` memperbarui state `media`.
4. `MediaIsland.tsx` menampilkan kontrol; `PlayingBars` menampilkan equalizer.

### Kontrol

- Tombol di **kartu Media expanded**: Previous, Pause/Play, Next, dan seek bar.
- `media-action` dikirim ke main → `control-media.ps1` (Win32 `WM_APPCOMMAND` / SMTC).
- Compact pill **tidak** menampilkan tombol media saat hover. Media hanya bisa dikontrol dari kartu expanded.
- Play saat Spotify tertutup akan membuka `Spotify.exe` lalu mengirim perintah play.

### Progress

SMTC hanya memberi snapshot `position` pada `updatedAt`. Compact pill mengekstrapolasi:

```text
elapsed  = isPlaying ? (now - updatedAt) / 1000 : 0
position = min(duration, position + elapsed)
progress = position / duration
```

- Garis progress 2 px memakai `transform: scaleX()`.
- Tick React hanya **1 detik**, bukan 60 fps.
- Garis disembunyikan saat `duration <= 0` atau paused.
- Seek bar di kartu media memakai `pointer` events dan mengirim `seek` dengan nilai detik.

---

## 7. Screenshot Shelf & Temp Lifecycle

Shelf **hanya** menerima gambar:

- Screenshot (`Win+Shift+S`, `PrintScreen`) dan gambar yang di-copy.
- File yang di-drag & drop ke island.
- Teks/URL yang di-copy **diabaikan** (fitur clipboard text sudah dihapus).

### Alur capture

```text
Clipboard berubah (poll 800 ms)
  → nativeImage.toPNG() disimpan ke %TEMP%\dynasis-screenshots\screenshot_<ts>.png
  → dibuat thumbnail maksimal 480 px
  → thumbnail (data URL) + filePath dikirim ke renderer
  → renderer menambah item ke Shelf (maksimal 15)
```

### Aturan kebersihan file

| Aksi | Efek |
| --- | --- |
| Boot | `clearTempScreenshotDir()` menghapus isi folder temp (sisa run sebelumnya) |
| Dismiss / evict / clear | `dismiss-screenshot` → `removeTempFile(filePath)` |
| Renderer tidak pernah acknowledge | `pruneTempScreenshots()` menyisakan maksimal 40 file |
| Quit | `will-quit` mengosongkan folder temp |
| Drag file user | **tidak pernah** dihapus — `removeTempFile` hanya mengizinkan path di dalam folder temp |

Full-resolution tetap di disk; renderer hanya memegang thumbnail. Saat Copy/Save/Drag, main membaca ulang file full-res dari `filePath`.

Item yang di-drop dari luar memakai `blob:` URL; renderer memanggil `URL.revokeObjectURL` saat item dibuang.

---

## 8. WhatsApp, Apps, dan Autostart

### WhatsApp

- Deteksi dari toast Windows dan unread badge judul tab browser (lewat `apps-host`).
- `handleAppsPayload()` melakukan dedupe (`lastWaToastId`, `lastWaTabUnread`) dan rate-limit notifikasi (1,8 detik).
- Notifikasi memicu `wa-notification` → pill `compact` selama 3,25 detik.
- WhatsApp Web bridge adalah `BrowserWindow` terpisah; status enabled disimpan di `wa-bridge-config.json` pada `app.getPath('userData')`.
- Bridge hanya dibuka otomatis saat boot jika sebelumnya diaktifkan.

### Apps Hub

- Status Spotify, Discord, Browser, VS Code + judul window.
- Aksi buka/fokus lewat `app-action` → `manage-apps.ps1`.
- Kontrol volume dan mute mikrofon Discord juga lewat script yang sama.

### Autostart

- Shortcut `Dynasis.lnk` di folder Startup menunjuk ke launcher `Dynasis-Startup.exe` (fallback: `Dynasis.exe`).
- Launcher dikompilasi sekali dengan `csc.exe` dan diberi ikon `dynasis.ico`; nama ramah didaftarkan di MuiCache agar Task Manager menampilkan "Dynasis".
- Entry registry `HKCU\...\Run` lama (`Dynasis`, `electron.app.Dynasis`, `electron.app.Electron`) dihapus; autostart aktif hanya lewat folder Startup.
- `migrateAutoStartRegistry()` merapikan entry lama saat boot.
- Status dibaca/diubah lewat IPC `get-autostart` / `set-autostart`.

---

## 9. IPC Contract

| Channel | Arah | Tipe | Fungsi |
| --- | --- | --- | --- |
| `set-island-size` / `set-island-rect` | renderer → main | send | Update area hit-test |
| `set-ignore-mouse-events` | renderer → main | send | Click-through manual |
| `move-window-by` / `reset-window-position` | renderer → main | send | Geser/reset posisi island |
| `cursor-moved` | main → renderer | event | Posisi kursor + `onIsland` / `onWakeStrip` |
| `tray-command` | main → renderer | event | `open`, `compact`, dll. |
| `get-current-media` | renderer → main | invoke | Snapshot media saat mount |
| `media-state-changed` | main → renderer | event | Update SMTC |
| `media-action` | renderer → main | send | `play` / `pause` / `toggle` / `next` / `prev` / `seek` |
| `screenshot-captured` | main → renderer | event | Screenshot baru + thumbnail |
| `save-screenshot` | renderer → main | invoke | Save dialog + tulis full-res |
| `copy-image-to-clipboard` | renderer → main | invoke | Copy gambar |
| `dismiss-screenshot` | renderer → main | send | Hapus file temp |
| `start-file-drag` | renderer → main | send | Native drag-out |
| `get-apps-status` / `apps-state-changed` | invoke / event | — | Status aplikasi + WA |
| `app-action` | renderer → main | invoke | Buka/fokus app, volume, mute |
| `wa-notification` | main → renderer | event | Notifikasi WA masuk |
| `get-autostart` / `set-autostart` | renderer → main | invoke | Autostart OS |
| `app-minimize` / `app-close` | renderer → main | send | Kontrol window |

`get-current-battery` masih diekspos di preload, tetapi **tidak punya handler di `main.ts`** dan tidak dipakai renderer. Renderer memakai Battery Status API browser (`navigator.getBattery`). Jangan mengandalkan channel ini tanpa menambahkan handler terlebih dahulu.

---

## 10. Preferences & Penyimpanan

### Prefs UI

Disimpan di `localStorage` dengan key **`dynasis_prefs_v3`**.

```json
{
  "openOnHover": false,
  "autoHideToEdge": true,
  "autoCloseSeconds": 15,
  "notchStyle": "notch",
  "showClock": true
}
```

| Field | Arti |
| --- | --- |
| `openOnHover` | Wake strip langsung membuka expanded |
| `autoHideToEdge` | Collapse kembali ke Stealth Edge (bukan compact) |
| `autoCloseSeconds` | Auto-close expanded; `0` = pinned |
| `notchStyle` | `notch` (menempel atas) atau `pill` (melayang, `y = 6`) |
| `showClock` | Tampilkan jam di compact pill |

### File runtime

| Path | Isi |
| --- | --- |
| `%TEMP%\dynasis-screenshots\` | Screenshot full-res sementara |
| `app.getPath('userData')\wa-bridge-config.json` | `{ "enabled": true/false }` |
| `%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\Dynasis.lnk` | Autostart |

Saat menguji, jangan hapus folder `userData` sembarangan — prefs ada di localStorage renderer (di dalam `userData`), bukan di file JSON terpisah.

---

## 11. Animasi & Aturan Performa

Target rasa: **iOS-like**, halus, tidak “berat”.

### Yang dipakai

- **Spring** untuk membesar (`stiffness: 420`, `damping: 29`, `mass: 0.85`).
- **Ease-out** `0.32 s` saat mengecil (`[0.45, 0, 0.2, 1]`) agar collapse terasa tegas.
- Equalizer: `scaleY` per bar dengan keyframe, durasi, dan delay berbeda; glow statis (tidak dianimasikan).
- Album art: rotasi 14 detik, breathing 3,2 detik, halo pulsing.
- Judul lagu: slide/fade dengan `key` per track.
- Progress line: `scaleX` + transisi 1 detik linear.

### Aturan

1. **Animasi hanya `transform` dan `opacity`.** Jangan menganimasikan `width`, `height`, `top`, `filter`, atau `box-shadow` di loop.
2. **Blur harus statis.** Blur yang dianimasikan memaksa repaint tiap frame.
3. **Jangan taruh React state di jalur 60 fps.** Progress line cukup tick 1 detik; cursor/hit-test sudah ditangani main process.
4. **Hentikan animasi saat tidak terlihat.** Loop equalizer hanya dirender saat `isPlaying` dan komponennya ada.
5. **Selalu hormati `prefers-reduced-motion`.** Gunakan `usePrefersReducedMotion()`:
   - `Island`: transisi `duration: 0`.
   - `PlayingBars`: frame statis `STILL`.
   - Pill: album art diam, tanpa halo/rotasi.
   - Progress line: `transition: none`.
6. **Keyframe per bar** boleh berbeda; jangan menyamakan semua durasi karena hasilnya terlihat mekanis.

### Menambah animasi baru — checklist

- [ ] Hanya `transform`/`opacity`?
- [ ] Ada guard `reducedMotion`?
- [ ] Tidak memicu layout pass?
- [ ] Tidak menambah timer < 250 ms ke React?
- [ ] Diuji di compact, expanded, dan hidden?

---

## 12. Keamanan & Guard

| Guard | Perilaku |
| --- | --- |
| **Single instance** | Instance kedua `app.exit(0)`; instance utama difokuskan. Mencegah dua tray/host dan file temp dihapus silang. |
| **SEB Guard** | Jika `SafeExamBrowser` terdeteksi, semua shortcut/tray/overlay dilepas dan app `exit(0)`. |
| **Scoped dev cleanup** | `vite.config.ts` hanya menghentikan `node_modules/electron/dist/electron.exe` milik checkout ini — bukan `taskkill /IM electron.exe`. |
| **Temp deletion** | Hanya file di dalam `%TEMP%\dynasis-screenshots` yang boleh dihapus. |
| **ErrorBoundary** | Renderer crash menampilkan UI pemulihan, bukan window kosong. |
| **Context isolation** | `nodeIntegration: false`, `contextIsolation: true`; semua akses native lewat preload. |

Saat menambah IPC, jangan mengekspos `ipcRenderer` mentah atau path arbitrer ke renderer. Validasi path di main (contoh: `isInsideTempDir`).

---

## 13. Alur Development

1. Pastikan branch benar:
   ```bash
   git switch main
   git pull
   ```
   **Jangan menyentuh `features/v1.1.0`** kecuali memang bekerja di branch itu.
2. Jalankan `npm run dev`.
3. Ubah renderer → hot reload. Ubah `electron/main.ts` → Vite akan rebuild dan restart Electron.
4. Setelah selesai:
   ```bash
   npx tsc --noEmit
   npx vite build
   npm run pack
   ```
5. Jalankan `release\win-unpacked\Dynasis.exe` untuk smoke test.
6. Pastikan tidak ada proses Dynasis/Electron/PowerShell host yang tertinggal dan folder temp bersih.
7. Commit dengan pesan deskriptif, lalu push ke `main` (sesuai kebiasaan repo).

### Konvensi kode

- TypeScript `strict`, `noUnusedLocals`, `noUnusedParameters` — build gagal kalau ada variabel tak terpakai.
- Komponen fungsional + hooks; tidak ada state library eksternal.
- Styling Tailwind; warna utama: hitam, putih, emerald (`emerald-400/500`).
- Teks UI berbahasa Indonesia, istilah teknis tetap Inggris.
- Preload `.cjs` dan `.ts` harus sinkron.
- PowerShell: stdout = JSON saja; error ke stderr; `$ErrorActionPreference = 'SilentlyContinue'`.

---

## 14. Manual QA Checklist

Sebelum merge/rilis:

- [ ] `npx tsc --noEmit` bersih.
- [ ] `npx vite build` sukses dan `dist-electron/preload.cjs` ada.
- [ ] App boot tanpa error di console; tray muncul; `Alt+\` menyembunyikan/menampilkan.
- [ ] Stealth Edge: kursor di luar → 5 px; hover wake strip → compact; klik → expanded.
- [ ] Klik di luar island tetap menembus ke aplikasi belakang.
- [ ] Compact pill: judul/artis, progress line berjalan, equalizer hanya saat playing.
- [ ] Kartu Media: Prev/Pause/Next/seek berfungsi; tidak ada kontrol media di pill.
- [ ] Track berganti → judul slide, art pop-in; progress reset.
- [ ] Screenshot baru muncul di Shelf; copy, save, drag-out, dismiss berfungsi.
- [ ] Dismiss/clear → file temp hilang; quit → folder temp kosong.
- [ ] Drag file dari Explorer ke island → masuk Shelf; file asli tidak terhapus.
- [ ] Notifikasi WA → pill 3,25 detik → kembali ke Stealth Edge.
- [ ] Autostart toggle tersimpan dan shortcut muncul/hilang.
- [ ] Reduced motion ON → tidak ada loop/rotasi; transisi instan.
- [ ] Tidak ada proses tertinggal setelah quit.

---

## 15. Troubleshooting

| Gejala | Penyebab umum | Solusi |
| --- | --- | --- |
| EXE masih menampilkan UI lama | `release/win-unpacked` belum di-pack ulang | Tutup app, jalankan `npm run pack` |
| Dua tray / dua window | Instance lama masih hidup | Cek Task Manager, tutup semua `Dynasis.exe`; single-instance akan fokus ke yang lama |
| Window blank setelah crash | Error renderer | ErrorBoundary harus muncul; kalau tidak, cek console main/renderer dan `preload.cjs` |
| `window.dynasis` undefined | Preload tidak ter-copy / path salah | Pastikan `dist-electron/preload.cjs` ada; `npm run dev` menyalin ulang |
| Island tidak bisa diklik | `islandRect` tidak sinkron | Cek `setIslandRect` di `Island.tsx`; pastikan renderer mengirim rect saat state berubah |
| Island berkedip saat dites | Cursor poll main process + prefs `openOnHover`/`autoHideToEdge` | Untuk tes stabil: set `openOnHover:false`, `autoHideToEdge:false`, lalu restore |
| RAM ~500 MB | Baseline Electron + 2 host + album art | Normal; lihat §5.4 sebelum mengoptimalkan |
| Media tidak terdeteksi | SMTC tidak punya session / host mati | Cek `[media-host]` di stderr; main akan restart otomatis dalam 2 detik |
| Album art hilang saat track sama | Cache track | Normal: art hanya dikirim saat track berubah; main memakai salinan terakhir |
| Screenshot tidak muncul | Clipboard bukan gambar / watcher mati | Shelf screenshot-only; copy teks sengaja diabaikan |
| File temp menumpuk | App tidak quit bersih / file terkunci | File dibersihkan saat boot/quit; maksimal 40 file; cek izin folder temp |
| PowerShell diblokir | Execution policy / antivirus | Main memakai `-ExecutionPolicy Bypass`; cek kebijakan keamanan |
| `npm run dev` gagal start | Port Vite terpakai / instance lain | Tutup proses lama; cek port 5173 |
| Build gagal karena file terkunci | EXE sedang berjalan | Tutup Dynasis sebelum build |
| Shortcut `Alt+\` tidak jalan | Konflik dengan app lain | Ganti kombinasi di `main.ts` atau tutup app yang konflik |
| SEB menutup Dynasis | Guard memang bekerja | Diharapkan saat ujian; bukan bug |

### Tips pengujian animasi & reduced motion

- Untuk menguji `prefers-reduced-motion` via CDP, set `Emulation.setEmulatedMedia` di **session yang sama** dengan `Runtime.evaluate`, lalu evaluasi `matchMedia('(prefers-reduced-motion: reduce)').matches`.
- Wake strip butuh kursor **fisik** masuk ke area `200×6` di atas; gerakan kursor dari proses PowerShell terpisah lebih andal daripada evaluasi inline.
- Uji hover/compact dengan app dalam keadaan fokus dan tidak ada window lain yang menutupi area atas.
- Setelah tes, restore prefs pengguna dan pastikan tidak ada file `screenshot_*.png` tersisa.

---

## 16. Peta File

```text
Dynasis/
├─ electron/
│  ├─ main.ts                    # Main process, window, hit-test, IPC, tray, autostart
│  ├─ preload.cjs                # Preload aktif (contextBridge)
│  ├─ preload.ts                 # Sumber tipe DynasisAPI
│  └─ scripts/
│     ├─ media-host.ps1          # Host SMTC persisten
│     ├─ apps-host.ps1           # Host status app/WA/SEB persisten
│     ├─ manage-apps-lib.ps1     # Library Win32/UIA/notifikasi
│     ├─ manage-apps.ps1         # Aksi buka/fokus/volume
│     └─ control-media.ps1       # Play/pause/next/prev/seek
├─ src/
│  ├─ App.tsx                    # State + layout utama
│  ├─ main.tsx                   # Entry React + ErrorBoundary
│  ├─ components/                # Island, Media, Shelf, Battery, PlayingBars, ErrorBoundary
│  ├─ hooks/                     # usePrefersReducedMotion
│  ├─ types/                     # Deklarasi window.dynasis
│  └─ index.css                  # Tailwind + style dasar
├─ dist/                         # Hasil build renderer (gitignored)
├─ dist-electron/                # Hasil build main + preload (gitignored)
├─ release/win-unpacked/         # EXE hasil packaging (gitignored)
├─ vite.config.ts                # Plugin Electron, copy preload, scoped kill
├─ package.json                  # Script + konfigurasi electron-builder
├─ tsconfig.json
├─ README.md                     # Dokumentasi pengguna
├─ PRD.md                        # Product requirements
└─ DEVELOPMENT.md                # Dokumen ini
```

---

## 17. Batasan yang Diketahui

- Hanya Windows; bergantung pada Win32, WinRT, dan PowerShell 5.1.
- Deteksi media bergantung pada SMTC — player yang tidak mendaftar ke SMTC tidak akan terlihat.
- WhatsApp membaca toast/judul tab; perubahan UI WhatsApp Web dapat memutus deteksi.
- Album art base64 disimpan di memori renderer; track dengan art besar menambah RAM.
- Shelf dibatasi 15 item di renderer dan 40 file di disk.
- Stealth Edge sangat sensitif terhadap DPI/posisi layar; pengujian otomatis harus memperhitungkan koordinat fisik vs DIP.
- Belum ada automated test/lint; validasi masih manual + type-check + build.
