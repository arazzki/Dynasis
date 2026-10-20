# 🏝️ Dynasis — Dynamic System Island for Windows

<p align="center">
  <img src="https://img.shields.io/badge/Platform-Windows%2010%20%7C%2011-0078D6?style=for-the-badge&logo=windows&logoColor=white" alt="Windows" />
  <img src="https://img.shields.io/badge/Node.js-v24-339933?style=for-the-badge&logo=node.js&logoColor=white" alt="Node.js" />
  <img src="https://img.shields.io/badge/Electron-33-47848F?style=for-the-badge&logo=electron&logoColor=white" alt="Electron" />
  <img src="https://img.shields.io/badge/React-18-61DAFB?style=for-the-badge&logo=react&logoColor=black" alt="React" />
  <img src="https://img.shields.io/badge/Animations-Framer%20Motion-FF0055?style=for-the-badge&logo=framer&logoColor=white" alt="Framer Motion" />
  <img src="https://img.shields.io/badge/Smart%20App%20Control-Compatible-10b981?style=for-the-badge" alt="SAC Compatible" />
  <img src="https://img.shields.io/badge/License-MIT-blue?style=for-the-badge" alt="License" />
</p>

<p align="center">
  <strong>Dynasis</strong> adalah aplikasi <em>desktop overlay</em> mandiri (standalone) untuk Windows 10 & 11 yang terinspirasi dari <strong>iOS Dynamic Island</strong> dan arsitektur <strong>Coucou</strong> — berjalan langsung di latar belakang tanpa perlu menyalakan webserver/terminal, dilengkapi mode <strong>Stealth Edge (5px)</strong>, <strong>Universal Media & Spotify Auto-Launch</strong>, <strong>Sinkronisasi Notifikasi WhatsApp Web</strong>, <strong>Clipboard & Screenshot Drop Shelf</strong>, serta <strong>Safe Exam Browser (SEB) Auto-Terminate Guard</strong>.
</p>

---

## ✨ Fitur Utama

### 🕵️ 1. Stealth Edge Baseline (`184 × 5 px`) & 60Hz Hit-Test Engine
- **Zero Browser Tab Obstruction**: Saat kursor berada di luar area Dynasis, pulau otomatis melipat menjadi garis mikro setinggi `5px` di tepi paling atas layar (**Stealth Edge**), sehingga tab browser tetap 100% bebas diklik.
- **60Hz Main-Process Cursor Polling**: Seluruh area di luar kapsul aktif bersifat *click-through* (`setIgnoreMouseEvents(true, { forward: true })`), dan pulau hanya bangun saat kursor menyentuh *wake strip* teratas (`200 × 6 px`) atau saat ada notifikasi penting.

### 🎵 2. Universal Media Controller (Windows SMTC) & Auto-Launch Spotify
- **Format `Judul Lagu - Nama Band/Artis`**: Menampilkan judul lagu beserta nama band/artis secara langsung di mode **Compact Pill** maupun **Expanded Media View** (lengkap dengan *interactive seek bar*, *album art* ter-cache, dan *audio equalizer*).
- **Auto-Launch & Play Spotify dari Kondisi Tertutup**: Klik tombol **Play** di Dynasis saat Spotify sedang tertutup untuk otomatis membuka `Spotify.exe` dan langsung memutar musik menggunakan sinyal Win32 `WM_APPCOMMAND`.
- **Sinkronisasi Multi-Player**: Mendukung Spotify, Apple Music, VLC, serta YouTube/SoundCloud di Chrome, Edge, Brave, dan Firefox.

### 💬 3. Sinkronisasi Notifikasi WhatsApp Web (`Compact Pill` Dinamis)
- **Dual-Source Detection**:
  - Membaca notifikasi *Windows Toast* dari `web.whatsapp.com` (Chrome, Edge, Brave, Firefox) dan aplikasi WhatsApp melalui WinRT `UserNotificationListener`.
  - Mendeteksi perubahan *unread badge* `(N) WhatsApp` pada judul jendela browser secara *real-time*.
- **Auto-Expand ke Compact Pill (`396 × 38 px`)**: Saat pesan masuk dari mode Stealth Edge, Dynasis otomatis melebar ke mode **Compact Pill** selama **3,25 detik**, menampilkan badge **`WA` + Nama Pengirim + Isi Pesan** serta tombol cepat **`Buka WA`** untuk langsung memfokuskan jendela WhatsApp Web.

### 📸 4. Screenshot, File Drop & Clipboard History Shelf
- **Auto-Capture Screenshot (`Win + Shift + S` / `PrintScreen`)**: Tangkapan layar baru otomatis masuk ke tab **Shelf**, siap di-*drag* keluar langsung ke WhatsApp, Discord, Word, atau aplikasi lain tanpa membuka File Explorer.
- **Outbound Drag Guard & Watchdog**: Mencegah efek *stuck drag-over* saat menarik gambar keluar menuju aplikasi eksternal, serta otomatis melipat kembali ke Stealth Edge setelah selesai digunakan.
- **Clipboard Text & Link History (`Ctrl + C`)**: Menyimpan riwayat teks dan tautan URL yang disalin secara otomatis di latar belakang, lengkap dengan tombol **Buka URL** (`ExternalLink`) dan **Copy Ulang**.

### 🖥️ 5. Apps Hub & Kontrol Sistem
- **Sinkronisasi Status Aplikasi Desktop**: Memantau status aktif dan judul jendela dari **Spotify**, **Discord**, **Browser**, dan **VS Code**.
- **Kontrol Cepat**: Fokuskan atau luncurkan aplikasi dengan satu klik, *toggle mute* mikrofon Discord (`Ctrl + Shift + M`), serta kontrol **Master Volume** sistem (`Vol -`, `Mute`, `Vol +`).

### 🛡️ 6. Safe Exam Browser (SEB) Auto-Terminate Guard
- **100% Aman untuk Ujian Kampus**: Memantau proses GUI `SafeExamBrowser` / `SafeExamBrowser.Client` setiap 2 detik (mengabaikan *background service* pasif `SafeExamBrowser.Service`).
- Begitu aplikasi ujian SEB dibuka, Dynasis otomatis melepas seluruh *global shortcut*, menghapus *System Tray*, menutup *overlay*, dan melakukan *self-terminate* (`app.exit(0)`) seketika agar SEB berjalan lancar tanpa peringatan aplikasi latar belakang.

### 🚀 7. Auto-Start OS & Kompatibilitas Windows 11 Smart App Control
- **Auto-Start OS (`Dynasis.lnk`)**: Mendaftarkan shortcut startup resmi `Dynasis.lnk` beserta ikon khusus `dynasis.ico` di folder Startup Windows (`%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup`) sehingga tampil sebagai **Dynasis** di Windows Task Manager > Startup Apps.
- **Smart App Control (SAC) Ready**: Dikonfigurasi dengan `"asar": false` dan `"signAndEditExecutable": false` sehingga binary `release\win-unpacked\Dynasis.exe` mempertahankan tanda tangan kriptografis resmi Electron dan tidak diblokir oleh kebijakan keamanan Windows 11 Smart App Control.

---

## 🛠️ Tech Stack

- **Desktop Shell:** [Electron 33](https://www.electronjs.org/) (Frameless, transparent, `screen-saver` level always-on-top overlay + System Tray)
- **Frontend:** [React 18](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/) + [Vite 6](https://vitejs.dev/)
- **Animasi & Fisika:** [Framer Motion](https://www.framer.com/motion/)
- **Styling & Ikon:** [Tailwind CSS](https://tailwindcss.com/) + [Lucide React](https://lucide.dev/)
- **Native Windows Bridge:** WinRT (`GlobalSystemMediaTransportControlsSessionManager`, `UserNotificationListener`) & Win32 (`user32.dll` `EnumWindows`, `SetForegroundWindow`, `PostMessage`) via PowerShell

---

## 📂 Struktur Proyek

```text
Dynasis/
├── README.md                         # Dokumentasi proyek & panduan penggunaan
├── PRD.md                            # Product Requirements Document
├── package.json                      # Konfigurasi dependensi & electron-builder
├── electron/
│   ├── main.ts                       # Main process Electron (60Hz hit-test, Tray, IPC, Auto-Start, Watchers)
│   ├── preload.cjs / preload.ts      # Context bridge aman (window.dynasis API)
│   └── scripts/
│       ├── get-media.ps1             # Pembaca media & sampul album via WinRT SMTC
│       ├── control-media.ps1         # Kontrol Play/Pause/Next/Prev/Seek via WinRT SMTC
│       ├── get-battery.ps1           # Pembaca status baterai & pengisian daya
│       └── manage-apps.ps1           # Sinkronisasi aplikasi, peluncur Spotify, Notif WA Web & SEB Guard
├── src/
│   ├── App.tsx                       # Kontainer utama Dynamic Island (Overview, Apps, Media, Shelf, Settings)
│   └── components/
│       ├── Island.tsx                # Kapsul animasi Framer Motion (Stealth Edge, Compact Pill, Expanded)
│       ├── MediaIsland.tsx           # Widget pemutar musik & progress seek bar
│       ├── ShelfIsland.tsx           # Manajer riwayat Screenshot, File Drop & Clipboard Teks/Link
│       └── BatteryHUD.tsx            # Indikator status baterai & pengisian daya
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

### 2. Mode Pengembangan & Build Ulang
1. **Instal dependensi:**
   ```bash
   npm install
   ```
2. **Jalankan mode pengembangan (Vite + Electron):**
   ```bash
   npm run dev
   ```
3. **Build paket aplikasi standalone (`release\win-unpacked\Dynasis.exe`):**
   ```bash
   npm run build
   ```

---

## 📄 Lisensi
Proyek ini dilisensikan di bawah [MIT License](LICENSE).
