'use strict';

/**
 * app.js — Main entry point.
 * Initializes all modules and wires together events.
 */
document.addEventListener('DOMContentLoaded', () => {

  // ─── Initialize modules ──────────────────────────────────────────────────
  Canvas.init({
    onContextMenu: cfg => ContextMenu.show(cfg),
    onDoubleClick: (id, type) => { if (type === 'image') Sidebar.openImageDetails(id); },
    onViewportChange: () => Minimap.render(Board.getState())
  });

  Sidebar.init();
  Minimap.init();
  Exporter.init();
  GroupLasso.init();
  ContextMenu.init();

  // ─── Reactive rendering ───────────────────────────────────────────────────
  Board.onChange(state => {
    Canvas.render(state);
    Sidebar.render(state);
    Minimap.render(state);
  });

  // Trigger initial (empty) render
  const initial = Board.getState();
  Canvas.render(initial);
  Sidebar.render(initial);
  Minimap.render(initial);

  // ─── Toolbar buttons ──────────────────────────────────────────────────────
  document.getElementById('btn-zoom-in').addEventListener('click', () => Canvas.zoomIn());
  document.getElementById('btn-zoom-out').addEventListener('click', () => Canvas.zoomOut());
  document.getElementById('btn-zoom-fit').addEventListener('click', () => Canvas.fitAll());

  // Click zoom label to reset to 100%
  document.getElementById('zoom-level').addEventListener('click', () => Canvas.resetZoom());

  document.getElementById('btn-new').addEventListener('click', () => {
    if (confirm('Start a new board? Unsaved changes will be lost.')) {
      Board.reset();
      Canvas.clearSelection();
    }
  });

  document.getElementById('btn-save').addEventListener('click', () => Storage.save());
  document.getElementById('btn-load').addEventListener('click', () => document.getElementById('load-input').click());
  document.getElementById('btn-export').addEventListener('click', () => Exporter.start());

  // ─── Sidebar add buttons ──────────────────────────────────────────────────
  document.getElementById('btn-add-image').addEventListener('click', () => {
    document.getElementById('file-input').click();
  });

  document.getElementById('btn-connect').addEventListener('click', () => Canvas.setConnectMode(!Canvas.isConnectMode()));

  document.getElementById('btn-add-note').addEventListener('click', () => {
    const center = Canvas.getViewportCenter();
    Board.addNote({ x: center.x - 100, y: center.y - 70 });
    showToast('Sticky note added!', 'info');
  });

  // ─── File inputs ──────────────────────────────────────────────────────────
  document.getElementById('file-input').addEventListener('change', e => {
    if (e.target.files.length) Canvas.handleFileInput(e.target.files);
    e.target.value = ''; // reset so same files can be re-selected
  });

  document.getElementById('load-input').addEventListener('change', e => {
    if (e.target.files[0]) Storage.load(e.target.files[0]);
    e.target.value = '';
  });

  // ─── Search ───────────────────────────────────────────────────────────────
  const searchInput = document.getElementById('search-input');
  let searchDebounce;
  searchInput.addEventListener('input', () => {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => {
      const q = searchInput.value.trim();
      if (!q) {
        Canvas.setSearchIds(null);
      } else {
        Canvas.setSearchIds(Board.search(q));
      }
    }, 150);
  });

  // Clear search with Escape
  searchInput.addEventListener('keydown', e => {
    if (e.key === 'Escape') { searchInput.value = ''; Canvas.setSearchIds(null); }
  });

  // ─── Keyboard shortcuts info ──────────────────────────────────────────────
  console.log(
    '%c🎨 MoodCanvas%c\n' +
    'Shortcuts:\n' +
    '  Drag background      → Pan\n' +
    '  Scroll wheel         → Zoom\n' +
    '  Middle-click drag    → Pan\n' +
    '  Space + drag         → Pan\n' +
    '  Double-click image   → Edit details\n' +
    '  Right-click          → Context menu\n' +
    '  Delete / Backspace   → Remove selected\n' +
    '  Ctrl+S               → Save board\n' +
    '  Escape               → Deselect\n',
    'color:#6C5CE7;font-size:18px;font-weight:bold',
    'color:inherit;font-size:12px'
  );
});
