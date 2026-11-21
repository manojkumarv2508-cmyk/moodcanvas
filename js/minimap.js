'use strict';

/**
 * Minimap — renders a 200×130 canvas overview in the bottom-right corner.
 * Shows all images, notes, series frames, and the current viewport rectangle.
 * Click or drag on the minimap to navigate.
 */
const Minimap = (() => {
  const W = 200, H = 130;
  let canvas, ctx, isDragging = false;

  function init() {
    canvas = document.getElementById('minimap-canvas');
    ctx = canvas.getContext('2d');
    canvas.width = W;
    canvas.height = H;

    canvas.addEventListener('mousedown', e => { isDragging = true; _navigate(e); });
    window.addEventListener('mousemove', e => { if (isDragging) _navigate(e); });
    window.addEventListener('mouseup', () => { isDragging = false; });
  }

  function render(state) {
    if (!ctx) return;
    ctx.clearRect(0, 0, W, H);

    const b = Board.getCanvasBounds();
    if (b.w < 1 || b.h < 1) return;

    // Scale so all content fits in W×H with a small margin
    const s = Math.min((W - 12) / b.w, (H - 12) / b.h);
    const padX = (W - b.w * s) / 2;
    const padY = (H - b.h * s) / 2;

    const toMap = (cx, cy) => ({ x: (cx - b.x) * s + padX, y: (cy - b.y) * s + padY });

    // Background
    ctx.fillStyle = '#0f0f13';
    ctx.fillRect(0, 0, W, H);

    // Subtle grid lines
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 0.5;
    for (let gx = padX % (24 * s); gx < W; gx += 24 * s) { ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, H); ctx.stroke(); }
    for (let gy = padY % (24 * s); gy < H; gy += 24 * s) { ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke(); }

    // Series group frames
    state.series.forEach(series => {
      const kids = state.images.filter(i => i.seriesId === series.id);
      if (kids.length < 1) return;
      const pad = 15;
      const x1 = Math.min(...kids.map(i => i.x)) - pad;
      const y1 = Math.min(...kids.map(i => i.y)) - pad;
      const x2 = Math.max(...kids.map(i => i.x + i.width)) + pad;
      const y2 = Math.max(...kids.map(i => i.y + i.height)) + pad;
      const p1 = toMap(x1, y1), p2 = toMap(x2, y2);
      ctx.strokeStyle = series.color;
      ctx.lineWidth = 1;
      ctx.globalAlpha = 0.4;
      ctx.strokeRect(p1.x, p1.y, p2.x - p1.x, p2.y - p1.y);
      ctx.globalAlpha = 1;
    });

    // Images
    state.images.forEach(img => {
      const series = img.seriesId ? state.series.find(s => s.id === img.seriesId) : null;
      const p = toMap(img.x, img.y);
      const w = Math.max(2, img.width * s);
      const h = Math.max(2, img.height * s);
      ctx.fillStyle = series ? series.color : '#334';
      ctx.globalAlpha = 0.75;
      ctx.fillRect(p.x, p.y, w, h);
      ctx.globalAlpha = 1;
    });

    // Notes
    state.notes.forEach(note => {
      const nc = NOTE_COLORS[note.colorIndex] || NOTE_COLORS[0];
      const p = toMap(note.x, note.y);
      const w = Math.max(3, note.width * s);
      const h = Math.max(3, note.height * s);
      ctx.fillStyle = nc.bg;
      ctx.globalAlpha = 0.9;
      ctx.fillRect(p.x, p.y, w, h);
      ctx.strokeStyle = nc.border;
      ctx.lineWidth = 0.5;
      ctx.strokeRect(p.x, p.y, w, h);
      ctx.globalAlpha = 1;
    });

    // Viewport rectangle
    const vp = Canvas.getViewport();
    const vpL = -vp.offsetX / vp.scale;
    const vpT = -vp.offsetY / vp.scale;
    const vpW = vp.width / vp.scale;
    const vpH = vp.height / vp.scale;
    const p1 = toMap(vpL, vpT), p2 = toMap(vpL + vpW, vpT + vpH);
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(p1.x, p1.y, p2.x - p1.x, p2.y - p1.y);
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(p1.x, p1.y, p2.x - p1.x, p2.y - p1.y);

    // Store mapping for click navigation
    canvas._mm = { b, s, padX, padY };
  }

  function _navigate(e) {
    const mm = canvas._mm;
    if (!mm) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const cx = (mx - mm.padX) / mm.s + mm.b.x;
    const cy = (my - mm.padY) / mm.s + mm.b.y;
    Canvas.navigateTo(cx, cy);
  }

  return { init, render };
})();
