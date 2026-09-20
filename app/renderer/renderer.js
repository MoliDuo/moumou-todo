const SHADOW_PAD = 32; // must match SHADOW_PAD in main.js

const widgetEl = document.getElementById('widget');
const headerEl = document.getElementById('header');
const taskListEl = document.getElementById('task-list');
const inputEl = document.getElementById('task-input');
const collapseBtn = document.getElementById('collapse-btn');
const iconDown = document.getElementById('icon-chevron-down');
const iconUp = document.getElementById('icon-chevron-up');
const resizeHandle = document.getElementById('resize-handle');

let tasks = [];
let collapsed = false;
let size = { width: 320, height: 360 };
let dragState = null;
let mouseEventsIgnored = false;
let lastPointerPosition = null;
const activePointers = new Set();

function isPointInsideWidget(x, y) {
  const rect = widgetEl.getBoundingClientRect();
  const radius = Math.min(
    parseFloat(getComputedStyle(widgetEl).borderTopLeftRadius) || 0,
    rect.width / 2,
    rect.height / 2
  );
  return window.WidgetHitTest.isPointInsideRoundedRect(x, y, rect, radius);
}

function setMouseEventsIgnored(ignore) {
  if (mouseEventsIgnored === ignore) return;
  mouseEventsIgnored = ignore;
  window.widgetAPI.setIgnoreMouseEvents(ignore);
}

function updateMousePassThrough(position = lastPointerPosition) {
  if (!position || activePointers.size > 0) {
    setMouseEventsIgnored(false);
    return;
  }
  setMouseEventsIgnored(!isPointInsideWidget(position.x, position.y));
}

function trackMousePosition(event) {
  lastPointerPosition = { x: event.clientX, y: event.clientY };
  updateMousePassThrough();
}

document.addEventListener('pointermove', trackMousePosition, true);
// Electron forwards mouse movement while click-through is enabled. Listen for
// mousemove too: recovery must not depend on receiving a PointerEvent.
document.addEventListener('mousemove', trackMousePosition, true);

function resetMousePassThrough() {
  activePointers.clear();
  lastPointerPosition = null;
  setMouseEventsIgnored(false);
}

window.addEventListener('blur', resetMousePassThrough);
window.addEventListener('focus', resetMousePassThrough);

document.addEventListener('pointerdown', (event) => {
  lastPointerPosition = { x: event.clientX, y: event.clientY };
  if (isPointInsideWidget(event.clientX, event.clientY)) {
    activePointers.add(event.pointerId);
    setMouseEventsIgnored(false);
  }
}, true);

function finishPointerInteraction(event) {
  lastPointerPosition = { x: event.clientX, y: event.clientY };
  activePointers.delete(event.pointerId);
  queueMicrotask(() => updateMousePassThrough());
}

window.addEventListener('pointerup', finishPointerInteraction);
window.addEventListener('pointercancel', finishPointerInteraction);

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function autoGrow(textarea) {
  textarea.style.height = 'auto';
  textarea.style.height = textarea.scrollHeight + 'px';
}

function renderTasks() {
  if (tasks.length === 0) {
    taskListEl.innerHTML = '<div class="empty-hint">还没有任务，输入后按 Enter 添加</div>';
    return;
  }
  taskListEl.innerHTML = tasks
    .map(
      (t, idx) => `
    <div class="task-row" data-index="${idx}">
      <div class="task-grip" data-drag="${idx}" title="拖动调整顺序">
        <svg width="10" height="14" viewBox="0 0 10 14"><circle cx="2.5" cy="2" r="1.2" fill="currentColor"></circle><circle cx="7.5" cy="2" r="1.2" fill="currentColor"></circle><circle cx="2.5" cy="7" r="1.2" fill="currentColor"></circle><circle cx="7.5" cy="7" r="1.2" fill="currentColor"></circle><circle cx="2.5" cy="12" r="1.2" fill="currentColor"></circle><circle cx="7.5" cy="12" r="1.2" fill="currentColor"></circle></svg>
      </div>
      <button class="task-checkbox ${t.done ? 'done' : ''}" data-action="toggle" data-id="${t.id}" title="完成 / 取消完成">
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
      </button>
      <span class="task-text ${t.done ? 'done' : ''}">${escapeHtml(t.text)}</span>
      <button class="task-delete" data-action="delete" data-id="${t.id}" title="删除">
        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.75" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
      </button>
    </div>`
    )
    .join('');

  taskListEl.querySelectorAll('[data-drag]').forEach((grip) => {
    grip.addEventListener('pointerdown', handleGripDown);
  });
}

function applyCollapsed() {
  document.body.classList.toggle('collapsed', collapsed);
  iconDown.style.display = collapsed ? 'block' : 'none';
  iconUp.style.display = collapsed ? 'none' : 'block';
}

function applySize() {
  widgetEl.style.width = size.width + 'px';
  taskListEl.style.maxHeight = size.height + 'px';
}

function persist(partial) {
  window.widgetAPI.saveState(partial);
}

// ── Pointer-based drag ────────────────────────────────────────────────────────

function handleGripDown(e) {
  e.preventDefault();
  e.stopPropagation();

  const idx = Number(e.currentTarget.dataset.drag);
  const rows = [...taskListEl.querySelectorAll('.task-row')];
  const rowRects = rows.map((r) => r.getBoundingClientRect());
  const sourceRect = rowRects[idx];

  const ghost = rows[idx].cloneNode(true);
  ghost.style.cssText = [
    'position:fixed',
    `width:${sourceRect.width}px`,
    `top:${sourceRect.top}px`,
    `left:${sourceRect.left}px`,
    'pointer-events:none',
    'z-index:9999',
    'opacity:0.92',
    'transform:scale(1.03) rotate(0.4deg)',
    'box-shadow:0 8px 28px rgba(0,0,0,0.18)',
    'background:#fff',
    'border-radius:16px',
    'transition:transform 80ms ease,box-shadow 80ms ease',
  ].join(';');
  document.body.appendChild(ghost);

  rows[idx].classList.add('dragging');

  dragState = {
    ghost,
    rows,
    rowRects,
    sourceIdx: idx,
    targetIdx: idx,
    offsetY: e.clientY - sourceRect.top,
  };

  document.addEventListener('pointermove', handleDragMove);
  document.addEventListener('pointerup', handleDragUp);
  document.addEventListener('pointercancel', handleDragUp);
}

function handleDragMove(e) {
  if (!dragState) return;
  const { ghost, rows, rowRects, sourceIdx, offsetY } = dragState;

  ghost.style.top = e.clientY - offsetY + 'px';

  const ghostCenterY = e.clientY - offsetY + rowRects[sourceIdx].height / 2;
  let newTarget = 0;
  for (let i = 0; i < rowRects.length; i++) {
    if (ghostCenterY > rowRects[i].top + rowRects[i].height / 2) newTarget = i;
  }

  if (newTarget === dragState.targetIdx) return;
  dragState.targetIdx = newTarget;

  const h = rowRects[sourceIdx].height + 2;
  rows.forEach((r, i) => {
    if (i === sourceIdx) return;
    let shift = 0;
    if (sourceIdx < newTarget && i > sourceIdx && i <= newTarget) shift = -h;
    if (sourceIdx > newTarget && i >= newTarget && i < sourceIdx) shift = h;
    r.style.transform = `translateY(${shift}px)`;
  });
}

function handleDragUp() {
  if (!dragState) return;
  const { ghost, rows, sourceIdx, targetIdx } = dragState;

  ghost.remove();
  rows.forEach((r) => {
    r.style.transform = '';
    r.classList.remove('dragging');
  });
  dragState = null;

  document.removeEventListener('pointermove', handleDragMove);
  document.removeEventListener('pointerup', handleDragUp);
  document.removeEventListener('pointercancel', handleDragUp);

  if (sourceIdx !== targetIdx) {
    const moved = tasks.splice(sourceIdx, 1)[0];
    tasks.splice(targetIdx, 0, moved);
    persist({ tasks });
  }
  renderTasks();
}

// ── Inline task editing ───────────────────────────────────────────────────────

function startEditingTask(span) {
  const row = span.closest('.task-row');
  const idx = Number(row.dataset.index);
  const task = tasks[idx];
  if (!task) return;

  const textarea = document.createElement('textarea');
  textarea.className = 'task-edit-input';
  textarea.rows = 1;
  textarea.value = task.text;

  let settled = false;

  const commit = () => {
    if (settled) return;
    settled = true;
    const val = textarea.value.trim();
    if (val && val !== task.text) {
      task.text = val;
      persist({ tasks });
    }
    renderTasks();
  };

  const cancel = () => {
    if (settled) return;
    settled = true;
    renderTasks();
  };

  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      textarea.blur();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancel();
    }
  });
  textarea.addEventListener('input', () => autoGrow(textarea));
  textarea.addEventListener('blur', commit);

  span.replaceWith(textarea);
  autoGrow(textarea);
  textarea.focus();
  textarea.setSelectionRange(textarea.value.length, textarea.value.length);
}

// ── Init & event listeners ────────────────────────────────────────────────────

document.addEventListener('contextmenu', (e) => e.preventDefault());

async function init() {
  const state = await window.widgetAPI.getState();
  tasks = state.tasks || [];
  collapsed = !!state.collapsed;
  size = state.size || size;
  renderTasks();
  applyCollapsed();
  applySize();
  autoGrow(inputEl);

  const ro = new ResizeObserver((entries) => {
    for (const _entry of entries) {
      const rect = widgetEl.getBoundingClientRect();
      const w = Math.round(rect.width) + SHADOW_PAD * 2;
      const h = Math.round(rect.height) + SHADOW_PAD * 2;
      window.widgetAPI.resizeContent(w, h);
    }
  });
  ro.observe(widgetEl);
}

inputEl.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' || e.shiftKey) return;
  e.preventDefault();
  const val = inputEl.value.trim();
  if (!val) return;
  tasks.push({ id: Date.now() + Math.random(), text: val, done: false });
  inputEl.value = '';
  autoGrow(inputEl);
  renderTasks();
  persist({ tasks });
});

inputEl.addEventListener('input', () => autoGrow(inputEl));

collapseBtn.addEventListener('click', () => {
  collapsed = !collapsed;
  applyCollapsed();
  persist({ collapsed });
});

taskListEl.addEventListener('click', (e) => {
  const text = e.target.closest('.task-text');
  if (text) {
    startEditingTask(text);
    return;
  }

  const btn = e.target.closest('button[data-action]');
  if (!btn) return;
  const id = Number(btn.dataset.id) || btn.dataset.id;
  const action = btn.dataset.action;
  if (action === 'toggle') {
    tasks = tasks.map((t) => (String(t.id) === String(id) ? { ...t, done: !t.done } : t));
  } else if (action === 'delete') {
    tasks = tasks.filter((t) => String(t.id) !== String(id));
  }
  renderTasks();
  persist({ tasks });
});

// ── Window drag (header) ──────────────────────────────────────────────────────
// Driven from JS rather than -webkit-app-region so the very first click always
// moves the window, even when it wasn't already the focused window.

headerEl.addEventListener('pointerdown', async (e) => {
  if (e.button !== 0) return;
  if (e.target.closest('#task-input, #collapse-btn')) return;
  e.preventDefault();

  const startX = e.screenX;
  const startY = e.screenY;
  if (!Number.isFinite(startX) || !Number.isFinite(startY)) return;

  const pointerId = e.pointerId;
  let active = true;
  let origin = null;
  let latestPointerPosition = null;

  const onMove = (ev) => {
    if (ev.pointerId !== pointerId) return;
    if ((ev.buttons & 1) === 0) {
      onUp(ev);
      return;
    }

    if (!Number.isFinite(ev.screenX) || !Number.isFinite(ev.screenY)) return;
    latestPointerPosition = { x: ev.screenX, y: ev.screenY };
    if (!origin) return;

    window.widgetAPI.setPosition(
      origin.x + (ev.screenX - startX),
      origin.y + (ev.screenY - startY)
    );
  };
  const onUp = (ev) => {
    if (ev && ev.pointerId !== pointerId) return;
    active = false;
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
  };
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);

  try {
    const [winX, winY] = await window.widgetAPI.getPosition();
    if (!active) return;
    if (!Number.isFinite(winX) || !Number.isFinite(winY)) {
      onUp();
      return;
    }

    origin = { x: winX, y: winY };
    if (latestPointerPosition) {
      window.widgetAPI.setPosition(
        origin.x + (latestPointerPosition.x - startX),
        origin.y + (latestPointerPosition.y - startY)
      );
    }
  } catch {
    onUp();
  }
});

resizeHandle.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  const startX = e.clientX;
  const startY = e.clientY;
  const origin = { ...size };

  const onMove = (ev) => {
    const width = Math.min(480, Math.max(260, origin.width + (ev.clientX - startX)));
    const height = Math.min(600, Math.max(120, origin.height + (ev.clientY - startY)));
    size = { width, height };
    applySize();
  };
  const onUp = () => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
    persist({ size });
  };
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
});

init();
