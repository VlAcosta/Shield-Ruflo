import React, {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import './DashboardGrid.scss';

const GRID_COLUMNS = 12;
const FLIP_DURATION = 430;
const AUTO_SCROLL_EDGE = 92;
const AUTO_SCROLL_STEP = 18;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function prefersReducedMotion() {
  return typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

function createDragPreview(title) {
  const preview = document.createElement('div');
  preview.className = 'dashboard-grid__drag-preview';

  const grip = document.createElement('span');
  grip.className = 'dashboard-grid__drag-preview-grip';
  grip.setAttribute('aria-hidden', 'true');
  for (let index = 0; index < 6; index += 1) {
    grip.appendChild(document.createElement('i'));
  }

  const copy = document.createElement('div');
  const heading = document.createElement('strong');
  const caption = document.createElement('span');
  heading.textContent = title;
  caption.textContent = 'Перемещение блока';
  copy.append(heading, caption);

  preview.append(grip, copy);
  document.body.appendChild(preview);
  return preview;
}

function ResizeIcon() {
  return (
    <svg viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="M6 14H14V6" stroke="currentColor" strokeWidth="1.45" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9 14L14 9" stroke="currentColor" strokeWidth="1.45" strokeLinecap="round" />
    </svg>
  );
}

function ArrowIcon({ direction }) {
  const rotate = direction === 'next' ? 180 : 0;

  return (
    <svg viewBox="0 0 18 18" fill="none" aria-hidden="true" style={{ transform: `rotate(${rotate}deg)` }}>
      <path d="M11 4.5L6.5 9L11 13.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function MoreIcon() {
  return (
    <svg viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <circle cx="4" cy="9" r="1.25" fill="currentColor" />
      <circle cx="9" cy="9" r="1.25" fill="currentColor" />
      <circle cx="14" cy="9" r="1.25" fill="currentColor" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="M13.7 6.2A5.4 5.4 0 1 0 14 11.4" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" />
      <path d="M13.7 6.2V3.5M13.7 6.2H11" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function DefaultSizeIcon() {
  return (
    <svg viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <rect x="3.25" y="4.25" width="11.5" height="9.5" rx="2" stroke="currentColor" strokeWidth="1.3" />
      <path d="M6 7H12M6 10H9.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

function HideIcon() {
  return (
    <svg viewBox="0 0 18 18" fill="none" aria-hidden="true">
      <path d="M3 3L15 15" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" />
      <path d="M7.1 4.1A8.8 8.8 0 0 1 9 3.9C12.5 3.9 14.7 6.4 15.5 8.2C15.7 8.7 15.7 9.3 15.5 9.8C15.2 10.5 14.7 11.3 13.9 12" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" />
      <path d="M11 11.2A3 3 0 0 1 6.8 7M4.2 5.6C3.4 6.4 2.8 7.3 2.5 8.2C2.3 8.7 2.3 9.3 2.5 9.8C3.3 11.6 5.5 14.1 9 14.1C9.7 14.1 10.4 14 11 13.8" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" />
    </svg>
  );
}

function DashboardGrid({
  items,
  editing = false,
  onReorder,
  onMove,
  onResize,
  onHide,
  onRefresh,
  onResetSize,
}) {
  const gridRef = useRef(null);
  const itemRefs = useRef(new Map());
  const flipRects = useRef(new Map());
  const flipAnimations = useRef(new Map());
  const lastSwapTarget = useRef(null);
  const activeDragId = useRef(null);
  const resizeCleanup = useRef(null);
  const resizeBadgeTimer = useRef(null);

  const [draggedId, setDraggedId] = useState(null);
  const [overId, setOverId] = useState(null);
  const [resizingId, setResizingId] = useState(null);
  const [resizePreview, setResizePreview] = useState(null);
  const [menuOpenId, setMenuOpenId] = useState(null);

  const setItemRef = useCallback((id, node) => {
    if (node) itemRefs.current.set(id, node);
    else itemRefs.current.delete(id);
  }, []);

  const snapshotRects = useCallback(() => {
    if (prefersReducedMotion()) return;

    const next = new Map();
    itemRefs.current.forEach((node, id) => {
      next.set(id, node.getBoundingClientRect());
    });
    flipRects.current = next;
  }, []);

  useLayoutEffect(() => {
    if (!flipRects.current.size || prefersReducedMotion()) {
      flipRects.current = new Map();
      return;
    }

    const previousRects = flipRects.current;
    flipRects.current = new Map();

    itemRefs.current.forEach((node, id) => {
      const previous = previousRects.get(id);
      if (!previous) return;

      const current = node.getBoundingClientRect();
      const deltaX = previous.left - current.left;
      const deltaY = previous.top - current.top;
      const scaleX = current.width ? previous.width / current.width : 1;
      const scaleY = current.height ? previous.height / current.height : 1;

      const moved = Math.abs(deltaX) > 1 || Math.abs(deltaY) > 1;
      const resized = Math.abs(scaleX - 1) > 0.01 || Math.abs(scaleY - 1) > 0.01;
      if (!moved && !resized) return;
      if (typeof node.animate !== 'function') return;

      flipAnimations.current.get(id)?.cancel();

      const animation = node.animate(
        [
          {
            transform: `translate3d(${deltaX}px, ${deltaY}px, 0) scale(${scaleX}, ${scaleY})`,
            transformOrigin: '0 0',
          },
          {
            transform: 'translate3d(0, 0, 0) scale(1, 1)',
            transformOrigin: '0 0',
          },
        ],
        {
          duration: FLIP_DURATION,
          easing: 'cubic-bezier(.16, 1, .3, 1)',
        }
      );

      flipAnimations.current.set(id, animation);
      animation.finished
        .catch(() => {})
        .finally(() => {
          if (flipAnimations.current.get(id) === animation) {
            flipAnimations.current.delete(id);
          }
        });
    });
  }, [items]);

  useEffect(() => () => {
    resizeCleanup.current?.();
    window.clearTimeout(resizeBadgeTimer.current);
    flipAnimations.current.forEach((animation) => animation.cancel());
    flipAnimations.current.clear();
  }, []);

  useEffect(() => {
    if (!menuOpenId) return undefined;

    const closeMenu = (event) => {
      const root = event.target.closest?.(`[data-widget-menu="${menuOpenId}"]`);
      if (!root) setMenuOpenId(null);
    };

    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setMenuOpenId(null);
    };

    document.addEventListener('pointerdown', closeMenu);
    window.addEventListener('keydown', closeOnEscape);

    return () => {
      document.removeEventListener('pointerdown', closeMenu);
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [menuOpenId]);

  useEffect(() => {
    if (editing) setMenuOpenId(null);
  }, [editing]);

  const autoScrollViewport = useCallback((clientY) => {
    if (!clientY || typeof window === 'undefined') return;

    if (clientY < AUTO_SCROLL_EDGE) {
      window.scrollBy({ top: -AUTO_SCROLL_STEP, behavior: 'auto' });
      return;
    }

    if (window.innerHeight - clientY < AUTO_SCROLL_EDGE) {
      window.scrollBy({ top: AUTO_SCROLL_STEP, behavior: 'auto' });
    }
  }, []);

  const handleDragStart = useCallback((event, widgetId, title) => {
    if (!editing || resizingId) {
      event.preventDefault();
      return;
    }

    activeDragId.current = widgetId;
    setDraggedId(widgetId);
    setOverId(null);
    lastSwapTarget.current = widgetId;

    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', widgetId);

    const preview = createDragPreview(title);
    event.dataTransfer.setDragImage(preview, 28, 22);
    window.setTimeout(() => preview.remove(), 0);
  }, [editing, resizingId]);

  const handleDragEnd = useCallback(() => {
    activeDragId.current = null;
    setDraggedId(null);
    setOverId(null);
    lastSwapTarget.current = null;
  }, []);

  const handleDragOver = useCallback((event, targetId) => {
    const sourceId = activeDragId.current;
    if (!editing || !sourceId || sourceId === targetId) return;

    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    autoScrollViewport(event.clientY);
    setOverId(targetId);

    if (lastSwapTarget.current === targetId) return;

    snapshotRects();
    onReorder(sourceId, targetId);
    lastSwapTarget.current = targetId;
  }, [autoScrollViewport, editing, onReorder, snapshotRects]);

  const handleDragLeave = useCallback((event, targetId) => {
    if (overId !== targetId) return;
    if (event.currentTarget.contains(event.relatedTarget)) return;
    setOverId(null);
  }, [overId]);

  const handleDrop = useCallback((event) => {
    if (!editing) return;
    event.preventDefault();
    setOverId(null);
  }, [editing]);

  const applyExactSpan = useCallback((widgetId, meta, nextSpan) => {
    const span = clamp(nextSpan, meta.minSpan, meta.maxSpan);
    snapshotRects();
    onResize(widgetId, span);
    setResizePreview({ id: widgetId, span });
  }, [onResize, snapshotRects]);

  const handleResizePointerDown = useCallback((event, widgetId, meta, currentSpan) => {
    if (!editing || event.button !== 0) return;

    event.preventDefault();
    event.stopPropagation();

    resizeCleanup.current?.();
    window.clearTimeout(resizeBadgeTimer.current);

    const grid = gridRef.current;
    if (!grid) return;

    const gridRect = grid.getBoundingClientRect();
    const styles = window.getComputedStyle(grid);
    const columnGap = Number.parseFloat(styles.columnGap) || 0;
    const columnWidth = (gridRect.width - columnGap * (GRID_COLUMNS - 1)) / GRID_COLUMNS;
    const columnStep = Math.max(1, columnWidth + columnGap);
    const startX = event.clientX;
    const pointerId = event.pointerId;
    let lastSpan = currentSpan;
    let finished = false;

    setResizingId(widgetId);
    setResizePreview({ id: widgetId, span: currentSpan });
    document.body.classList.add('dashboard-is-resizing');

    const onPointerMove = (moveEvent) => {
      if (moveEvent.pointerId !== pointerId) return;

      const delta = Math.round((moveEvent.clientX - startX) / columnStep);
      const nextSpan = clamp(currentSpan + delta, meta.minSpan, meta.maxSpan);
      if (nextSpan === lastSpan) return;

      lastSpan = nextSpan;
      applyExactSpan(widgetId, meta, nextSpan);
    };

    const finish = (finishEvent) => {
      if (finished) return;
      if (finishEvent?.pointerId != null && finishEvent.pointerId !== pointerId) return;
      finished = true;

      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerup', finish);
      document.removeEventListener('pointercancel', finish);
      document.body.classList.remove('dashboard-is-resizing');
      setResizingId(null);

      resizeBadgeTimer.current = window.setTimeout(() => {
        setResizePreview(null);
      }, 220);

      resizeCleanup.current = null;
    };

    resizeCleanup.current = finish;

    document.addEventListener('pointermove', onPointerMove);
    document.addEventListener('pointerup', finish);
    document.addEventListener('pointercancel', finish);
  }, [applyExactSpan, editing]);

  const handleResizeKeyDown = useCallback((event, widgetId, meta, currentSpan) => {
    if (!editing) return;

    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      applyExactSpan(widgetId, meta, currentSpan - 1);
    }

    if (event.key === 'ArrowRight') {
      event.preventDefault();
      applyExactSpan(widgetId, meta, currentSpan + 1);
    }
  }, [applyExactSpan, editing]);

  const handleDragHandleKeyDown = useCallback((event, widgetId) => {
    if (!editing || !event.altKey) return;

    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault();
      snapshotRects();
      onMove(widgetId, -1);
    }

    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault();
      snapshotRects();
      onMove(widgetId, 1);
    }
  }, [editing, onMove, snapshotRects]);

  const handleMoveClick = useCallback((widgetId, offset) => {
    snapshotRects();
    onMove(widgetId, offset);
  }, [onMove, snapshotRects]);

  const handleMenuAction = useCallback((action, widgetId) => {
    setMenuOpenId(null);
    action?.(widgetId);
  }, []);

  return (
    <div
      ref={gridRef}
      className={`dashboard-grid ${editing ? 'is-editing' : ''} ${draggedId ? 'has-active-drag' : ''}`}
    >
      {items.map(({ id, meta, config, content }) => {
        const isResizing = resizingId === id;
        const isDragging = draggedId === id;
        const isDropTarget = overId === id && draggedId !== id;
        const menuOpen = menuOpenId === id;
        const isDefaultSize = config.span === meta.defaultSpan;

        return (
          <div
            ref={(node) => setItemRef(id, node)}
            className={`dashboard-grid__item ${config.span >= 7 ? 'is-wide-mobile' : ''} ${isDragging ? 'is-dragging' : ''} ${isDropTarget ? 'is-drop-target' : ''} ${isResizing ? 'is-resizing' : ''} ${menuOpen ? 'has-open-menu' : ''}`}
            style={{ '--widget-span': config.span }}
            key={id}
            onDragOver={(event) => handleDragOver(event, id)}
            onDragLeave={(event) => handleDragLeave(event, id)}
            onDrop={handleDrop}
          >
            {!editing ? (
              <div className="dashboard-grid__widget-menu" data-widget-menu={id}>
                <button
                  className="dashboard-grid__menu-trigger"
                  type="button"
                  onClick={() => setMenuOpenId((current) => current === id ? null : id)}
                  aria-label={`Действия с блоком ${meta.title}`}
                  aria-expanded={menuOpen}
                  aria-haspopup="menu"
                  title="Действия с блоком"
                >
                  <MoreIcon />
                </button>

                {menuOpen ? (
                  <div className="dashboard-grid__menu-popover" role="menu" aria-label={`Действия с блоком ${meta.title}`}>
                    <div className="dashboard-grid__menu-head">
                      <strong>{meta.title}</strong>
                      <span>{config.span} / 12</span>
                    </div>

                    <button type="button" role="menuitem" onClick={() => handleMenuAction(onRefresh, id)}>
                      <RefreshIcon />
                      <span>Обновить данные</span>
                    </button>

                    <button
                      type="button"
                      role="menuitem"
                      disabled={isDefaultSize}
                      onClick={() => handleMenuAction(onResetSize, id)}
                    >
                      <DefaultSizeIcon />
                      <span>{isDefaultSize ? 'Стандартный размер' : 'Вернуть размер'}</span>
                    </button>

                    <div className="dashboard-grid__menu-divider" />

                    <button
                      className="is-danger"
                      type="button"
                      role="menuitem"
                      onClick={() => handleMenuAction(onHide, id)}
                    >
                      <HideIcon />
                      <span>Скрыть блок</span>
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}

            {editing ? (
              <>
                <div className="dashboard-grid__editbar" aria-label={`Настройка блока ${meta.title}`}>
                  <button
                    className="dashboard-grid__drag"
                    type="button"
                    draggable={!isResizing}
                    onDragStart={(event) => handleDragStart(event, id, meta.title)}
                    onDragEnd={handleDragEnd}
                    onKeyDown={(event) => handleDragHandleKeyDown(event, id)}
                    title="Перетащить блок. Alt + стрелки — точное перемещение"
                    aria-label={`Перетащить блок ${meta.title}`}
                  >
                    <i /><i /><i /><i /><i /><i />
                  </button>

                  <span className="dashboard-grid__edit-title">{meta.title}</span>

                  <div className="dashboard-grid__mobile-move" aria-label={`Изменить позицию блока ${meta.title}`}>
                    <button type="button" onClick={() => handleMoveClick(id, -1)} aria-label="Переместить выше">
                      <ArrowIcon direction="previous" />
                    </button>
                    <button type="button" onClick={() => handleMoveClick(id, 1)} aria-label="Переместить ниже">
                      <ArrowIcon direction="next" />
                    </button>
                  </div>

                  <span className="dashboard-grid__span-value">{config.span}/12</span>

                  <button
                    className="dashboard-grid__hide"
                    type="button"
                    onClick={() => onHide(id)}
                    aria-label={`Скрыть блок ${meta.title}`}
                    title="Скрыть блок"
                  >
                    ×
                  </button>
                </div>

                <button
                  className="dashboard-grid__resize-handle"
                  type="button"
                  onPointerDown={(event) => handleResizePointerDown(event, id, meta, config.span)}
                  onKeyDown={(event) => handleResizeKeyDown(event, id, meta, config.span)}
                  disabled={meta.minSpan === meta.maxSpan}
                  aria-label={`Изменить ширину блока ${meta.title}. Сейчас ${config.span} из 12`}
                  title="Потяните, чтобы изменить ширину. Стрелки ← → для точной настройки"
                >
                  <ResizeIcon />
                </button>

                {resizePreview?.id === id ? (
                  <span className={`dashboard-grid__resize-badge ${isResizing ? 'is-visible' : ''}`}>
                    {resizePreview.span} / 12
                  </span>
                ) : null}
              </>
            ) : null}

            <div className="dashboard-grid__content">{content}</div>
          </div>
        );
      })}
    </div>
  );
}

export default memo(DashboardGrid);
