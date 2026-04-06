# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A 3D photo gallery web application (Chinese UI) that displays uploaded photos arranged in a circular grid using Three.js with custom GLSL shaders for sun-like visual effects. Includes a mobile-friendly upload page accessible via QR code.

## Commands

- **Start server (local):** `npm start` (runs on port 3000 by default, configurable via `PORT` env var)
- **Start server (Docker):** `docker compose up -d` (builds image and runs on port 3000, data persisted in named volumes)
- **Rebuild after code changes:** `docker compose up -d --build`
- **Stop:** `docker compose down`
- **No tests or linter configured**

## Architecture

**Backend:** Express 5 server (`server/index.js`) — single file handling all API routes and static file serving.
- SQLite database via `better-sqlite3` at `data/photos.db` (auto-created)
- File uploads via `multer` to `public/uploads/`
- API prefix: `/api/photos` (GET list, POST single, POST `/batch`, DELETE `/:id`, DELETE `/all`, GET `/stats`)

**Frontend:** Vanilla HTML/CSS/JS (no build step, no bundler).
- `public/index.html` — main gallery page with Three.js 3D canvas, admin panel, QR code modal, upload panel
- `public/upload.html` — standalone mobile upload page (self-contained with inline CSS/JS)
- `public/js/gallery.js` — `PhotoGallery` class: Three.js scene, custom `CircleClipShader` (GLSL vertex+fragment shaders), photo grid layout, orbit controls, lightbox
- `public/css/style.css` — styles for the main gallery page

**Key design details:**
- Photos are arranged in a 15×15 grid clipped to a circle using a custom ShaderMaterial (not standard Three.js materials)
- The shader applies sun-like color tinting, limb darkening, and animated pulsing glow effects
- Unfilled grid positions render as placeholder meshes with the same shader
- Images are cropped to 1:1 aspect ratio via texture repeat/offset
- Three.js r128 and QRCode.js loaded from CDN (no local copies)

## Data Flow

Uploaded files get a UUID filename, are saved to `public/uploads/`, and metadata is stored in SQLite. The gallery frontend fetches `/api/photos` on load and creates Three.js meshes for each photo plus placeholders for empty slots. The upload page (`upload.html`) posts directly to the same API.
