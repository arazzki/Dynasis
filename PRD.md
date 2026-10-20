# 🏝️ Dynasis - Product Requirements Document (PRD)

**Project Name:** Dynasis (Dynamic System Island for Windows)  
**Version:** 1.0.0-Draft  
**Status:** In Review  
**Target Platform:** Windows 10 (1903+) & Windows 11 (x64 / ARM64)  
**Author:** Dynasis Core Team  

---

## 1. Executive Summary & Vision

**Dynasis** adalah sistem utilitas desktop (*desktop overlay utility*) untuk Windows yang mengadaptasi paradigma interaksi mikro **Dynamic Island (iOS)** ke dalam lingkungan PC. 

Dynasis bukan sekadar klon kosmetik, melainkan dirancang sebagai **pusat interaksi dan produktivitas terpadu di bagian atas layar (*top-center anchor*)**. Dynasis menggabungkan animasi fluida berbasis fisika (*spring physics*) dengan fitur produktivitas khas PC: **Clipboard/Screenshot Temporary Shelf**, **Universal Media Controller**, dan **System Status HUD**.

---

## 2. Problem Statement & User Value

| Masalah di Windows | Solusi Dynasis |
| :--- | :--- |
| **Notifikasi / Toast kaku**: Muncul di pojok kanan bawah, menutupi konten kerja, sering terlewat atau diabaikan. | Tampil elegan di tengah atas pandangan mata, adaptif, dan mengecil otomatis setelah dibaca. |
| **Workflow Screenshot lambat**: Setelah `Win + Shift + S`, user harus mencari file di explorer atau buka chat/doc dulu untuk paste. | **Screenshot Shelf**: Begitu screenshot diambil, island otomatis expand menampilkan thumbnail yang bisa langsung di-*drag & drop* ke aplikasi tujuan. |
| **OSD Media Player bulky**: Slider volume/media default Windows kaku dan memakan ruang tanpa interaksi gestur. | Island menampilkan live waveform, cover album mini, dan tombol playback saat di-hover/klik. |
| **File transfer antar-jendela repot**: Menyeret file saat multitasking split-screen sering canggung. | **Drop Shelf**: Seret file apapun ke island untuk diparkir sementara, ganti tab/jendela, lalu ambil kembali. |

---

## 3. User Personas

1. **Multitasker & Designer**: Sering mengambil screenshot referensi, butuh memindahkan aset visual ke Figma/Canva/Slack secara instan tanpa mengotori desktop.
2. **Music Enthusiast**: Mendengarkan Spotify/YouTube saat coding atau mengetik, ingin melihat judul lagu dan mengontrol musik tanpa harus Alt+Tab.
3. **Productivity & Minimalist Enthusiast**: Menginginkan tampilan desktop bersih tanpa taskbar yang penuh ikon, namun tetap mendapatkan informasi esensial (baterai, timer, status mic/volume).

---

## 4. Product Features & Scope

### Phase 1: MVP (Minimum Viable Product)

#### 4.1. Core Island Window & Animation Engine
- **Top-Center Floating Anchor**: Window melayang tanpa frame (`frameless`), transparan (`transparent`), selalu di posisi teratas (`always-on-top`).
- **Click-Through / Mouse Event Pass-Through**: Saat kursor berada di luar kapsul hitam, klik tembus ke aplikasi di belakangnya (tidak memblokir klik window lain).
- **Fluid Spring Physics**: Animasi perubahan bentuk (morphing), ekspansi, dan kontraksi menggunakan kurva pegas realistis (*stiffness, damping, mass*).
- **Tiga Status Utama**:
  1. `Idle (Collapsed)`: Kapsul hitam ramping (pill) minimalis.
  2. `Compact Active`: Menampilkan ikon status kecil (misal: ikon musik bergelombang atau baterai).
  3. `Expanded`: Terbuka penuh saat kursor di-hover atau di-klik, menampilkan kontrol interaktif.

#### 4.2. Screenshot & File Drop Shelf (*Killer Feature*)
- **Auto-Detection**: Memantau clipboard sistem secara real-time. Begitu mendeteksi format gambar baru (dari Snipping Tool / `PrtScn` / browser copy image):
  - Island otomatis *morph* membesar menampilkan thumbnail screenshot.
  - Opsi klik: *Copy to Clipboard*, *Save As*, atau *Dismiss*.
  - **Native Drag-Out**: User dapat menekan thumbnail dan menyeretnya langsung (*native drag-and-drop*) ke WhatsApp, Discord, Photoshop, browser, dll.
- **Drag-In Parking Shelf**: Menyeret file lokal apa saja ke atas island akan menyimpannya sementara di daftar shelf.

#### 4.3. Universal Media Controller
- Terhubung ke **Windows System Media Transport Controls (SMTC)**.
- Otomatis mendeteksi media apapun yang sedang diputar di Windows:
  - Spotify, Apple Music, Tidal.
  - YouTube, Netflix, SoundCloud di browser (Chrome, Edge, Brave, Firefox).
  - VLC, Windows Media Player.
- **Tampilan Expanded**: Cover album, judul lagu dengan efek marquee jika panjang, nama artis, audio visualizer bar animasi, tombol Play/Pause, Next, Previous.

#### 4.4. Hardware & System HUD
- **Baterai & Pengisian Daya**: Animasi indikator baterai hijau saat charger dicolok atau dicabut.
- **Volume & Kecerahan**: Muncul sejenak saat volume sistem diubah, menampilkan persentase dan bar visual.

---

### Phase 2: Post-MVP & Next Enhancements
- **Multi-Island (Splitting Pill)**: Memecah pill menjadi dua bulatan terpisah jika ada 2 event bersamaan (contoh: Musik di kiri + Timer di kanan).
- **Timer / Stopwatch**: Hitung mundur interaktif langsung di island.
- **Privacy Indicators**: Titik hijau/oranye jika kamera atau mikrofon sedang aktif (Zoom, Discord, Teams).
- **Notification Center Integration**: Membaca notifikasi penting dari Windows Notification Listener.
- **Multi-Monitor Support**: Pilihan monitor mana yang ingin dipasangi island.

---

## 5. System Architecture & Tech Stack

```
+-------------------------------------------------------------+
|                     DYNASIS DESKTOP APP                     |
+-------------------------------------------------------------+
| [UI Layer - Webview / Renderer]                             |
|  - React 18 / 19 + TypeScript                               |
|  - Framer Motion (Fluid Spring Animations & Layout Morph)   |
|  - Tailwind CSS (Glassmorphism, Dark UI, Responsive Pill)   |
|  - Lucide React (Icons)                                     |
+-------------------------------------------------------------+
                              ▲
                              │ IPC (ContextBridge / Preload)
                              ▼
+-------------------------------------------------------------+
| [Main Process - Electron / Node.js]                         |
|  - BrowserWindow Manager (frameless, transparent, topmost)  |
|  - Mouse Hit-Testing (setIgnoreMouseEvents pass-through)    |
|  - Clipboard Monitor (Image capture & Shelf buffer)         |
|  - Drag & Drop IPC Bridge                                   |
+-------------------------------------------------------------+
                              ▲
                              │ Native OS Calls
                              ▼
+-------------------------------------------------------------+
| [Windows OS Subsystem Integration]                          |
|  - Windows SMTC (System Media Transport Controls)           |
|  - PowerShell / Node WinRT Native Bridge                    |
|  - PowerStatus & Audio Endpoint Listeners                   |
+-------------------------------------------------------------+
```

### Rincian Pilihan Stack

1. **Desktop Shell:** `Electron 35+`
   - *Alasan:* Mendukung per-pixel transparency, hardware acceleration, zero-latency drag-and-drop interop, dan berjalan di Node.js 24 yang sudah ada di PC user.
2. **Frontend UI:** `React + TypeScript + Vite`
   - *Alasan:* Pengembangan UI cepat, modul komponen terisolasi, type-safety tinggi.
3. **Animation Engine:** `Framer Motion`
   - *Alasan:* Pustaka animasi terbaik untuk meniru *Apple Dynamic Island physics* (layout morphing, spring damping, gestur drag).
4. **Styling:** `Tailwind CSS`
   - *Alasan:* Styling cepat dengan utility classes, mudah mengatur radius kapsul (*rounded-full*), blur (*backdrop-blur*), dan tema gelap pekat (*true black #000000*).
5. **Windows Integration Helper:** 
   - `node-powershell` / script PowerShell asinkron untuk membaca SMTC Windows dan status daya tanpa memerlukan C++ compile tambahan di awal.

---

## 6. Non-Functional Requirements (NFR)

- **Frame Rate:** Animasi wajib stabil di **60 FPS** (atau 120/144 FPS pada monitor high refresh rate) tanpa *stuttering*.
- **Resource Footprint:**
  - Idle RAM target: **< 75 MB**.
  - Idle CPU target: **< 0.5%**.
- **Latency:** Responsivitas hover dan klik **< 50ms**.
- **Privasi:** Semua data clipboard, screenshot, dan media diproses 100% lokal di mesin pengguna, **tanpa koneksi internet atau telemetri pihak ketiga**.

---

## 7. Delivery Roadmap

- [x] **Milestone 0:** Inisiasi PRD, spesifikasi teknis, dan README.
- [ ] **Milestone 1:** Setup scaffolding project (Electron + Vite + React + Tailwind + Framer Motion).
- [ ] **Milestone 2:** Implementasi Kapsul Island (Idle, Hover, Expand, Mouse pass-through).
- [ ] **Milestone 3:** Fitur Screenshot Shelf & Native Drag-and-Drop.
- [ ] **Milestone 4:** Integrasi Universal Media Controller (SMTC).
- [ ] **Milestone 5:** System HUD (Baterai & Volume) & Pengaturan Dasar.
