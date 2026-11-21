'use strict';

/**
 * Storage — save/load the full board to a .moodcanvas (JSON) file.
 * Includes keyboard shortcut Ctrl+S → save.
 */
const Storage = (() => {
  function save() {
    try {
      const data = Board.serialize();
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      a.download = `moodcanvas-${ts}.moodcanvas`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast('Board saved! 💾', 'success');
    } catch (e) {
      showToast('Save failed: ' + e.message, 'error');
    }
  }

  function load(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = evt => {
      const ok = Board.deserialize(evt.target.result);
      if (ok) {
        Canvas.clearSelection();
        setTimeout(() => Canvas.fitAll(), 100);
        showToast('Board loaded! 🎨', 'success');
      } else {
        showToast('Failed to load — file may be corrupted', 'error');
      }
    };
    reader.onerror = () => showToast('Could not read file', 'error');
    reader.readAsText(file);
  }

  return { save, load };
})();

// ─── Context menu ─────────────────────────────────────────────────────────────
/**
 * ContextMenu — right-click context menu for canvas items and background.
 */
const ContextMenu = (() => {
  let menu;

  function init() {
    menu = document.getElementById('context-menu');
    // Close on any click outside
    document.addEventListener('click', hide, true);
    document.addEventListener('contextmenu', hide, true);
  }

  function show(cfg) {
    hide(); // close any existing

    const { type, id, x, y } = cfg;
    menu.innerHTML = '';
    const items = _buildItems(type, id);
    items.forEach(item => {
      if (item === null) {
        const sep = document.createElement('div');
        sep.className = 'ctx-sep';
        menu.appendChild(sep);
        return;
      }
      const el = document.createElement('div');
      el.className = 'ctx-item' + (item.danger ? ' danger' : '') + (item.disabled ? ' disabled' : '');
      el.innerHTML = `<span class="ctx-icon">${item.icon || ''}</span><span>${item.label}</span>`;
      if (!item.disabled) el.addEventListener('click', e => { e.stopPropagation(); item.action(); hide(); });
      menu.appendChild(el);
    });

    menu.classList.remove('hidden');
    // Position safely within viewport
    const mW = menu.offsetWidth, mH = menu.offsetHeight;
    const margin = 8;
    menu.style.left = Math.min(x, window.innerWidth - mW - margin) + 'px';
    menu.style.top = Math.min(y, window.innerHeight - mH - margin) + 'px';
  }

  function _buildItems(type, id) {
    if (type === 'image') {
      const img = Board.getImageById(id);
      if (!img) return [];
      return [
        { icon: '✏️', label: 'Edit Details', action: () => Sidebar.openImageDetails(id) },
        null,
        { icon: '📌', label: 'Assign to Series →', action: () => _showSeriesSubmenu(id) },
        { icon: img.locked ? '🔓' : '🔒', label: img.locked ? 'Unlock' : 'Lock position', action: () => Board.updateImage(id, { locked: !img.locked }) },
        { icon: '⬆️', label: 'Bring to Front', action: () => Board.bringToFront(id) },
        null,
        { icon: '🗑️', label: 'Delete Image', danger: true, action: () => { Board.deleteImage(id); Canvas.clearSelection(); } }
      ];
    }
    if (type === 'note') {
      return [
        { icon: '🗑️', label: 'Delete Note', danger: true, action: () => { Board.deleteNote(id); Canvas.clearSelection(); } }
      ];
    }
    if (type === 'canvas') {
      return [
        { icon: '🎯', label: 'Fit All to Screen', action: () => Canvas.fitAll() },
        { icon: '🔍', label: 'Reset Zoom (100%)', action: () => Canvas.resetZoom() }
      ];
    }
    return [];
  }

  function _showSeriesSubmenu(imageId) {
    const state = Board.getState();
    const img = Board.getImageById(imageId);
    menu.innerHTML = '';

    // Back arrow
    const back = document.createElement('div');
    back.className = 'ctx-item ctx-back';
    back.innerHTML = `<span class="ctx-icon">←</span><span>Back</span>`;
    back.addEventListener('click', e => { e.stopPropagation(); show({ type: 'image', id: imageId, x: parseInt(menu.style.left), y: parseInt(menu.style.top) }); });
    menu.appendChild(back);

    const sep = document.createElement('div');
    sep.className = 'ctx-sep';
    menu.appendChild(sep);

    // None option
    const noneEl = document.createElement('div');
    noneEl.className = 'ctx-item' + (!img.seriesId ? ' ctx-checked' : '');
    noneEl.innerHTML = `<span class="ctx-icon">${!img.seriesId ? '✓' : ''}</span><span>— None —</span>`;
    noneEl.addEventListener('click', e => { e.stopPropagation(); Board.updateImage(imageId, { seriesId: null }); hide(); });
    menu.appendChild(noneEl);

    state.series.forEach(s => {
      const el = document.createElement('div');
      el.className = 'ctx-item' + (img.seriesId === s.id ? ' ctx-checked' : '');
      el.innerHTML = `<span class="ctx-icon" style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${s.color};margin-right:4px"></span><span>${s.name}</span>`;
      el.addEventListener('click', e => { e.stopPropagation(); Board.updateImage(imageId, { seriesId: s.id }); hide(); });
      menu.appendChild(el);
    });

    const sep2 = document.createElement('div');
    sep2.className = 'ctx-sep';
    menu.appendChild(sep2);

    const newSer = document.createElement('div');
    newSer.className = 'ctx-item';
    newSer.innerHTML = `<span class="ctx-icon">＋</span><span>Create New Series</span>`;
    newSer.addEventListener('click', e => { e.stopPropagation(); hide(); document.getElementById('btn-add-series').click(); });
    menu.appendChild(newSer);
  }

  function hide() {
    if (menu) menu.classList.add('hidden');
  }

  return { init, show, hide };
})();
