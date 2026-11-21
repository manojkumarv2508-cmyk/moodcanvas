'use strict';

/**
 * Sidebar — manages the left panel: series list, tags cloud, stats,
 * "Add Series" modal, and "Image Details" modal.
 */
const Sidebar = (() => {
  let _selectedSeriesId = null;
  let _selectedTag = null;
  let _editingImageId = null;

  // ═══════════════════════════════════════════════════════════════════════════
  // INIT
  // ═══════════════════════════════════════════════════════════════════════════
  function init() {
    _initAddSeriesModal();
    _initImageDetailsModal();

    // "All" series filter reset
    document.getElementById('series-all-btn').addEventListener('click', () => {
      _selectedSeriesId = null;
      _selectedTag = null;
      Canvas.setSearchIds(null);
      Sidebar.render(Board.getState());
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════
  function render(state) {
    _renderSeriesList(state);
    _renderTagsCloud(state);
    _updateStats(state);
  }

  function _renderSeriesList(state) {
    const list = document.getElementById('series-list');
    if (!list) return;
    list.innerHTML = '';

    const allBtn = document.getElementById('series-all-btn');
    if (allBtn) allBtn.classList.toggle('active', !_selectedSeriesId);

    state.series.forEach(s => {
      const count = state.images.filter(i => i.seriesId === s.id).length;
      const li = document.createElement('li');
      li.className = 'series-item' + (_selectedSeriesId === s.id ? ' active' : '');
      li.innerHTML = `
        <span class="series-dot" style="background:${s.color}"></span>
        <span class="series-name">${_esc(s.name)}</span>
        <span class="series-count">${count}</span>
        <div class="series-actions">
          <button class="sact-btn" title="Group images (Lasso)" data-lasso="${s.id}">⌖</button>
          <button class="sact-btn" title="Delete series" data-del="${s.id}">✕</button>
        </div>
      `;
      li.addEventListener('click', e => {
        if (e.target.dataset.del || e.target.dataset.lasso) return;
        _selectedSeriesId = s.id;
        _selectedTag = null;
        const ids = state.images.filter(i => i.seriesId === s.id).map(i => i.id);
        Canvas.setSearchIds(ids.length ? ids : []);
        render(Board.getState());
      });
      li.querySelector('[data-lasso]').addEventListener('click', e => {
        e.stopPropagation();
        GroupLasso.start(s.id, s.name);
      });
      li.querySelector('[data-del]').addEventListener('click', e => {
        e.stopPropagation();
        if (confirm(`Delete series "${s.name}"?\nImages will NOT be deleted.`)) {
          if (_selectedSeriesId === s.id) { _selectedSeriesId = null; Canvas.setSearchIds(null); }
          Board.deleteSeries(s.id);
        }
      });
      list.appendChild(li);
    });
  }

  function _renderTagsCloud(state) {
    const cloud = document.getElementById('tags-cloud');
    if (!cloud) return;
    const tags = Board.getAllTags();
    const entries = Object.entries(tags).sort((a, b) => b[1] - a[1]);

    if (!entries.length) {
      cloud.innerHTML = '<span class="no-tags">No tags yet. Edit an image to add tags.</span>';
      return;
    }

    cloud.innerHTML = entries.map(([tag, count]) =>
      `<div class="tag-chip ${_selectedTag === tag ? 'active' : ''}" data-tag="${_esc(tag)}">#${_esc(tag)} <span class="tc">${count}</span></div>`
    ).join('');

    cloud.querySelectorAll('.tag-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const tag = chip.dataset.tag;
        if (_selectedTag === tag) {
          _selectedTag = null;
          Canvas.setSearchIds(null);
        } else {
          _selectedTag = tag;
          _selectedSeriesId = null;
          Canvas.setTagFilter(tag);
        }
        render(Board.getState());
      });
    });
  }

  function _updateStats(state) {
    const si = document.getElementById('stat-images');
    const ss = document.getElementById('stat-series');
    if (si) si.textContent = `${state.images.length} image${state.images.length !== 1 ? 's' : ''}`;
    if (ss) ss.textContent = `${state.series.length} series`;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ADD SERIES MODAL
  // ═══════════════════════════════════════════════════════════════════════════
  function _initAddSeriesModal() {
    const modal = document.getElementById('modal-series');
    const btnOpen = document.getElementById('btn-add-series');
    const btnCreate = document.getElementById('btn-series-create');
    const nameInput = document.getElementById('series-name-input');
    const grid = document.getElementById('color-picker-grid');
    let chosenColor = SERIES_COLORS[0];

    // Populate swatches
    SERIES_COLORS.forEach((color, i) => {
      const sw = document.createElement('div');
      sw.className = 'color-swatch' + (i === 0 ? ' selected' : '');
      sw.style.background = color;
      sw.dataset.color = color;
      sw.addEventListener('click', () => {
        grid.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
        sw.classList.add('selected');
        chosenColor = color;
      });
      grid.appendChild(sw);
    });

    btnOpen.addEventListener('click', () => {
      nameInput.value = '';
      chosenColor = SERIES_COLORS[0];
      grid.querySelectorAll('.color-swatch')[0].click();
      _showModal(modal);
      setTimeout(() => nameInput.focus(), 60);
    });

    btnCreate.addEventListener('click', () => {
      const name = nameInput.value.trim();
      if (!name) { nameInput.classList.add('shake'); setTimeout(() => nameInput.classList.remove('shake'), 400); nameInput.focus(); return; }
      Board.addSeries(name, chosenColor);
      _hideModal(modal);
      showToast(`Series "${name}" created!`, 'success');
    });

    nameInput.addEventListener('keydown', e => { if (e.key === 'Enter') btnCreate.click(); });
    _bindModalClose(modal);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // IMAGE DETAILS MODAL
  // ═══════════════════════════════════════════════════════════════════════════
  function openImageDetails(id) {
    _editingImageId = id;
    const img = Board.getImageById(id);
    if (!img) return;

    document.getElementById('image-name-input').value = img.name;
    document.getElementById('image-tags-input').value = (img.tags || []).join(', ');
    document.getElementById('image-note-input').value = img.note || '';

    // Populate series select
    const select = document.getElementById('image-series-select');
    select.innerHTML = '<option value="">— None —</option>';
    Board.getState().series.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = s.name;
      if (s.id === img.seriesId) opt.selected = true;
      select.appendChild(opt);
    });

    // Show preview thumb
    const preview = document.getElementById('image-details-preview');
    if (preview) preview.style.backgroundImage = `url('${img.src}')`;

    const modal = document.getElementById('modal-image-details');
    _showModal(modal);
    setTimeout(() => document.getElementById('image-name-input').focus(), 60);
  }

  function _initImageDetailsModal() {
    const modal = document.getElementById('modal-image-details');
    const btnSave = document.getElementById('btn-image-save');

    btnSave.addEventListener('click', () => {
      if (!_editingImageId) return;
      const name = document.getElementById('image-name-input').value.trim() || 'Untitled';
      const tagsRaw = document.getElementById('image-tags-input').value;
      const tags = tagsRaw.split(',').map(t => t.trim()).filter(Boolean);
      const seriesId = document.getElementById('image-series-select').value || null;
      const note = document.getElementById('image-note-input').value.trim();
      Board.updateImage(_editingImageId, { name, tags, seriesId, note });
      _hideModal(modal);
      _editingImageId = null;
      showToast('Image updated!', 'success');
    });

    document.getElementById('image-name-input').addEventListener('keydown', e => { if (e.key === 'Enter') btnSave.click(); });
    _bindModalClose(modal);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // MODAL HELPERS
  // ═══════════════════════════════════════════════════════════════════════════
  function _showModal(modal) { modal.classList.remove('hidden'); }
  function _hideModal(modal) { modal.classList.add('hidden'); }

  function _bindModalClose(modal) {
    modal.querySelectorAll('[data-close-modal]').forEach(btn => {
      btn.addEventListener('click', () => _hideModal(modal));
    });
    modal.addEventListener('click', e => { if (e.target === modal) _hideModal(modal); });
    modal.addEventListener('keydown', e => { if (e.key === 'Escape') _hideModal(modal); });
  }

  function _esc(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  return { init, render, openImageDetails };
})();
