'use strict';

// ─── UUID ────────────────────────────────────────────────────────────────────
function uuid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

// ─── Math helpers ────────────────────────────────────────────────────────────
function clamp(val, min, max) { return Math.max(min, Math.min(max, val)); }

function hexToRgba(hex, alpha = 1) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// ─── Toast notifications ─────────────────────────────────────────────────────
function showToast(msg, type = 'info', duration = 2500) {
  document.querySelectorAll('.toast').forEach(t => t.remove());
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = msg;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('visible'));
  const hide = () => {
    el.classList.remove('visible');
    setTimeout(() => el.remove(), 300);
  };
  const timer = setTimeout(hide, duration);
  el.addEventListener('click', () => { clearTimeout(timer); hide(); });
}

// ─── Image sizing helper ─────────────────────────────────────────────────────
// Constrains image to max initial canvas size while preserving aspect ratio
function getInitialImageSize(naturalW, naturalH) {
  const maxW = 280, maxH = 240;
  let w = naturalW, h = naturalH;
  if (w > maxW) { h = Math.round(h * maxW / w); w = maxW; }
  if (h > maxH) { w = Math.round(w * maxH / h); h = maxH; }
  return { width: Math.max(w, 40), height: Math.max(h, 40) };
}

// ─── Series color palette ────────────────────────────────────────────────────
const SERIES_COLORS = [
  '#FF6B6B', '#FF9F43', '#FECA57', '#48DBFB',
  '#1DD1A1', '#54A0FF', '#6C5CE7', '#FF9FF3',
  '#C44569', '#2ECC71', '#E17055', '#74B9FF',
  '#A29BFE', '#FD79A8', '#00CEC9', '#F8A5C2'
];

// ─── Note color palette ──────────────────────────────────────────────────────
const NOTE_COLORS = [
  { bg: '#FFFDE7', border: '#F9CA24', text: '#333' },  // Yellow
  { bg: '#E8F5E9', border: '#6AB04C', text: '#333' },  // Green
  { bg: '#E3F2FD', border: '#4DABF7', text: '#333' },  // Blue
  { bg: '#FCE4EC', border: '#F06292', text: '#333' },  // Pink
  { bg: '#EDE7F6', border: '#9C88FF', text: '#333' }   // Purple
];
