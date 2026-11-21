'use strict';

/**
 * Canvas — infinite canvas engine.
 * Handles: pan/zoom viewport, DOM rendering of items, drag/resize, selection,
 * file drop, search/filter highlighting.
 */
const Canvas = (() => {
  // ─── Viewport state ─────────────────────────────────────────────────────────
  let offsetX = 0, offsetY = 0, scale = 1;

  // ─── Interaction state ──────────────────────────────────────────────────────
  let bgDragStart = null, bgDragged = false;
  let spaceDown = false;
  let dragState = null;    // { id, type, startMouseX, startMouseY, startItemX, startItemY }
  let resizeState = null;  // { id, type, handle, x, y, startW, startH, startMouseX, startMouseY }

  // ─── Selection ──────────────────────────────────────────────────────────────
  let selectedId = null, selectedType = null;

  // ─── Filter state ───────────────────────────────────────────────────────────
  let activeSearchIds = null; // null = no filter, Set<string> = matching ids

  // ─── Connection state ───────────────────────────────────────────────────────
  let connectMode = false, connectFrom = null, connSvg = null;

  // ─── DOM refs ───────────────────────────────────────────────────────────────
  let area, viewport, emptyState;

  // ─── Item element registries ─────────────────────────────────────────────────
  const imgEls = new Map();    // imageId  → div.canvas-item
  const noteEls = new Map();   // noteId   → div.canvas-item
  const frameEls = new Map();  // seriesId → div.series-group-frame

  // ─── Callbacks ──────────────────────────────────────────────────────────────
  let cbContextMenu = () => {};
  let cbDoubleClick = () => {};
  let cbViewportChange = () => {};

  // ═══════════════════════════════════════════════════════════════════════════
  // INIT
  // ═══════════════════════════════════════════════════════════════════════════
  function init(opts = {}) {
    area = document.getElementById('canvas-area');
    viewport = document.getElementById('canvas-viewport');
    cbContextMenu = opts.onContextMenu || cbContextMenu;
    cbDoubleClick = opts.onDoubleClick || cbDoubleClick;
    cbViewportChange = opts.onViewportChange || cbViewportChange;

    _createEmptyState();
    _setupEvents();
    _applyTransform();
    _updateZoomLabel();
  }

  function _createEmptyState() {
    emptyState = document.createElement('div');
    emptyState.className = 'empty-state';
    emptyState.innerHTML = `
      <div class="empty-icon">🖼️</div>
      <div class="empty-title">Your canvas is empty</div>
      <div class="empty-sub">Drag &amp; drop images or videos from your computer<br>or click <strong>Add Media</strong> in the panel</div>
    `;
    area.appendChild(emptyState);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // EVENT SETUP
  // ═══════════════════════════════════════════════════════════════════════════
  function _setupEvents() {
    // Zoom
    area.addEventListener('wheel', _onWheel, { passive: false });

    // Pan / item drag
    area.addEventListener('mousedown', _onAreaMouseDown);
    window.addEventListener('mousemove', _onMouseMove);
    window.addEventListener('mouseup', _onMouseUp);

    // Keyboard
    window.addEventListener('keydown', _onKeyDown);
    window.addEventListener('keyup', _onKeyUp);

    // Context menu on canvas background
    area.addEventListener('contextmenu', e => {
      e.preventDefault();
      if (_isBackground(e.target)) {
        cbContextMenu({ type: 'canvas', x: e.clientX, y: e.clientY });
      }
    });

    // Drag & drop files
    area.addEventListener('dragover', e => {
      e.preventDefault();
      document.getElementById('drop-overlay').classList.add('active');
    });
    area.addEventListener('dragleave', e => {
      if (!area.contains(e.relatedTarget)) {
        document.getElementById('drop-overlay').classList.remove('active');
      }
    });
    area.addEventListener('drop', e => {
      e.preventDefault();
      document.getElementById('drop-overlay').classList.remove('active');
      const files = Array.from(e.dataTransfer.files);
      const canvasPos = screenToCanvas(e.clientX, e.clientY);
      if (files.length > 0) {
        _processFiles(files, canvasPos);
      } else {
        const html = e.dataTransfer.getData('text/html');
        const url = e.dataTransfer.getData('URL') || e.dataTransfer.getData('text/plain');
        if (html || url) {
          _processExternalUrl(html, url, canvasPos);
        } else {
          showToast('No valid media found in dropped content', 'error');
        }
      }
    });

    // Paste images from clipboard
    document.addEventListener('paste', e => {
      const imageItems = Array.from(e.clipboardData.items).filter(i => i.type.startsWith('image/'));
      if (!imageItems.length) return;
      e.preventDefault();
      _processFiles(imageItems.map(i => i.getAsFile()), screenToCanvas(area.clientWidth / 2, area.clientHeight / 2));
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MOUSE HANDLERS
  // ═══════════════════════════════════════════════════════════════════════════
  function _onWheel(e) {
    e.preventDefault();
    const rect = area.getBoundingClientRect();
    const mX = e.clientX - rect.left;
    const mY = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 1.12 : 0.88;
    const newScale = clamp(scale * factor, 0.04, 10);
    offsetX = mX - (mX - offsetX) * (newScale / scale);
    offsetY = mY - (mY - offsetY) * (newScale / scale);
    scale = newScale;
    _applyTransform();
    _updateZoomLabel();
    cbViewportChange();
  }

  function _onAreaMouseDown(e) {
    // Middle click → pan
    if (e.button === 1) {
      bgDragStart = { x: e.clientX, y: e.clientY, ox: offsetX, oy: offsetY };
      bgDragged = false;
      area.style.cursor = 'grabbing';
      e.preventDefault();
      return;
    }
    if (e.button !== 0) return;

    // Left click on background → pan or deselect
    if (_isBackground(e.target) || spaceDown) {
      bgDragStart = { x: e.clientX, y: e.clientY, ox: offsetX, oy: offsetY };
      bgDragged = false;
      if (spaceDown) area.style.cursor = 'grabbing';
      e.preventDefault();
    }
  }

  function _onMouseMove(e) {
    // Background pan
    if (bgDragStart) {
      const dx = e.clientX - bgDragStart.x;
      const dy = e.clientY - bgDragStart.y;
      if (!bgDragged && dx * dx + dy * dy > 9) bgDragged = true;
      if (bgDragged) {
        offsetX = bgDragStart.ox + dx;
        offsetY = bgDragStart.oy + dy;
        _applyTransform();
        cbViewportChange();
      }
      return;
    }

    // Item drag
    if (dragState) {
      const dx = (e.clientX - dragState.startMouseX) / scale;
      const dy = (e.clientY - dragState.startMouseY) / scale;
      const upd = { x: dragState.startItemX + dx, y: dragState.startItemY + dy };
      if (dragState.type === 'image') Board.updateImage(dragState.id, upd);
      else Board.updateNote(dragState.id, upd);
      return;
    }

    // Resize
    if (resizeState) _doResize(e);
  }

  function _onMouseUp(e) {
    if (bgDragStart) {
      if (!bgDragged) clearSelection();  // click without movement → deselect
      bgDragStart = null;
      bgDragged = false;
      area.style.cursor = spaceDown ? 'grab' : '';
    }
    dragState = null;
    resizeState = null;
  }

  function _onKeyDown(e) {
    const inInput = e.target.closest('input, textarea, [contenteditable]');
    if (e.code === 'Space' && !inInput) {
      e.preventDefault();
      if (!spaceDown) { spaceDown = true; area.style.cursor = 'grab'; }
    }
    if ((e.code === 'Delete' || e.code === 'Backspace') && !inInput && selectedId) {
      if (selectedType === 'image') Board.deleteImage(selectedId);
      else if (selectedType === 'note') Board.deleteNote(selectedId);
      clearSelection();
    }
    if (e.code === 'Escape') { clearSelection(); if (connectMode) setConnectMode(false); }
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyS') { e.preventDefault(); Storage.save(); }
  }

  function _onKeyUp(e) {
    if (e.code === 'Space') { spaceDown = false; area.style.cursor = ''; }
  }

  function _isBackground(target) {
    return target === area || target === viewport || target === emptyState ||
      target.classList.contains('series-group-frame') ||
      target.classList.contains('series-group-label') ||
      target.classList.contains('empty-icon') ||
      target.classList.contains('empty-title') ||
      target.classList.contains('empty-sub');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RESIZE
  // ═══════════════════════════════════════════════════════════════════════════
  function _doResize(e) {
    const rs = resizeState;
    const dx = (e.clientX - rs.startMouseX) / scale;
    const dy = (e.clientY - rs.startMouseY) / scale;
    const MIN = 40;
    let { x, y } = rs;
    let width = rs.startW, height = rs.startH;

    const h = rs.handle;
    if (h.includes('e')) width = Math.max(MIN, rs.startW + dx);
    if (h.includes('s')) height = Math.max(MIN, rs.startH + dy);
    if (h.includes('w')) { const nw = Math.max(MIN, rs.startW - dx); x = rs.x + rs.startW - nw; width = nw; }
    if (h.includes('n')) { const nh = Math.max(MIN, rs.startH - dy); y = rs.y + rs.startH - nh; height = nh; }

    const upd = { x, y, width, height };
    if (rs.type === 'image') Board.updateImage(rs.id, upd);
    else Board.updateNote(rs.id, upd);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TRANSFORM
  // ═══════════════════════════════════════════════════════════════════════════
  function _applyTransform() {
    viewport.style.transform = `translate(${offsetX}px,${offsetY}px) scale(${scale})`;
    // Animate dot grid with viewport
    const dotSize = 24 * scale;
    const gx = ((offsetX % dotSize) + dotSize) % dotSize;
    const gy = ((offsetY % dotSize) + dotSize) % dotSize;
    area.style.backgroundSize = `${dotSize}px ${dotSize}px`;
    area.style.backgroundPosition = `${gx}px ${gy}px`;
  }

  function _updateZoomLabel() {
    const el = document.getElementById('zoom-level');
    if (el) el.textContent = Math.round(scale * 100) + '%';
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // COORDINATE UTILS
  // ═══════════════════════════════════════════════════════════════════════════
  function screenToCanvas(screenX, screenY) {
    const rect = area.getBoundingClientRect();
    return {
      x: (screenX - rect.left - offsetX) / scale,
      y: (screenY - rect.top - offsetY) / scale
    };
  }

  function getViewportCenter() {
    return screenToCanvas(area.clientWidth / 2, area.clientHeight / 2);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ZOOM CONTROLS
  // ═══════════════════════════════════════════════════════════════════════════
  function _zoomAt(cx, cy, factor) {
    const newScale = clamp(scale * factor, 0.04, 10);
    offsetX = cx - (cx - offsetX) * (newScale / scale);
    offsetY = cy - (cy - offsetY) * (newScale / scale);
    scale = newScale;
    _applyTransform();
    _updateZoomLabel();
    cbViewportChange();
  }

  function zoomIn() { _zoomAt(area.clientWidth / 2, area.clientHeight / 2, 1.2); }
  function zoomOut() { _zoomAt(area.clientWidth / 2, area.clientHeight / 2, 0.8); }
  function resetZoom() { _zoomAt(area.clientWidth / 2, area.clientHeight / 2, 1 / scale); }

  function fitAll() {
    const b = Board.getCanvasBounds();
    const aW = area.clientWidth, aH = area.clientHeight;
    const newScale = clamp(Math.min(aW / b.w, aH / b.h) * 0.88, 0.04, 10);
    offsetX = (aW - b.w * newScale) / 2 - b.x * newScale;
    offsetY = (aH - b.h * newScale) / 2 - b.y * newScale;
    scale = newScale;
    _applyTransform();
    _updateZoomLabel();
    cbViewportChange();
  }

  function navigateTo(cx, cy) {
    offsetX = area.clientWidth / 2 - cx * scale;
    offsetY = area.clientHeight / 2 - cy * scale;
    _applyTransform();
    cbViewportChange();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SELECTION
  // ═══════════════════════════════════════════════════════════════════════════
  function selectItem(id, type) {
    if (selectedId) {
      const el = document.getElementById('ci-' + selectedId);
      if (el) el.classList.remove('selected');
    }
    selectedId = id;
    selectedType = type;
    if (id) {
      const el = document.getElementById('ci-' + id);
      if (el) el.classList.add('selected');
    }
  }

  function clearSelection() { selectItem(null, null); }
  function getSelected() { return { id: selectedId, type: selectedType }; }

  // ═══════════════════════════════════════════════════════════════════════════
  // DRAG / RESIZE INITIATION (called from item event handlers)
  // ═══════════════════════════════════════════════════════════════════════════
  function startItemDrag(id, type, e, item) {
    if (connectMode) { e.stopPropagation(); e.preventDefault(); _handleConnectClick(id); return; }
    if (item.locked || spaceDown) return;
    e.stopPropagation();
    dragState = { id, type, startMouseX: e.clientX, startMouseY: e.clientY, startItemX: item.x, startItemY: item.y };
    Board.bringToFront(id);
    selectItem(id, type);
  }

  function startResize(id, type, handle, e, item) {
    e.stopPropagation();
    e.preventDefault();
    resizeState = { id, type, handle, x: item.x, y: item.y, startW: item.width, startH: item.height, startMouseX: e.clientX, startMouseY: e.clientY };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SEARCH / FILTER
  // ═══════════════════════════════════════════════════════════════════════════
  function setSearchIds(ids) {
    activeSearchIds = ids ? new Set(ids) : null;
    _applyFilter();
  }

  function setTagFilter(tag) {
    if (!tag) { setSearchIds(null); return; }
    const ids = Board.getState().images.filter(img => img.tags && img.tags.includes(tag)).map(img => img.id);
    setSearchIds(ids);
  }

  function _applyFilter() {
    for (const [id, el] of imgEls) {
      if (activeSearchIds === null) {
        el.classList.remove('search-dim', 'search-highlight');
      } else if (activeSearchIds.has(id)) {
        el.classList.remove('search-dim');
        el.classList.add('search-highlight');
      } else {
        el.classList.add('search-dim');
        el.classList.remove('search-highlight');
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDERING
  // ═══════════════════════════════════════════════════════════════════════════
  function render(state) {
    _renderSeriesFrames(state);
    _renderImages(state);
    _renderNotes(state);
    _renderConnections(state);
    _updateEmptyState(state);
    _applyFilter();
  }

  // ─── Connections (SVG bezier lines) ──────────────────────────────────────
  function _ensureSvg() {
    if (connSvg) return;
    connSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    connSvg.setAttribute('class', 'conn-svg');
    viewport.insertBefore(connSvg, viewport.firstChild);
  }

  function _anchor(r, tx, ty) {
    // midpoint of the rect edge that faces the target point
    const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
    const dx = tx - cx, dy = ty - cy;
    if (Math.abs(dx) * r.height > Math.abs(dy) * r.width) {
      return { x: dx > 0 ? r.x + r.width : r.x, y: cy, h: true, dir: dx > 0 ? 1 : -1 };
    }
    return { x: cx, y: dy > 0 ? r.y + r.height : r.y, h: false, dir: dy > 0 ? 1 : -1 };
  }

  function _renderConnections(state) {
    _ensureSvg();
    const rects = new Map();
    state.images.forEach(i => rects.set(i.id, i));
    state.notes.forEach(n => rects.set(n.id, n));

    let html = '';
    (state.connections || []).forEach(c => {
      const a = rects.get(c.from), b = rects.get(c.to);
      if (!a || !b) return;
      const ac = { x: a.x + a.width / 2, y: a.y + a.height / 2 };
      const bc = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
      const p1 = _anchor(a, bc.x, bc.y), p2 = _anchor(b, ac.x, ac.y);
      const k = Math.max(40, Math.hypot(p2.x - p1.x, p2.y - p1.y) * 0.35);
      const c1 = p1.h ? `${p1.x + p1.dir * k},${p1.y}` : `${p1.x},${p1.y + p1.dir * k}`;
      const c2 = p2.h ? `${p2.x + p2.dir * k},${p2.y}` : `${p2.x},${p2.y + p2.dir * k}`;
      html += `<path class="conn-path" data-cid="${c.id}" d="M${p1.x},${p1.y} C${c1} ${c2} ${p2.x},${p2.y}"/>` +
              `<circle class="conn-dot" cx="${p1.x}" cy="${p1.y}" r="4"/><circle class="conn-dot" cx="${p2.x}" cy="${p2.y}" r="4"/>`;
    });
    connSvg.innerHTML = html;
    connSvg.querySelectorAll('.conn-path').forEach(p => {
      p.addEventListener('mousedown', e => e.stopPropagation());
      p.addEventListener('dblclick', e => {
        e.stopPropagation();
        Board.deleteConnection(p.dataset.cid);
        showToast('Connection removed', 'info');
      });
    });
  }

  // ─── Connect mode ────────────────────────────────────────────────────────
  function setConnectMode(on) {
    connectMode = !!on;
    _clearConnectSource();
    area.classList.toggle('connecting', connectMode);
    const btn = document.getElementById('btn-connect');
    if (btn) btn.classList.toggle('active', connectMode);
    if (connectMode) showToast('Click one card, then another to connect them', 'info');
  }

  function _clearConnectSource() {
    if (connectFrom) {
      const el = document.getElementById('ci-' + connectFrom);
      if (el) el.classList.remove('conn-source');
    }
    connectFrom = null;
  }

  function _handleConnectClick(id) {
    if (!connectFrom) {
      connectFrom = id;
      const el = document.getElementById('ci-' + id);
      if (el) el.classList.add('conn-source');
      return;
    }
    if (connectFrom === id) { _clearConnectSource(); return; }
    const made = Board.addConnection(connectFrom, id);
    _clearConnectSource();
    if (!made) showToast('Already connected', 'info');
  }

  function _updateEmptyState(state) {
    if (emptyState) {
      emptyState.style.display = (state.images.length === 0 && state.notes.length === 0) ? 'flex' : 'none';
    }
  }

  // ─── Series group frames ─────────────────────────────────────────────────
  function _renderSeriesFrames(state) {
    const { series, images } = state;
    const activeIds = new Set(series.map(s => s.id));

    // Remove orphaned frames
    for (const [sid, el] of frameEls) {
      if (!activeIds.has(sid)) { el.remove(); frameEls.delete(sid); }
    }

    series.forEach(s => {
      const kids = images.filter(img => img.seriesId === s.id);
      let el = frameEls.get(s.id);

      if (kids.length === 0) {
        if (el) el.style.display = 'none';
        return;
      }

      const pad = 22;
      const x1 = Math.min(...kids.map(i => i.x)) - pad;
      const y1 = Math.min(...kids.map(i => i.y)) - pad;
      const x2 = Math.max(...kids.map(i => i.x + i.width)) + pad;
      const y2 = Math.max(...kids.map(i => i.y + i.height)) + pad;

      if (!el) {
        el = document.createElement('div');
        el.className = 'series-group-frame';
        const label = document.createElement('div');
        label.className = 'series-group-label';
        el.appendChild(label);
        viewport.insertBefore(el, viewport.firstChild);
        frameEls.set(s.id, el);
      }

      el.style.display = 'block';
      el.style.left = x1 + 'px';
      el.style.top = (y1 - 30) + 'px';
      el.style.width = (x2 - x1) + 'px';
      el.style.height = (y2 - y1 + 30) + 'px';
      el.style.borderColor = s.color;
      el.style.background = hexToRgba(s.color, 0.05);

      const label = el.querySelector('.series-group-label');
      label.textContent = s.name;
      label.style.background = s.color;
    });
  }

  // ─── Images ──────────────────────────────────────────────────────────────
  function _renderImages(state) {
    const { images, series } = state;
    const activeIds = new Set(images.map(i => i.id));

    for (const [id, el] of imgEls) {
      if (!activeIds.has(id)) { el.remove(); imgEls.delete(id); }
    }

    images.forEach(img => {
      let el = imgEls.get(img.id);
      if (!el) {
        el = _createImageEl(img);
        viewport.appendChild(el);
        imgEls.set(img.id, el);
      }
      _updateImageEl(el, img, series);
    });
  }

  function _createImageEl(img) {
    const el = document.createElement('div');
    el.className = 'canvas-item image-item';
    el.id = 'ci-' + img.id;
    el.dataset.id = img.id;

    const isVideo = img.kind === 'video';
    const media = isVideo
      ? `<video src="${img.src}" muted loop playsinline preload="metadata" draggable="false"></video>
         <button class="video-play" title="Play / pause">▶</button>`
      : `<img src="${img.src}" alt="" draggable="false">`;

    el.innerHTML = `
      <div class="item-frame" id="fr-${img.id}">
        ${media}
        <div class="item-overlay">
          <div class="item-tags-row" id="tg-${img.id}"></div>
          <div class="item-label" id="lb-${img.id}"></div>
        </div>
        <div class="item-badges" id="bd-${img.id}"></div>
      </div>
      <button class="quick-tag-btn" title="Add Tag">+</button>
      <div class="resize-handles">
        ${['nw','n','ne','e','se','s','sw','w'].map(h =>
          `<div class="resize-handle rh-${h}" data-handle="${h}"></div>`).join('')}
      </div>
    `;

    if (isVideo) {
      const vid = el.querySelector('video');
      const btn = el.querySelector('.video-play');
      btn.addEventListener('mousedown', e => e.stopPropagation());
      btn.addEventListener('click', e => {
        e.stopPropagation();
        if (vid.paused) { vid.play(); btn.textContent = '❚❚'; el.classList.add('playing'); }
        else { vid.pause(); btn.textContent = '▶'; el.classList.remove('playing'); }
      });
    }

    // Quick tag
    el.querySelector('.quick-tag-btn').addEventListener('click', e => {
      e.stopPropagation();
      const newTag = prompt('Add a new tag:');
      if (newTag && newTag.trim()) {
        const item = Board.getImageById(img.id);
        const tags = item.tags || [];
        if (!tags.includes(newTag.trim())) {
          Board.updateImage(img.id, { tags: [...tags, newTag.trim()] });
        }
      }
    });

    // Drag
    el.querySelector('.item-frame').addEventListener('mousedown', e => {
      if (e.button !== 0) return;
      if (e.target.classList.contains('resize-handle')) return;
      const item = Board.getImageById(img.id);
      if (!item) return;
      startItemDrag(img.id, 'image', e, item);
    });

    // Double-click → details modal
    el.addEventListener('dblclick', e => {
      e.stopPropagation();
      cbDoubleClick(img.id, 'image');
    });

    // Context menu
    el.addEventListener('contextmenu', e => {
      e.preventDefault();
      e.stopPropagation();
      selectItem(img.id, 'image');
      cbContextMenu({ type: 'image', id: img.id, x: e.clientX, y: e.clientY });
    });

    // Resize handles
    el.querySelectorAll('.resize-handle').forEach(handle => {
      handle.addEventListener('mousedown', e => {
        if (e.button !== 0) return;
        const item = Board.getImageById(img.id);
        if (!item) return;
        startResize(img.id, 'image', handle.dataset.handle, e, item);
      });
    });

    return el;
  }

  function _updateImageEl(el, img, series) {
    // Position / size
    el.style.cssText += `left:${img.x}px;top:${img.y}px;width:${img.width}px;height:${img.height}px;z-index:${img.zIndex};`;
    el.classList.toggle('locked', img.locked);

    // Series border color
    const frame = document.getElementById('fr-' + img.id);
    if (frame) {
      const s = img.seriesId ? series.find(s => s.id === img.seriesId) : null;
      frame.style.borderColor = s ? s.color : 'transparent';
    }

    // Label
    const lb = document.getElementById('lb-' + img.id);
    if (lb) lb.textContent = img.name;

    // Tags
    const tg = document.getElementById('tg-' + img.id);
    if (tg) tg.innerHTML = (img.tags || []).map(t => `<span class="item-tag">#${t}</span>`).join('');

    // Badges (note indicator, lock)
    const bd = document.getElementById('bd-' + img.id);
    if (bd) {
      bd.innerHTML = '';
      if (img.note) {
        const n = document.createElement('span');
        n.className = 'badge-note';
        n.title = img.note;
        n.textContent = '📝';
        bd.appendChild(n);
      }
      if (img.locked) {
        const l = document.createElement('span');
        l.className = 'badge-lock';
        l.textContent = '🔒';
        bd.appendChild(l);
      }
    }
  }

  // ─── Notes ───────────────────────────────────────────────────────────────
  function _renderNotes(state) {
    const { notes } = state;
    const activeIds = new Set(notes.map(n => n.id));

    for (const [id, el] of noteEls) {
      if (!activeIds.has(id)) { el.remove(); noteEls.delete(id); }
    }

    notes.forEach(note => {
      let el = noteEls.get(note.id);
      if (!el) {
        el = _createNoteEl(note);
        viewport.appendChild(el);
        noteEls.set(note.id, el);
      }
      _updateNoteEl(el, note);
    });
  }

  function _createNoteEl(note) {
    const nc = NOTE_COLORS[note.colorIndex] || NOTE_COLORS[0];
    const el = document.createElement('div');
    el.className = 'canvas-item note-item';
    el.id = 'ci-' + note.id;
    el.dataset.id = note.id;

    el.innerHTML = `
      <div class="item-frame note-frame" id="fr-${note.id}" style="background:${nc.bg};border-color:${nc.border}">
        <div class="note-header">
          <span class="note-drag-bar">⠿</span>
          <div class="note-color-dots" id="nc-${note.id}">
            ${NOTE_COLORS.map((c, i) =>
              `<span class="note-dot" data-ci="${i}" style="background:${c.bg};border-color:${c.border}" title="${['Yellow','Green','Blue','Pink','Purple'][i]}"></span>`
            ).join('')}
          </div>
        </div>
        <textarea class="note-content" placeholder="Type your note here…">${note.text}</textarea>
      </div>
      <div class="resize-handles">
        ${['nw','n','ne','e','se','s','sw','w'].map(h =>
          `<div class="resize-handle rh-${h}" data-handle="${h}"></div>`).join('')}
      </div>
    `;

    const header = el.querySelector('.note-header');
    const textarea = el.querySelector('.note-content');

    // Drag via header
    header.addEventListener('mousedown', e => {
      if (e.button !== 0) return;
      if (e.target.classList.contains('note-dot')) return;
      const n = Board.getNoteById(note.id);
      if (!n) return;
      startItemDrag(note.id, 'note', e, n);
      selectItem(note.id, 'note');
    });

    // Color dots
    el.querySelectorAll('.note-dot').forEach(dot => {
      dot.addEventListener('click', e => {
        e.stopPropagation();
        Board.updateNote(note.id, { colorIndex: parseInt(dot.dataset.ci) });
      });
    });

    // Text input
    textarea.addEventListener('input', () => Board.updateNote(note.id, { text: textarea.value }));
    textarea.addEventListener('mousedown', e => { e.stopPropagation(); selectItem(note.id, 'note'); });
    textarea.addEventListener('keydown', e => e.stopPropagation());

    // Click on frame (but not textarea) → drag note
    el.querySelector('.note-frame').addEventListener('mousedown', e => {
      if (e.button !== 0 || e.target === textarea || e.target.closest('.note-header')) return;
      const n = Board.getNoteById(note.id);
      if (!n) return;
      startItemDrag(note.id, 'note', e, n);
      selectItem(note.id, 'note');
    });

    // Context menu
    el.addEventListener('contextmenu', e => {
      e.preventDefault();
      e.stopPropagation();
      selectItem(note.id, 'note');
      cbContextMenu({ type: 'note', id: note.id, x: e.clientX, y: e.clientY });
    });

    // Resize handles
    el.querySelectorAll('.resize-handle').forEach(handle => {
      handle.addEventListener('mousedown', e => {
        if (e.button !== 0) return;
        const n = Board.getNoteById(note.id);
        if (!n) return;
        startResize(note.id, 'note', handle.dataset.handle, e, n);
      });
    });

    return el;
  }

  function _updateNoteEl(el, note) {
    el.style.left = note.x + 'px';
    el.style.top = note.y + 'px';
    el.style.width = note.width + 'px';
    el.style.height = note.height + 'px';
    el.style.zIndex = note.zIndex;

    const nc = NOTE_COLORS[note.colorIndex] || NOTE_COLORS[0];
    const frame = document.getElementById('fr-' + note.id);
    if (frame) { frame.style.background = nc.bg; frame.style.borderColor = nc.border; }

    const ta = el.querySelector('.note-content');
    if (ta && document.activeElement !== ta) ta.value = note.text;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FILE PROCESSING
  // ═══════════════════════════════════════════════════════════════════════════
  function handleFileInput(files) {
    _processFiles(Array.from(files), getViewportCenter());
  }

  const MAX_VIDEO_MB = 60;

  function _processFiles(files, canvasPos) {
    const mediaFiles = files.filter(f => f && f.type && (f.type.startsWith('image/') || f.type.startsWith('video/')));
    if (!mediaFiles.length) { showToast('No image or video files found', 'error'); return; }

    const cols = Math.ceil(Math.sqrt(mediaFiles.length));
    let loaded = 0;
    const done = () => {
      loaded++;
      if (loaded === mediaFiles.length) showToast(`Added ${loaded} item${loaded !== 1 ? 's' : ''}`, 'success');
    };

    mediaFiles.forEach((file, i) => {
      const isVideo = file.type.startsWith('video/');
      if (isVideo && file.size > MAX_VIDEO_MB * 1024 * 1024) {
        showToast(`"${file.name}" is over ${MAX_VIDEO_MB} MB — skipped`, 'error');
        done();
        return;
      }
      const reader = new FileReader();
      reader.onload = evt => {
        const src = evt.target.result;
        const place = (nw, nh) => {
          const { width, height } = getInitialImageSize(nw, nh);
          const col = i % cols, row = Math.floor(i / cols);
          const gap = 20;
          const xOff = mediaFiles.length === 1 ? -width / 2 : 0;
          const yOff = mediaFiles.length === 1 ? -height / 2 : 0;
          Board.addImage({
            name: file.name ? file.name.replace(/\.[^/.]+$/, '') : 'Pasted image',
            kind: isVideo ? 'video' : 'image',
            src, width, height,
            x: canvasPos.x + xOff + col * (width + gap),
            y: canvasPos.y + yOff + row * (height + gap)
          });
          done();
        };
        if (isVideo) {
          const v = document.createElement('video');
          v.preload = 'metadata';
          v.onloadedmetadata = () => place(v.videoWidth || 640, v.videoHeight || 360);
          v.onerror = () => place(640, 360);
          v.src = src;
        } else {
          const tmpImg = new Image();
          tmpImg.onload = () => place(tmpImg.naturalWidth, tmpImg.naturalHeight);
          tmpImg.src = src;
        }
      };
      reader.readAsDataURL(file);
    });
  }
  async function _processExternalUrl(html, textUrl, canvasPos) {
    let urlToLoad = null;

    if (html) {
      const match = html.match(/<img[^>]+src="?([^"\s>]+)"?/i);
      if (match && match[1]) urlToLoad = match[1].replace(/&amp;/g, '&');
    }

    if (!urlToLoad && textUrl && textUrl.match(/^https?:\/\//i)) {
      urlToLoad = textUrl;
    }

    if (!urlToLoad) {
      showToast('Could not extract image from dragged content', 'error');
      return;
    }

    showToast('Loading web image...', 'info');

    try {
      const res = await fetch(urlToLoad);
      if (!res.ok) throw new Error('Network error');
      const blob = await res.blob();
      const reader = new FileReader();
      reader.onload = evt => {
        const src = evt.target.result;
        const tmpImg = new Image();
        tmpImg.onload = () => {
          const { width, height } = getInitialImageSize(tmpImg.naturalWidth, tmpImg.naturalHeight);
          Board.addImage({ name: 'Web Image', kind: 'image', src, width, height, x: canvasPos.x - width / 2, y: canvasPos.y - height / 2 });
          showToast('Added web image!', 'success');
        };
        tmpImg.src = src;
      };
      reader.readAsDataURL(blob);
    } catch (err) {
      console.warn('Fetch failed, falling back to direct URL assignment', err);
      const tmpImg = new Image();
      tmpImg.crossOrigin = 'anonymous';
      tmpImg.onload = () => {
        const { width, height } = getInitialImageSize(tmpImg.naturalWidth, tmpImg.naturalHeight);
        Board.addImage({ name: 'Web Image', kind: 'image', src: urlToLoad, width, height, x: canvasPos.x - width / 2, y: canvasPos.y - height / 2 });
        showToast('Added web image! (Export might fail due to CORS)', 'success');
      };
      tmpImg.onerror = () => {
        showToast('Image load blocked by CORS / cross-origin rules', 'error');
      };
      tmpImg.src = urlToLoad;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // VIEWPORT INFO (for minimap / export)
  // ═══════════════════════════════════════════════════════════════════════════
  function getViewport() {
    return {
      offsetX, offsetY, scale,
      width: area ? area.clientWidth : window.innerWidth - 220,
      height: area ? area.clientHeight : window.innerHeight - 52
    };
  }

  function getImgEls() { return imgEls; }

  return {
    init, render,
    screenToCanvas, getViewportCenter,
    zoomIn, zoomOut, resetZoom, fitAll, navigateTo,
    selectItem, clearSelection, getSelected,
    startItemDrag, startResize,
    setSearchIds, setTagFilter,
    handleFileInput,
    setConnectMode, isConnectMode: () => connectMode,
    getViewport, getImgEls,
    get scale() { return scale; },
    get offsetX() { return offsetX; },
    get offsetY() { return offsetY; }
  };
})();
