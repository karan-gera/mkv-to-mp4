# MKV to MP4 Converter

A lightweight, cross-platform desktop app to convert video files to MP4 format using ffmpeg.

## Features

- **Drag and drop** - Simply drag video files onto the app
- **Browse files** - Click to open a native file picker
- **Fast conversion** - Uses `ffmpeg -codec copy` for near-instant remuxing (no re-encoding)
- **Auto-install ffmpeg** - Prompts to install ffmpeg if not found
- **Smart output naming** - Prevents overwriting by appending `_1`, `_2`, etc.
- **Cross-platform** - Works on macOS and Windows
- **Lightweight** - ~15MB app size (vs ~150MB for Electron)

## Supported Input Formats

MKV, AVI, MOV, WMV, FLV, WebM, M4V, MPEG, MPG, 3GP

## Development

### Prerequisites

- [Rust](https://rustup.rs/)
- [Bun](https://bun.sh/) (or npm)
- [Tauri CLI](https://tauri.app/)

### Setup

```bash
# Install dependencies
bun install

# Run in development mode
bun run tauri dev

# Build for production
bun run tauri build
```

### Project Structure

```
mkv-to-mp4/
├── src/                    # Frontend (HTML/CSS/JS)
│   ├── index.html
│   ├── main.js
│   └── styles.css
├── src-tauri/              # Backend (Rust)
│   ├── src/
│   │   ├── lib.rs          # Main commands
│   │   └── main.rs         # Entry point
│   └── tauri.conf.json     # Tauri config
└── package.json
```

## How It Works

The app uses ffmpeg's "copy" codec mode, which simply remuxes the video stream from one container format (like MKV) to another (MP4) without re-encoding. This is:

- **Fast** - Takes seconds, not minutes
- **Lossless** - No quality loss whatsoever
- **Efficient** - Minimal CPU usage

## License

MIT
