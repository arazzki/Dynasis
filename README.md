# 🏝️ Dynasis (Dynamic System Island for Windows)

<p align="center">
  <img src="https://img.shields.io/badge/Platform-Windows%2010%20%7C%2011-0078D6?style=for-the-badge&logo=windows&logoColor=white" alt="Windows" />
  <img src="https://img.shields.io/badge/Node.js-v24-339933?style=for-the-badge&logo=node.js&logoColor=white" alt="Node.js" />
  <img src="https://img.shields.io/badge/Electron-Desktop-47848F?style=for-the-badge&logo=electron&logoColor=white" alt="Electron" />
  <img src="https://img.shields.io/badge/React-18%2B-61DAFB?style=for-the-badge&logo=react&logoColor=black" alt="React" />
  <img src="https://img.shields.io/badge/Animations-Framer%20Motion-FF0055?style=for-the-badge&logo=framer&logoColor=white" alt="Framer Motion" />
  <img src="https://img.shields.io/badge/License-MIT-blue?style=for-the-badge" alt="License" />
</p>

<p align="center">
  <strong>Dynasis</strong> is a modern, fluid, and customizable desktop overlay for Windows inspired by iOS Dynamic Island — supercharged with real desktop productivity workflows like <strong>Screenshot & Drop Shelf</strong>, <strong>Universal Media Controls</strong>, and <strong>Hardware Status HUDs</strong>.
</p>

---

## ✨ Key Features

### 📸 1. Screenshot & Temporary Drop Shelf *(Superpower Feature)*
- **Instant Snipping Capture**: Automatically detects new screenshots taken with `Win + Shift + S` or `PrintScreen`.
- **Morphing Thumbnail Preview**: Island expands to preview your captured image with quick actions.
- **Direct Drag & Drop**: Drag screenshots straight from the island into WhatsApp, Discord, Figma, Word, or browsers without opening File Explorer.
- **File Parking Lot**: Drop any file (PDF, documents, images) onto the island to hold it temporarily while you navigate between apps.

### 🎵 2. Universal Media Controller (Windows SMTC)
- Works automatically with any media playing on your PC:
  - **Music**: Spotify, Apple Music, Tidal, Foobar2000, VLC.
  - **Browsers**: YouTube, Netflix, SoundCloud running on Chrome, Edge, Brave, or Firefox.
- **Dynamic Display**: Live animated audio visualizer waves, album artwork, track title with smooth marquee, and playback controls (play/pause/skip).

### ⚡ 3. System & Hardware HUDs
- **Battery & Power Alerts**: iOS-style green pill animation when plugging or unplugging the charger.
- **Volume & Brightness Overlays**: Clean minimalist pill indicator replacing the default clunky Windows volume flyout.
- **Privacy Dot**: Subtle dot indicator when microphone or webcam is in use.

### 🫧 4. Authentic iOS Fluid Spring Physics
- Powered by **Framer Motion** spring dynamics for natural, bouncy, and elastic morphing interactions.
- **Mouse Pass-Through**: The screen outside the island remains 100% clickable so it never interferes with your active work or games.

---

## 🛠️ Tech Stack

- **Shell:** [Electron](https://www.electronjs.org/) (Frameless, transparent, always-on-top window management)
- **Frontend Framework:** [React](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/)
- **Bundler:** [Vite](https://vitejs.dev/)
- **Animation Engine:** [Framer Motion](https://www.framer.com/motion/) (Layout morphing, spring damping, gestural physics)
- **Styling:** [Tailwind CSS](https://tailwindcss.com/)
- **Icons:** [Lucide React](https://lucide.dev/)
- **OS Subsystem Bridge:** Windows SMTC & System Event listeners via Node.js / PowerShell

---

## 📂 Project Structure

```text
Dynasis/
├── PRD.md                  # Detailed Product Requirements Document
├── README.md               # Project documentation & setup guide
├── package.json            # Dependencies and npm scripts
├── electron/
│   ├── main.ts             # Electron main process (Window & IPC management)
│   ├── preload.ts          # Safe context bridge for renderer
│   └── services/           # System listeners (Media, Clipboard, Battery)
├── src/
│   ├── App.tsx             # Root Dynamic Island container
│   ├── components/
│   │   ├── Island.tsx      # Main Framer Motion morphing capsule
│   │   ├── MediaIsland.tsx # Audio player widget
│   │   ├── ShelfIsland.tsx # Screenshot & file drag-and-drop preview
│   │   └── SystemHUD.tsx   # Battery & Volume pill notifications
│   ├── hooks/              # Custom React hooks (useClipboard, useMedia)
│   ├── styles/             # Tailwind CSS & global styles
│   └── types/              # TypeScript definitions
└── vite.config.ts          # Vite build configuration
```

---

## 🚀 Getting Started

### Prerequisites
- **Operating System:** Windows 10 (1903+) or Windows 11
- **Node.js:** v18.0.0 or higher (Tested on Node.js v24.12)
- **Package Manager:** `npm` or `pnpm`

### Installation

1. **Clone the repository:**
   ```bash
   git clone <YOUR_REPO_URL>
   cd Dynasis
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Run in development mode:**
   ```bash
   npm run dev
   ```

4. **Build production installer:**
   ```bash
   npm run build
   ```

---

## 📖 Documentation
For the full system specification, UX states, and API design, refer to the [PRD.md](file:///e:/Project/Dynasis/PRD.md).

---

## 🤝 Contributing
Contributions, feature requests, and bug reports are welcome! Feel free to open an issue or submit a pull request.

---

## 📄 License
This project is licensed under the [MIT License](LICENSE).
