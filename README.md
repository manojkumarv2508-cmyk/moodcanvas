# MoodCanvas

An infinite-canvas visual whiteboard designed for organizing images, video clips, and creative references in a clean, spatial layout.

MoodCanvas runs entirely in your web browser with zero external dependencies and zero server requirements. All project states are stored locally.

---

## Highlights

- **Infinite Canvas Workspace**: Seamless pan and zoom navigation using mouse controls, trackpad gestures, or keyboard shortcuts.
- **Direct Drag & Drop**: Drop images (`PNG`, `JPG`, `WebP`, `SVG`, `GIF`) and videos (`MP4`, `WebM`) directly onto the canvas.
- **Cross-Window Media Ingestion**: Drag generated images directly across browser tabs (for example, from ChatGPT, Midjourney web, or search engines) directly onto your board.
- **Node Connections**: Connect visual cards with bezier lines to structure thoughts, mind maps, and narrative flows.
- **Series Collections**: Group related cards into color-coded series to maintain clear thematic separation.
- **Lasso Group Selection**: Draw a bounding region around multiple cards on canvas to assign them to a series at once.
- **Rapid Tagging**: Add search tags and brutalist labels to individual cards via the quick-tag button.
- **Search & Filter**: Instantly isolate and highlight cards by tag name or title.
- **Interactive Minimap**: High-level overview of the entire workspace with clickable viewport jumping.
- **Export Capabilities**: Select an exact rectangular region or export the entire board to high-resolution PNG.
- **Local State Persistence**: Save and restore full canvas projects as portable `.moodcanvas` files.
- **Zero Tracking & Privacy-First**: 100% client-side execution. Your assets and data never leave your local machine.

---

## Quick Start

MoodCanvas requires no compilation or build step. You can run it immediately with any static file server:

### Option 1: Python

```bash
python -m http.server 3000
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

### Option 2: Node.js (npx)

```bash
npx serve .
```

### Option 3: Direct File Access
You can also open `index.html` directly in any modern browser (Chrome, Edge, Firefox, Brave, Safari).

---

## Controls & Shortcuts

| Action | Control |
| :--- | :--- |
| **Pan Canvas** | `Space + Click & Drag` or Middle Mouse Drag |
| **Zoom In / Out** | `Ctrl + Wheel` or `Cmd + Wheel` |
| **Move Card** | Click & Drag card header |
| **Resize Card** | Drag bottom-right corner resize handle |
| **Connect Cards** | Toggle **Connect** mode, click source card then target card |
| **Lasso Group** | Click the lasso icon on a series, then drag a box around items |
| **Save Board State** | `Ctrl + S` or `Cmd + S` |
| **Delete Selected** | `Delete` or `Backspace` |

---

## Security & Secrets Management

MoodCanvas is completely static and does not require private API keys to function.

To protect against inadvertent exposure of credentials when extending the application:
- A configured `.gitignore` is provided to block `.env`, credentials, local caches, and private logs from being tracked by git.
- An `.env.example` file is included as a reference template for any future backend or cloud API configurations.

---

## License

This project is open source and available under the [MIT License](LICENSE).
