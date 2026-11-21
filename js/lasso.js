'use strict';

/**
 * GroupLasso — region-select tool for assigning multiple images to a series.
 *
 * Workflow:
 *  1. User clicks the Lasso (⌖) button next to a series in the sidebar.
 *  2. User draws a rectangle on the canvas.
 *  3. On mouseup, all intersecting images are assigned to that series.
 */
const GroupLasso = (() => {
  let overlay, selBox, msgEl, targetSeriesId = null;
  let selStart = null, selEnd = null;
  let active = false;

  function init() {
    overlay = document.getElementById('lasso-overlay');
    selBox = document.getElementById('lasso-selection');
    msgEl = document.getElementById('lasso-msg');

    document.getElementById('btn-lasso-cancel').addEventListener('click', cancel);

    overlay.addEventListener('mousedown', _onDown);
    overlay.addEventListener('mousemove', _onMove);
    overlay.addEventListener('mouseup', _onUp);
  }

  function start(seriesId, seriesName) {
    targetSeriesId = seriesId;
    active = true;
    selStart = selEnd = null;
    selBox.style.display = 'none';
    
    const hint = msgEl.querySelector('span:first-child');
    if (hint) hint.textContent = `🖱️ Draw a box to group images into "${seriesName}"`;
    
    overlay.classList.remove('hidden');
    document.body.style.cursor = 'crosshair';
  }

  function cancel() {
    active = false;
    overlay.classList.add('hidden');
    document.body.style.cursor = '';
    selStart = selEnd = null;
    targetSeriesId = null;
  }

  function _onDown(e) {
    if (!active) return;
    if (e.target.closest('#lasso-msg')) return; // ignore clicks on cancel button
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

  function _updateSelBox() {
    if (!selStart || !selEnd) return;
    const x = Math.min(selStart.x, selEnd.x);
    const y = Math.min(selStart.y, selEnd.y);
    const w = Math.abs(selEnd.x - selStart.x);
    const h = Math.abs(selEnd.y - selStart.y);
    Object.assign(selBox.style, { left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px' });
  }

  function _onUp(e) {
    if (!selStart || !selEnd) return;
    const w = Math.abs(selEnd.x - selStart.x);
    const h = Math.abs(selEnd.y - selStart.y);
    
    if (w < 10 || h < 10) {
      showToast('Selection too small', 'error');
      selStart = null;
      selBox.style.display = 'none';
      return;
    }

    const x1 = Math.min(selStart.x, selEnd.x);
    const y1 = Math.min(selStart.y, selEnd.y);
    const x2 = x1 + w;
    const y2 = y1 + h;

    // Convert screen coordinates to canvas coordinates
    const cp1 = Canvas.screenToCanvas(x1, y1);
    const cp2 = Canvas.screenToCanvas(x2, y2);
    
    const expX = cp1.x, expY = cp1.y;
    const expW = cp2.x - cp1.x, expH = cp2.y - cp1.y;

    const state = Board.getState();
    const intersectingIds = [];

    state.images.forEach(img => {
      if (_intersects(img.x, img.y, img.width, img.height, expX, expY, expW, expH)) {
        intersectingIds.push(img.id);
      }
    });

    if (intersectingIds.length > 0) {
      Board.assignSeriesToImages(intersectingIds, targetSeriesId);
      showToast(`Assigned ${intersectingIds.length} image(s) to series!`, 'success');
    } else {
      showToast('No images were inside the selection.', 'info');
    }

    cancel();
  }

  function _intersects(ax, ay, aw, ah, bx, by, bw, bh) {
    return !(bx > ax + aw || bx + bw < ax || by > ay + ah || by + bh < ay);
  }

  return { init, start, cancel };
})();
