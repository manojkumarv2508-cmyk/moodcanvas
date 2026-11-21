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

  // ─── Demo Showcase Loader (e.g. ?demo=1) ──────────────────────────────────
  if (window.location.search.includes('demo')) {
    const s1 = Board.addSeries('Architectural Form', '#6C5CE7');
    const s2 = Board.addSeries('Design Systems & UI', '#00CEC9');

    const img1 = Board.addImage({
      name: 'Monolithic Structure',
      src: 'assets/demo/arch-minimalism.jpg',
      x: 80, y: 80, width: 280, height: 210,
      seriesId: s1.id,
      tags: ['architecture', 'concrete', 'monochrome']
    });

    const img2 = Board.addImage({
      name: 'Brutalist Framework',
      src: 'assets/demo/techno-brutalism.jpg',
      x: 420, y: 60, width: 300, height: 225,
      seriesId: s1.id,
      tags: ['brutalist', 'structure', 'geometry']
    });

    const img3 = Board.addImage({
      name: 'Industrial Device',
      src: 'assets/demo/industrial-design.png',
      x: 780, y: 80, width: 280, height: 210,
      tags: ['hardware', 'industrial', 'form']
    });

    const img4 = Board.addImage({
      name: 'Interface Design System',
      src: 'assets/demo/ui-concept.jpg',
      x: 80, y: 350, width: 300, height: 220,
      seriesId: s2.id,
      tags: ['ui-ux', 'wireframe', 'layout']
    });

    const img5 = Board.addImage({
      name: 'Typography Hierarchy',
      src: 'assets/demo/typography-spec.svg',
      x: 440, y: 350, width: 280, height: 210,
      seriesId: s2.id,
      tags: ['typography', 'inter', 'scale']
    });

    const img6 = Board.addImage({
      name: 'Chromatic Harmony',
      src: 'assets/demo/color-palette.svg',
      x: 780, y: 350, width: 280, height: 210,
      tags: ['palette', 'cyber', 'branding']
    });

    const n1 = Board.addNote({
      text: '💡 Concept Note:\nMinimal off-white canvas with hairline borders, spatial hierarchy, and rapid tag indexing.',
      x: 1120, y: 100, width: 240, height: 160, colorIndex: 0
    });

    const n2 = Board.addNote({
      text: '⚡ Integration Verified:\nCross-tab drop ingestion from web tabs and AI image generators working smoothly.',
      x: 1120, y: 330, width: 240, height: 150, colorIndex: 2
    });

    if (img1 && img2) Board.addConnection(img1.id, img2.id);
    if (img2 && img3) Board.addConnection(img2.id, img3.id);
    if (img4 && img5) Board.addConnection(img4.id, img5.id);
    if (img5 && img6) Board.addConnection(img5.id, img6.id);
    if (img3 && n1) Board.addConnection(img3.id, n1.id);

    if (window.location.search.includes('search')) {
      const sInput = document.getElementById('search-input');
      sInput.value = 'brutalist';
      setTimeout(() => Canvas.setSearchIds(Board.search('brutalist')), 200);
    }

    if (window.location.search.includes('connect')) {
      setTimeout(() => Canvas.setConnectMode(true), 200);
    }

    setTimeout(() => Canvas.fitAll(), 150);
  }
});
