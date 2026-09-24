const {
  SHADOW_PAD,
  WIDGET_MIN_WIDTH,
  WIDGET_MAX_WIDTH,
  LIST_MIN_HEIGHT,
  LIST_MAX_HEIGHT,
  DEFAULT_SIZE,
  clamp,
} = window.WidgetLayout;

document.documentElement.style.setProperty('--shadow-pad', `${SHADOW_PAD}px`);

const widgetEl = document.getElementById('widget');
const headerEl = document.getElementById('header');
const taskListEl = document.getElementById('task-list');
const inputEl = document.getElementById('task-input');
const collapseBtn = document.getElementById('collapse-btn');
const iconDown = document.getElementById('icon-chevron-down');
const iconUp = document.getElementById('icon-chevron-up');
const resizeHandle = document.getElementById('resize-handle');

// Reorder auto-scroll: distance from the list edge that starts scrolling, and max px per frame.
const AUTO_SCROLL_EDGE = 28;
const AUTO_SCROLL_MAX_STEP = 12;

let tasks = [];
let collapsed = false;
let size = { ...DEFAULT_SIZE };
let dragState = null;
let mouseEventsIgnored = false;
let lastPointerPosition = null;
let widgetRadius = null;
const activePointers = new Set();

// ── Mouse pass-through ────────────────────────────────────────────────────────

function getWidgetRadius() {
  // The corner radius is fixed in CSS; reading it on every mouse move would force a style recalc.
  if (widgetRadius === null) {
    widgetRadius = parseFloat(getComputedStyle(widgetEl).borderTopLeftRadius) || 0;
  }
  return widgetRadius;
}

function isPointInsideWidget(x, y) {
  const rect = widgetEl.getBoundingClientRect();
  return window.WidgetHitTest.isPointInsideRoundedRect(x, y, rect, getWidgetRadius());
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
  // pointermove and mousemove both fire for one movement; evaluate each position once.
  if (
    lastPointerPosition &&
    lastPointerPosition.x === event.clientX &&
    lastPointerPosition.y === event.clientY
  ) {
    return;
  }
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

// ── Helpers ───────────────────────────────────────────────────────────────────

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);
}

function autoGrow(textarea) {
  textarea.style.height = 'auto';
  // scrollHeight excludes the border but a border-box height includes it;
  // without it the text is 2px taller than the box and would overflow.
  const border = textarea.offsetHeight - textarea.clientHeight;
  textarea.style.height = textarea.scrollHeight + border + 'px';
}

// The header grows with the task input, which shrinks the room left for the list.
function growTaskInput() {
  autoGrow(inputEl);
  applySize();
}

// Enter submits, Shift+Enter inserts a newline, and an Enter that confirms an
// IME composition (e.g. committing pinyin as letters) does neither.
function isSubmitEnter(e) {
  return e.key === 'Enter' && !e.shiftKey && !e.isComposing && e.keyCode !== 229;
}

function newTaskId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function persist(partial) {
  window.widgetAPI.saveState(partial);
}

// ── Rendering ─────────────────────────────────────────────────────────────────

function createTaskTextEl(task) {
  const span = document.createElement('span');
  span.className = task.done ? 'task-text done' : 'task-text';
  span.textContent = task.text;
  return span;
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
      <button class="task-checkbox ${t.done ? 'done' : ''}" data-action="toggle" data-id="${escapeHtml(t.id)}" title="完成 / 取消完成" aria-label="完成 / 取消完成">
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
      </button>
      <span class="task-text ${t.done ? 'done' : ''}">${escapeHtml(t.text)}</span>
      <button class="task-delete" data-action="delete" data-id="${escapeHtml(t.id)}" title="删除" aria-label="删除">
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

// On a short screen, cap the list so the whole widget still fits the work area.
function availableListHeight() {
  const available = window.screen && window.screen.availHeight;
  if (!Number.isFinite(available)) return LIST_MAX_HEIGHT;
  const chrome = headerEl.offsetHeight + 2; // + the widget's top and bottom border
  return Math.max(LIST_MIN_HEIGHT, available - chrome);
}

function applySize() {
  widgetEl.style.width = size.width + 'px';
  taskListEl.style.maxHeight = Math.min(size.height, availableListHeight()) + 'px';
}

function reportWidgetSize() {
  const rect = widgetEl.getBoundingClientRect();
  window.widgetAPI.resizeContent(
    Math.round(rect.width) + SHADOW_PAD * 2,
    Math.round(rect.height) + SHADOW_PAD * 2
  );
}

// ── Pointer-based reorder ─────────────────────────────────────────────────────

function handleGripDown(e) {
  if (e.button !== 0) return;
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
    pointerId: e.pointerId,
    ghost,
    rows,
    rowRects,
    sourceIdx: idx,
    targetIdx: idx,
    offsetY: e.clientY - sourceRect.top,
    pointerY: e.clientY,
    // rowRects are measured at this scroll offset.
    startScrollTop: taskListEl.scrollTop,
    scrollFrame: 0,
  };

  document.addEventListener('pointermove', handleDragMove);
  document.addEventListener('pointerup', handleDragUp);
  document.addEventListener('pointercancel', handleDragUp);
}

function handleDragMove(e) {
  if (!dragState || e.pointerId !== dragState.pointerId) return;
  dragState.pointerY = e.clientY;
  updateDragTarget();
  if (!dragState.scrollFrame) autoScrollStep();
}

function updateDragTarget() {
  const { ghost, rows, rowRects, sourceIdx, offsetY, pointerY, startScrollTop } = dragState;
  const ghostTop = pointerY - offsetY;
  ghost.style.top = ghostTop + 'px';

  // Compare in the coordinate space rowRects were measured in, before any auto-scroll.
  const scrolled = taskListEl.scrollTop - startScrollTop;
  const ghostCenterY = ghostTop + scrolled + rowRects[sourceIdx].height / 2;
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

// Scrolls the list while the dragged row is held near its top or bottom edge,
// so rows outside the visible area can be reached.
function autoScrollStep() {
  if (!dragState) return;
  const { top, bottom } = taskListEl.getBoundingClientRect();
  const { pointerY } = dragState;
  let step = 0;
  if (pointerY < top + AUTO_SCROLL_EDGE) {
    step = -Math.min(AUTO_SCROLL_MAX_STEP, Math.ceil((top + AUTO_SCROLL_EDGE - pointerY) / 3));
  } else if (pointerY > bottom - AUTO_SCROLL_EDGE) {
    step = Math.min(AUTO_SCROLL_MAX_STEP, Math.ceil((pointerY - bottom + AUTO_SCROLL_EDGE) / 3));
  }

  const before = taskListEl.scrollTop;
  if (step) taskListEl.scrollTop = before + step;
  if (taskListEl.scrollTop === before) {
    dragState.scrollFrame = 0;
    return;
  }
  updateDragTarget();
  dragState.scrollFrame = requestAnimationFrame(autoScrollStep);
}

function handleDragUp(e) {
  if (!dragState || e.pointerId !== dragState.pointerId) return;
  const { ghost, rows, sourceIdx, targetIdx, scrollFrame } = dragState;

  if (scrollFrame) cancelAnimationFrame(scrollFrame);
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

  // Swap only this row's text back instead of re-rendering the list: a blur
  // caused by pressing another row's button must leave that button in the DOM,
  // or its click is lost.
  const finish = () => {
    if (textarea.isConnected) textarea.replaceWith(createTaskTextEl(task));
  };

  const commit = () => {
    if (settled) return;
    settled = true;
    const val = textarea.value.trim();
    if (val && val !== task.text) {
      task.text = val;
      persist({ tasks });
    }
    finish();
  };

  const cancel = () => {
    if (settled) return;
    settled = true;
    finish();
  };

  textarea.addEventListener('keydown', (e) => {
    if (isSubmitEnter(e)) {
      e.preventDefault();
      textarea.blur();
    } else if (e.key === 'Escape' && !e.isComposing) {
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

// Nothing on the widget accepts files; without this Chromium would open a
// dropped file in place of the widget (main also blocks the navigation).
document.addEventListener('dragover', (e) => {
  if (!e.dataTransfer || ![...e.dataTransfer.types].includes('Files')) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'none';
});
document.addEventListener('drop', (e) => {
  if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) e.preventDefault();
});

async function init() {
  const state = await window.widgetAPI.getState();
  tasks = Array.isArray(state.tasks) ? state.tasks : [];
  collapsed = !!state.collapsed;
  size = state.size || size;
  renderTasks();
  applyCollapsed();
  growTaskInput();
  // Figtree's metrics differ from the fallback font the first measurement used.
  document.fonts?.ready.then(growTaskInput);

  new ResizeObserver(reportWidgetSize).observe(widgetEl);
}

inputEl.addEventListener('keydown', (e) => {
  if (!isSubmitEnter(e)) return;
  e.preventDefault();
  const val = inputEl.value.trim();
  if (!val) return;
  tasks.push({ id: newTaskId(), text: val, done: false });
  inputEl.value = '';
  growTaskInput();
  renderTasks();
  persist({ tasks });
});

inputEl.addEventListener('input', growTaskInput);

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
  const id = btn.dataset.id;
  const action = btn.dataset.action;
  if (action === 'toggle') {
    tasks = tasks.map((t) => (String(t.id) === id ? { ...t, done: !t.done } : t));
  } else if (action === 'delete') {
    tasks = tasks.filter((t) => String(t.id) !== id);
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
    if (!active) return;
    active = false;
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
    if (latestPointerPosition) {
      window.widgetAPI.dragEnd();
      // The widget may now be on a display with a different height.
      applySize();
    }
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
  if (e.button !== 0) return;
  e.preventDefault();
  // Screen coordinates: main may move the window to keep it on-screen while it grows.
  const startX = e.screenX;
  const startY = e.screenY;
  const pointerId = e.pointerId;
  // Start from the list's rendered height: with few tasks it is shorter than
  // the stored max-height, and dragging up must respond right away.
  const origin = {
    width: size.width,
    height: Math.min(size.height, Math.round(taskListEl.getBoundingClientRect().height)),
  };
  let changed = false;

  const onMove = (ev) => {
    if (ev.pointerId !== pointerId) return;
    const width = Math.round(clamp(origin.width + (ev.screenX - startX), WIDGET_MIN_WIDTH, WIDGET_MAX_WIDTH));
    const height = Math.round(clamp(origin.height + (ev.screenY - startY), LIST_MIN_HEIGHT, LIST_MAX_HEIGHT));
    if (width === size.width && height === size.height) return;
    size = { width, height };
    changed = true;
    applySize();
  };
  const onUp = (ev) => {
    if (ev.pointerId !== pointerId) return;
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
    if (changed) persist({ size });
  };
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);
});

init();
