'use strict';

/**
 * Exporter — region-select PNG export.
 *
 * Workflow:
 *  1. User clicks "Export PNG" → Exporter.start() shows crosshair overlay
 *  2. User draws a rectangle on the canvas
 *  3. On mouseup, we composite only the items that intersect the selection
 *     onto an offscreen <canvas> and download as PNG
 */
const Exporter = (() => {
  let overlay, selBox, msgEl;
  let selStart = null, selEnd = null;
  let active = false;

  function init() {
    overlay = document.getElementById('export-overlay');
    selBox = document.getElementById('export-selection');
    msgEl = document.getElementById('export-msg');

    document.getElementById('btn-export-cancel').addEventListener('click', cancel);

    overlay.addEventListener('mousedown', _onDown);
    overlay.addEventListener('mousemove', _onMove);
    overlay.addEventListener('mouseup', _onUp);
  }

  function start() {
    active = true;
    selStart = selEnd = null;
    selBox.style.display = 'none';
    overlay.classList.remove('hidden');
    document.body.style.cursor = 'crosshair';
  }

  function cancel() {
    active = false;
    overlay.classList.add('hidden');
    document.body.style.cursor = '';
    selStart = selEnd = null;
  }

  function _onDown(e) {
    if (!active) return;
    // Ignore clicks on the cancel button / message bar
    if (e.target.closest('#export-msg')) return;
    selStart = { x: e.clientX, y: e.clientY };
    selEnd = { x: e.clientX, y: e.clientY };
    selBox.style.display = 'block';
    _updateSelBox();
  }

  function _onMove(e) {
    if (!selStart) return;
    selEnd = { x: e.clientX, y: e.clientY };
    _updateSelBox();
  }

  function _onUp(e) {
    if (!selStart || !selEnd) return;
    const w = Math.abs(selEnd.x - selStart.x);
    const h = Math.abs(selEnd.y - selStart.y);
    if (w < 12 || h < 12) {
      showToast('Selection too small — drag a larger area', 'error');
      selStart = null;
      selBox.style.display = 'none';
      return;
    }
    _doExport();
  }

  function _updateSelBox() {
    if (!selStart || !selEnd) return;
    const x = Math.min(selStart.x, selEnd.x);
    const y = Math.min(selStart.y, selEnd.y);
    const w = Math.abs(selEnd.x - selStart.x);
    const h = Math.abs(selEnd.y - selStart.y);
    Object.assign(selBox.style, { left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px' });

    // Update the size hint in the message bar
    const canvasP1 = Canvas.screenToCanvas(Math.min(selStart.x, selEnd.x), Math.min(selStart.y, selEnd.y));
    const canvasP2 = Canvas.screenToCanvas(Math.max(selStart.x, selEnd.x), Math.max(selStart.y, selEnd.y));
    const cW = Math.round(canvasP2.x - canvasP1.x);
    const cH = Math.round(canvasP2.y - canvasP1.y);
    if (msgEl) {
      const hint = msgEl.querySelector('.export-size-hint');
      if (hint) hint.textContent = `${w}×${h}px screen · ${cW}×${cH}px canvas`;
    }
  }

  async function _doExport() {
    const x1 = Math.min(selStart.x, selEnd.x);
    const y1 = Math.min(selStart.y, selEnd.y);
    const x2 = Math.max(selStart.x, selEnd.x);
    const y2 = Math.max(selStart.y, selEnd.y);

    // Canvas-space region
    const cp1 = Canvas.screenToCanvas(x1, y1);
    const cp2 = Canvas.screenToCanvas(x2, y2);
    const expX = cp1.x, expY = cp1.y;
    const expW = cp2.x - cp1.x, expH = cp2.y - cp1.y;

    // Screen size of the export rect
    const screenW = x2 - x1;
    const screenH = y2 - y1;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const offscreen = document.createElement('canvas');
    offscreen.width = screenW * dpr;
    offscreen.height = screenH * dpr;
    const ctx = offscreen.getContext('2d');
    ctx.scale(dpr, dpr);

    const cs = Canvas.scale;

    // Background fill
    ctx.fillStyle = '#13131a';
    ctx.fillRect(0, 0, screenW, screenH);

    // Dot grid (matching canvas aesthetic)
    ctx.fillStyle = 'rgba(255,255,255,0.04)';
    const dotSize = 24 * cs;
    const gox = ((Canvas.offsetX % dotSize) + dotSize) % dotSize;
    const goy = ((Canvas.offsetY % dotSize) + dotSize) % dotSize;
    const startGX = ((gox - (x1 - (document.getElementById('canvas-area').getBoundingClientRect().left))) % dotSize + dotSize) % dotSize;
    const startGY = ((goy - (y1 - (document.getElementById('canvas-area').getBoundingClientRect().top))) % dotSize + dotSize) % dotSize;
    for (let gx = startGX - dotSize; gx < screenW; gx += dotSize) {
      for (let gy = startGY - dotSize; gy < screenH; gy += dotSize) {
        ctx.beginPath();
        ctx.arc(gx, gy, 1, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    const state = Board.getState();

    // Collect all items sorted by z-index
    const allItems = [
      ...state.images.map(i => ({ ...i, _kind: 'image' })),
      ...state.notes.map(n => ({ ...n, _kind: 'note' }))
    ].sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));

    // Draw series group frames in the export
    state.series.forEach(s => {
      const kids = state.images.filter(i => i.seriesId === s.id);
      if (!kids.length) return;
      const pad = 22;
      const fx = Math.min(...kids.map(i => i.x)) - pad;
      const fy = Math.min(...kids.map(i => i.y)) - pad;
      const fx2 = Math.max(...kids.map(i => i.x + i.width)) + pad;
      const fy2 = Math.max(...kids.map(i => i.y + i.height)) + pad;
      if (!_intersects(fx, fy, fx2 - fx, fy2 - fy, expX, expY, expW, expH)) return;

      const dx = (fx - expX) * cs, dy = (fy - expY) * cs;
      const dw = (fx2 - fx) * cs, dh = (fy2 - fy) * cs;

      ctx.save();
      ctx.globalAlpha = 0.05;
      ctx.fillStyle = s.color;
      ctx.fillRect(dx, dy, dw, dh);
      ctx.globalAlpha = 1;
      ctx.setLineDash([6, 4]);
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 2;
      ctx.strokeRect(dx, dy, dw, dh);
      ctx.setLineDash([]);

      // Label
      ctx.fillStyle = s.color;
      ctx.font = `bold ${Math.round(13 * cs)}px -apple-system, sans-serif`;
      ctx.fillText(s.name, dx + 8, dy + Math.round(20 * cs));
      ctx.restore();
    });

    // Draw items
    for (const item of allItems) {
      if (!_intersects(item.x, item.y, item.width, item.height, expX, expY, expW, expH)) continue;

      const dx = (item.x - expX) * cs;
      const dy = (item.y - expY) * cs;
      const dw = item.width * cs;
      const dh = item.height * cs;

      if (item._kind === 'image') {
        // Draw series border
        const series = item.seriesId ? state.series.find(s => s.id === item.seriesId) : null;
        if (series) {
          ctx.strokeStyle = series.color;
          ctx.lineWidth = 3;
          ctx.strokeRect(dx, dy, dw, dh);
        }
        // Draw image using the already-loaded DOM img element
        const domImg = document.querySelector(`#ci-${item.id} img, #ci-${item.id} video`);
        if (domImg) {
          ctx.drawImage(domImg, dx, dy, dw, dh);
        } else {
          // Fallback: create a new image from src
          await new Promise(resolve => {
            const tmpImg = new Image();
            tmpImg.onload = () => { ctx.drawImage(tmpImg, dx, dy, dw, dh); resolve(); };
            tmpImg.onerror = resolve;
            tmpImg.src = item.src;
          });
        }
        // Image name overlay
        ctx.save();
        const gradH = Math.min(40, dh * 0.35);
        const grad = ctx.createLinearGradient(dx, dy + dh - gradH, dx, dy + dh);
        grad.addColorStop(0, 'rgba(0,0,0,0)');
        grad.addColorStop(1, 'rgba(0,0,0,0.75)');
        ctx.fillStyle = grad;
        ctx.fillRect(dx, dy + dh - gradH, dw, gradH);
        ctx.fillStyle = 'white';
        ctx.font = `${Math.round(11 * cs)}px -apple-system, sans-serif`;
        ctx.fillText(item.name, dx + 4, dy + dh - 4);
        ctx.restore();

      } else if (item._kind === 'note') {
        const nc = NOTE_COLORS[item.colorIndex] || NOTE_COLORS[0];
        // Shadow
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.2)';
        ctx.shadowBlur = 6;
        ctx.shadowOffsetY = 3;
        ctx.fillStyle = nc.bg;
        ctx.fillRect(dx, dy, dw, dh);
        ctx.restore();
        ctx.strokeStyle = nc.border;
        ctx.lineWidth = 2;
        ctx.strokeRect(dx, dy, dw, dh);

        // Note text
        ctx.fillStyle = nc.text;
        const fontSize = Math.max(10, Math.round(13 * cs));
        ctx.font = `${fontSize}px -apple-system, sans-serif`;
        const lineH = fontSize * 1.5;
        const lines = item.text.split('\n');
        lines.forEach((line, li) => {
          ctx.fillText(line, dx + 8, dy + 26 + li * lineH, dw - 16);
        });
      }
    }

    // Download
    const dataUrl = offscreen.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `moodcanvas-${new Date().toISOString().slice(0, 10)}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    cancel();
    showToast('Export saved! 🖼️', 'success');
  }

  function _intersects(ax, ay, aw, ah, bx, by, bw, bh) {
    return !(bx > ax + aw || bx + bw < ax || by > ay + ah || by + bh < ay);
  }

  return { init, start, cancel };
})();
