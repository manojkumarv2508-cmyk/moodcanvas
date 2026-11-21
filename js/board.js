'use strict';

/**
 * Board — immutable-style state manager for the entire canvas.
 * All state changes emit an 'onChange' event for subscribers.
 */
const Board = (() => {
  let _state = {
    version: 1,
    images: [],   // Array<ImageItem>
    notes: [],    // Array<NoteItem>
    series: [],   // Array<Series>
    connections: [] // Array<{id, from, to}>
  };

  const _listeners = [];
  function _notify() { _listeners.forEach(fn => fn(_state)); }
  function onChange(fn) { _listeners.push(fn); }
  function getState() { return _state; }

  // ─── Z-index helper ────────────────────────────────────────────────────────
  function _nextZ() {
    const all = [..._state.images, ..._state.notes];
    return all.length === 0 ? 1 : Math.max(...all.map(i => i.zIndex || 0)) + 1;
  }

  // ─── Series ────────────────────────────────────────────────────────────────
  function addSeries(name, color) {
    const s = { id: uuid(), name, color };
    _state = { ..._state, series: [..._state.series, s] };
    _notify();
    return s;
  }

  function updateSeries(id, updates) {
    _state = { ..._state, series: _state.series.map(s => s.id === id ? { ...s, ...updates } : s) };
    _notify();
  }

  function deleteSeries(id) {
    _state = {
      ..._state,
      series: _state.series.filter(s => s.id !== id),
      images: _state.images.map(img => img.seriesId === id ? { ...img, seriesId: null } : img)
    };
    _notify();
  }

  function getSeriesById(id) { return _state.series.find(s => s.id === id); }

  // ─── Images ────────────────────────────────────────────────────────────────
  function addImage(data) {
    const img = {
      id: uuid(),
      name: data.name || 'Untitled',
      src: data.src,
      kind: data.kind || 'image',
      x: data.x || 0,
      y: data.y || 0,
      width: data.width || 200,
      height: data.height || 150,
      seriesId: data.seriesId || null,
      tags: data.tags || [],
      note: data.note || '',
      locked: false,
      zIndex: _nextZ(),
      createdAt: Date.now()
    };
    _state = { ..._state, images: [..._state.images, img] };
    _notify();
    return img;
  }

  function updateImage(id, updates) {
    _state = { ..._state, images: _state.images.map(img => img.id === id ? { ...img, ...updates } : img) };
    _notify();
  }

  function deleteImage(id) {
    _state = { ..._state, images: _state.images.filter(img => img.id !== id), connections: _state.connections.filter(c => c.from !== id && c.to !== id) };
    _notify();
  }

  function getImageById(id) { return _state.images.find(img => img.id === id); }

  function bringToFront(id) {
    const z = _nextZ();
    if (_state.images.some(i => i.id === id)) updateImage(id, { zIndex: z });
    else updateNote(id, { zIndex: z });
  }

  function assignSeriesToImages(imageIds, seriesId) {
    const idSet = new Set(imageIds);
    _state = {
      ..._state,
      images: _state.images.map(img => idSet.has(img.id) ? { ...img, seriesId } : img)
    };
    _notify();
  }

  // ─── Notes ─────────────────────────────────────────────────────────────────
  function addNote(data) {
    const note = {
      id: uuid(),
      text: data.text || '',
      x: data.x || 0,
      y: data.y || 0,
      width: data.width || 200,
      height: data.height || 140,
      colorIndex: data.colorIndex !== undefined ? data.colorIndex : 0,
      zIndex: _nextZ(),
      createdAt: Date.now()
    };
    _state = { ..._state, notes: [..._state.notes, note] };
    _notify();
    return note;
  }

  function updateNote(id, updates) {
    _state = { ..._state, notes: _state.notes.map(n => n.id === id ? { ...n, ...updates } : n) };
    _notify();
  }

  function deleteNote(id) {
    _state = { ..._state, notes: _state.notes.filter(n => n.id !== id), connections: _state.connections.filter(c => c.from !== id && c.to !== id) };
    _notify();
  }

  function getNoteById(id) { return _state.notes.find(n => n.id === id); }

  // ─── Connections ───────────────────────────────────────────────────────────
  function addConnection(from, to) {
    if (from === to) return null;
    if (_state.connections.some(c => (c.from === from && c.to === to) || (c.from === to && c.to === from))) return null;
    const c = { id: uuid(), from, to };
    _state = { ..._state, connections: [..._state.connections, c] };
    _notify();
    return c;
  }

  function deleteConnection(id) {
    _state = { ..._state, connections: _state.connections.filter(c => c.id !== id) };
    _notify();
  }

  // ─── Query helpers ──────────────────────────────────────────────────────────
  function getAllTags() {
    const counts = {};
    _state.images.forEach(img => {
      (img.tags || []).forEach(tag => { if (tag) counts[tag] = (counts[tag] || 0) + 1; });
    });
    return counts;
  }

  /**
   * Returns array of matching image IDs, or null if no query.
   */
  function search(query) {
    if (!query || !query.trim()) return null;
    const q = query.trim().toLowerCase();
    return _state.images
      .filter(img => img.name.toLowerCase().includes(q) || (img.tags || []).some(t => t.toLowerCase().includes(q)))
      .map(img => img.id);
  }

  /**
   * Returns the bounding box of all canvas items (with padding).
   */
  function getCanvasBounds() {
    const all = [
      ..._state.images.map(i => ({ x: i.x, y: i.y, r: i.x + i.width, b: i.y + i.height })),
      ..._state.notes.map(n => ({ x: n.x, y: n.y, r: n.x + n.width, b: n.y + n.height }))
    ];
    if (all.length === 0) return { x: -500, y: -400, w: 1000, h: 800 };
    const pad = 120;
    const x1 = Math.min(...all.map(i => i.x)) - pad;
    const y1 = Math.min(...all.map(i => i.y)) - pad;
    const x2 = Math.max(...all.map(i => i.r)) + pad;
    const y2 = Math.max(...all.map(i => i.b)) + pad;
    return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
  }

  // ─── Persistence ────────────────────────────────────────────────────────────
  function serialize() { return JSON.stringify(_state); }

  function deserialize(json) {
    try {
      const parsed = JSON.parse(json);
      _state = { version: 1, images: [], notes: [], series: [], connections: [], ...parsed };
      _notify();
      return true;
    } catch (e) {
      console.error('Board.deserialize error:', e);
      return false;
    }
  }

  function reset() {
    _state = { version: 1, images: [], notes: [], series: [], connections: [] };
    _notify();
  }

  return {
    onChange, getState,
    addSeries, updateSeries, deleteSeries, getSeriesById,
    addImage, updateImage, deleteImage, getImageById, bringToFront, assignSeriesToImages,
    addNote, updateNote, deleteNote, getNoteById,
    addConnection, deleteConnection,
    getAllTags, search, getCanvasBounds,
    serialize, deserialize, reset
  };
})();
