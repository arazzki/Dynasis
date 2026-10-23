# 🏝️ Dynasis — Dynamic System Island for Windows

<p align="center">
  <img src="https://img.shields.io/badge/Platform-Windows%2010%20%7C%2011-0078D6?style=for-the-badge&logo=windows&logoColor=white" alt="Windows" />
  <img src="https://img.shields.io/badge/Node.js-v24-339933?style=for-the-badge&logo=node.js&logoColor=white" alt="Node.js" />
  <img src="https://img.shields.io/badge/Electron-34-47848F?style=for-the-badge&logo=electron&logoColor=white" alt="Electron" />
  <img src="https://img.shields.io/badge/React-18-61DAFB?style=for-the-badge&logo=react&logoColor=black" alt="React" />
  <img src="https://img.shields.io/badge/Animations-Framer%20Motion-FF0055?style=for-the-badge&logo=framer&logoColor=white" alt="Framer Motion" />
  <img src="https://img.shields.io/badge/Smart%20App%20Control-Compatible-10b981?style=for-the-badge" alt="SAC Compatible" />
  <img src="https://img.shields.io/badge/License-MIT-blue?style=for-the-badge" alt="License" />
</p>

<p align="center">
  <strong>Dynasis</strong> adalah aplikasi <em>desktop overlay</em> mandiri (standalone) untuk Windows 10 & 11 yang terinspirasi dari <strong>iOS Dynamic Island</strong> dan arsitektur <strong>Coucou</strong> — berjalan langsung di latar belakang tanpa perlu menyalakan webserver/terminal, dilengkapi mode <strong>Stealth Edge (5px)</strong>, <strong>Universal Media (SMTC) & Waveform Pill</strong>, <strong>Sinkronisasi Notifikasi WhatsApp Web</strong>, <strong>Dedicated Screenshot & File Drop Shelf</strong>, arsitektur <strong>Persistent PowerShell Hosts</strong> hemat daya, serta <strong>Safe Exam Browser (SEB) Auto-Terminate Guard</strong>.
</p>

---

## ✨ Fitur Utama

### 🕵️ 1. Stealth Edge Baseline (`184 × 5 px`) & 60Hz Hit-Test Engine
- **Zero Browser Tab Obstruction**: Saat kursor berada di luar area Dynasis, pulau otomatis melipat menjadi garis mikro setinggi `5px` di tepi paling atas layar (**Stealth Edge**), sehingga tab browser tetap 100% bebas diklik tanpa terhalang jendela transparan.
- **Micro Wake-Strip Waveform**: Saat lagu sedang diputar, garis mikro 5px menampilkan visualizer waveform mini (`PlayingBars mini`) berdenyut lembut, memberi sinyal visual tanpa mengganggu layar.
- **60Hz Main-Process Cursor Polling**: Area di luar kapsul aktif bersifat tembus klik total (`setIgnoreMouseEvents(true, { forward: true })`). Pulau hanya bangun saat kursor menyentuh *wake strip* teratas (`200 × 6 px`) atau saat menerima notifikasi penting.

### 🎵 2. Universal Media Controller (SMTC) & Now Playing Dynamic Pill
- **Dynamic Progress Line**: Garis progres halus setinggi `2px` di tepi bawah *Compact Pill* bergerak secara *real-time* mengikuti durasi dan posisi pemutaran lagu.
- **iOS-Style GPU Equalizer Waveform**: Indikator pemutaran musik menggunakan animasi transform GPU (`scaleY`) tanpa *layout recalculation*, lengkap dengan *soft halo glow* organik.
- **Track Transition & Vinyl Disc Pop-in**: Transisi metadata judul/artis menggunakan *spring cross-fade*, dan *album art* berbentuk piringan hitam (*vinyl disc*) yang berputar halus saat musik aktif.
- **Clean Compact Pill Layout**: Kontrol navigasi (Play/Pause/Next/Prev/Seek) dipusatkan di mode *Expanded*, menjaga *Compact Pill* tetap bersih, rapi, dan elegan.
- **Jam Terpusat (Centered Clock)**: Jam digital berada tepat di tengah pulau saat tidak ada media aktif, mencegah benturan visual dengan indikator baterai di kanan.
- **Auto-Launch & Play Spotify dari Kondisi Tertutup**: Klik tombol **Play** di Dynasis saat Spotify sedang tertutup untuk otomatis membuka `Spotify.exe` dan langsung memutar musik menggunakan sinyal Win32 `WM_APPCOMMAND`.
- **Sinkronisasi Multi-Player**: Mendukung Spotify, Apple Music, VLC, serta YouTube/SoundCloud di Chrome, Edge, Brave, Opera GX, dan Firefox.

### ⚡ 3. Arsitektur Daemon: Persistent PowerShell Hosts & Smart IPC Caching
- **Tanpa Spawn Berulang (Zero Spawn Overhead)**: Menggantikan sistem *spawn child process* berulang dengan dua proses PowerShell berumur panjang (`media-host.ps1` dan `apps-host.ps1`) yang berkomunikasi via *stdout JSON lines*.
- **Frekuensi Polling Hemat Daya**: Polling media diatur pada **1200 ms** dan aplikasi pada **4000 ms** (dengan scan tab browser berat hanya tiap tick ke-3 ≈ 12 detik), menekan penggunaan CPU latar belakang ke tingkat minimal.
- **Smart Album Art Caching**: Host hanya mengirim *payload* gambar album (base64 ~200 KB) **saat lagu berganti** (`trackKey`). *Update* posisi/status detik reguler tidak lagi menyertakan string base64 gambar, sehingga transfer IPC sangat ringan dan bebas lag.

### 💬 4. Sinkronisasi Notifikasi WhatsApp Web & Built-in Bridge
- **Dual-Source Detection**:
  - Membaca notifikasi *Windows Toast* dari `web.whatsapp.com` (Chrome, Edge, Brave, Firefox, Opera GX) dan aplikasi WhatsApp melalui WinRT `UserNotificationListener`.
  - Memindai perubahan *unread badge* `(N) WhatsApp` pada judul tab/jendela browser di latar belakang.
- **Built-in WhatsApp Web Bridge**: Menyediakan jendela bridge terisolasi jika pengguna ingin membuka WhatsApp Web secara mandiri tanpa membuka browser penuh.
- **Auto-Expand ke Compact Pill (`396 × 38 px`)**: Saat pesan masuk dari mode Stealth Edge, Dynasis otomatis melebar ke mode **Compact Pill** selama **3,25 detik**, menampilkan badge **`WA` + Nama Pengirim + Isi Pesan** serta tombol cepat **`Buka WA`** untuk langsung memfokuskan jendela percakapan.

### 📸 5. Dedicated Screenshot & File Drop Shelf
- **Auto-Capture Screenshot (`Win + Shift + S` / `PrintScreen`)**: Tangkapan layar baru atau gambar yang disalin langsung masuk otomatis ke tab **Shelf**, siap di-*drag* keluar ke WhatsApp, Discord, Slack, Word, atau aplikasi lain.
- **External File Drop**: Seret file apa pun dari Windows File Explorer ke atas Dynasis untuk menampungnya sementara di dalam Shelf.
- **Outbound Drag Guard & Watchdog**: Sistem pengaman drag keluar agar tidak memicu status *stuck drag-over*, serta otomatis melipat kembali ke Stealth Edge setelah file dilepas.
- **Perlindungan Memori & Storage**: File gambar resolusi penuh disimpan aman di folder *temp* sistem, sementara renderer hanya memuat *thumbnail preview* ringan untuk mencegah kebocoran memori.
- *(Catatan: Riwayat teks/URL clipboard lama telah dihapus sepenuhnya demi fokus fungsionalitas dan privasi).*

### 🖥️ 6. Apps Hub & Kontrol Sistem
- **Sinkronisasi Status Aplikasi Desktop**: Memantau status aktif dan judul jendela dari **Spotify**, **Discord**, **Browser**, dan **VS Code**.
- **Kontrol Cepat**: Fokuskan atau luncurkan aplikasi dengan satu klik, *toggle mute* mikrofon Discord (`Ctrl + Shift + M`), serta kontrol **Master Volume** sistem (`Vol -`, `Mute`, `Vol +`).

### 🛡️ 7. Safe Exam Browser (SEB) Auto-Terminate Guard
- **100% Aman untuk Ujian Kampus**: Memantau proses GUI `SafeExamBrowser` / `SafeExamBrowser.Client` (mengabaikan *background service* pasif `SafeExamBrowser.Service`).
- Begitu aplikasi ujian SEB dibuka, Dynasis otomatis melepas seluruh *global shortcut*, menghapus *System Tray*, menutup *overlay*, dan melakukan *self-terminate* seketika (`app.exit(0)`) agar SEB berjalan lancar tanpa terblokir.

### ♿ 8. Stabilitas & Aksesibilitas (Resilience & Reduced Motion)
- **Renderer Error Boundary**: Dilengkapi pelindung crash UI (`ErrorBoundary`) dengan tampilan fallback mandiri dan tombol *reload/close*, menjaga overlay tidak membeku jika terjadi error visual tak terduga.
- **Hardened Single-Instance Lock**: Instance kedua otomatis memfokuskan jendela utama tanpa menghapus file *temp* instance yang sedang aktif (`app.exit(0)`).
- **Reduced Motion Support**: Menghormati pengaturan aksesibilitas Windows (*prefers-reduced-motion*), menonaktifkan rotasi vinyl, denyut animasi, dan beralih ke transisi statis instan.
- **Smart App Control (SAC) Ready**: Dikonfigurasi dengan `"asar": false` dan `"signAndEditExecutable": false` sehingga binary `release\win-unpacked\Dynasis.exe` mempertahankan tanda tangan resmi Electron dan tidak diblokir Windows 11 Smart App Control.

---

## 🛠️ Tech Stack

- **Desktop Shell:** [Electron 34](https://www.electronjs.org/) (Frameless, transparent, `screen-saver` level always-on-top overlay + System Tray)
- **Frontend:** [React 18](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/) + [Vite 6](https://vitejs.dev/)
- **Animasi & Fisika:** [Framer Motion 12](https://www.framer.com/motion/) (Spring physics & transform-based GPU animations)
- **Styling & Ikon:** [Tailwind CSS 3](https://tailwindcss.com/) + [Lucide React](https://lucide.dev/)
- **Native Windows Bridge:** WinRT (`GlobalSystemMediaTransportControlsSessionManager`, `UserNotificationListener`) & Win32 (`user32.dll` `EnumWindows`, `SetForegroundWindow`, `PostMessage`) via persistent PowerShell daemon hosts

---

## 📂 Struktur Proyek

```text
Dynasis/
├── README.md                         # Dokumentasi umum & panduan fitur pengguna
├── DEVELOPMENT.md                    # Panduan teknis arsitektur & alur development
├── PRD.md                            # Product Requirements Document
├── package.json                      # Konfigurasi dependensi & electron-builder
├── electron/
│   ├── main.ts                       # Main process Electron (60Hz hit-test, Tray, IPC, Host supervisor)
│   ├── preload.cjs / preload.ts      # Context bridge aman (window.dynasis API)
│   └── scripts/
│       ├── media-host.ps1            # Daemon host SMTC persisten (1200ms, WinRT, Smart Art transmission)
│       ├── apps-host.ps1             # Daemon host status aplikasi + WA + SEB guard persisten (4000ms)
│       ├── manage-apps-lib.ps1       # Library Win32/UIA/notifikasi bersama
│       ├── manage-apps.ps1           # Aksi buka/fokus aplikasi & kontrol volume
│       └── control-media.ps1         # Kontrol Play/Pause/Next/Prev/Seek saat diklik
├── src/
│   ├── App.tsx                       # State utama Dynamic Island (Overview, Apps, Media, Shelf, Settings)
│   ├── components/
│   │   ├── Island.tsx                # Kapsul animasi Framer Motion (Stealth Edge, Compact Pill, Expanded)
│   │   ├── MediaIsland.tsx           # Widget pemutar musik expanded & interactive seek bar
│   │   ├── ShelfIsland.tsx           # Manajer Shelf khusus Screenshot & File Drop
│   │   ├── PlayingBars.tsx           # Visualizer waveform audio iOS-style (GPU-composited)
│   │   ├── BatteryHUD.tsx            # Indikator status baterai & pengisian daya
│   │   └── ErrorBoundary.tsx         # Fallback UI pelindung crash renderer
│   ├── hooks/
│   │   └── usePrefersReducedMotion.ts# Deteksi preferensi reduced motion OS
│   └── types/
│       └── dynasis.d.ts              # Deklarasi TypeScript tipe window.dynasis
└── release/
    └── win-unpacked/
        └── Dynasis.exe               # Aplikasi standalone siap jalan (tanpa perlu terminal/webserver)
```

---

## 🚀 Cara Menjalankan & Membangun Aplikasi

### 1. Menjalankan Langsung (Tanpa Terminal / Webserver)
Setelah di-*build*, Anda cukup menjalankan file *executable* mandiri berikut:
```text
release\win-unpacked\Dynasis.exe
```
- **Pintasan Keyboard Global**: Tekan `Alt + \` kapan saja untuk menampilkan/menyembunyikan Dynasis.
- **Geser Posisi Pulau**: Tahan `Alt + Klik Kiri & Geser` (atau gunakan tombol `Move` di kanan atas dashboard).
- **System Tray**: Klik ikon hijau-hitam **Dynasis** di System Tray Windows (kanan bawah taskbar) untuk membuka Dashboard, mengatur mode Stealth/Compact, atau mengaktifkan **Auto-Start OS**.

### 2. Mode Pengembangan & Build
1. **Instal dependensi:**
   ```bash
   npm install
   ```
2. **Jalankan mode pengembangan (Vite + Electron):**
   ```bash
   npm run dev
   ```
3. **Build & Package aplikasi standalone (`release\win-unpacked\Dynasis.exe`):**
   ```bash
   npm run pack
   ```
   > **Rekomendasi:** Gunakan `npm run pack` untuk memperbarui folder distribusi `release\win-unpacked\` secara cepat tanpa membuat installer tambahan. Untuk kompilasi distribusi lengkap, gunakan `npm run build`.

Untuk detail teknis lebih mendalam seputar arsitektur *hit-test*, *event loop*, dan protokol *host*, silakan baca [DEVELOPMENT.md](DEVELOPMENT.md).

---

## 📄 Lisensi
Proyek ini dilisensikan di bawah [MIT License](LICENSE).  
Lihat [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md) untuk lisensi pustaka pihak ketiga dan pengakuan hak cipta.
