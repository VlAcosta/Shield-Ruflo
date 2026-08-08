import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import DashboardGrid from '../DashboardGrid';
import useDashboardLayout from '../hooks/useDashboardLayout';
import { DASHBOARD_DENSITIES, WIDGET_REGISTRY } from '../model/widgetRegistry';
import './DashboardWorkspace.scss';
import useAccessControl from '../../access/hooks/useAccessControl';
import useDashboardData from '../hooks/useDashboardData';

const TOAST_LIFETIME = 2200;

function TuneIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 7H13M17 7H20M4 17H8M12 17H20M13 4V10M8 14V20" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function ResetIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6.6 7.2A7 7 0 1 1 5 14M6.6 7.2V3.8M6.6 7.2H10" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function RetryIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M18.5 8A7 7 0 1 0 19 15M18.5 8V4.5M18.5 8H15" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function WorkspaceSkeleton() {
  return (
    <section className="dashboard-workspace dashboard-workspace--loading" aria-label="Загрузка доски" aria-busy="true">
      <div className="dashboard-workspace__toolbar dashboard-workspace__toolbar--skeleton">
        <div>
          <span className="dashboard-workspace__skeleton-line is-small" />
          <span className="dashboard-workspace__skeleton-line is-title" />
          <span className="dashboard-workspace__skeleton-line is-copy" />
        </div>
        <span className="dashboard-workspace__skeleton-button" />
      </div>

      <div className="dashboard-workspace__skeleton-grid">
        <span className="is-wide" />
        <span />
        <span className="is-large" />
        <span />
      </div>
    </section>
  );
}

function getSaveLabel(saveState, syncSource, apiEnabled) {
  if (saveState === 'saving') return 'Сохраняем…';
  if (saveState === 'saved') return 'Синхронизировано';
  if (saveState === 'local') return 'Сохранено на устройстве';
  if (saveState === 'offline') return 'Нет связи · сохранено локально';
  if (saveState === 'error') return 'Не удалось сохранить';

  if (!apiEnabled) return 'Локальный режим';
  if (syncSource === 'local-fallback') return 'Нет связи · сохранено локально';
  return 'Синхронизировано';
}

function DashboardWorkspace({ firstRun = false }) {
  const access = useAccessControl();
  const { refresh: refreshDashboardData } = useDashboardData();
  const canEditDashboard = access.can('dashboard.edit');
  const [editing, setEditing] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [resetArmed, setResetArmed] = useState(false);
  const [widgetRevision, setWidgetRevision] = useState({});
  const [toast, setToast] = useState('');
  const toastTimer = useRef(null);

  const {
    layout,
    widgets,
    isHydrated,
    saveState,
    syncSource,
    apiEnabled,
    reorder,
    moveWidget,
    resizeWidget,
    resetLayout,
    retrySync,
    setWidgetVisibility,
    setDensity,
    resetWidgetSize,
  } = useDashboardLayout();

  const density = layout.preferences?.density || DASHBOARD_DENSITIES.comfortable;

  const announce = useCallback((message) => {
    window.clearTimeout(toastTimer.current);
    setToast(message);
    toastTimer.current = window.setTimeout(() => setToast(''), TOAST_LIFETIME);
  }, []);

  const visibleItems = useMemo(() => widgets
    .filter(({ id, config }) => config.visible && (!firstRun || ['integrations', 'security', 'quick'].includes(id)))
    .map(({ id, meta, config }) => {
      const Widget = meta.component;
      const revision = widgetRevision[id] || 0;

      const firstRunSpan = firstRun
        ? ({ integrations: 6, security: 6, quick: 12 }[id] || config.span)
        : config.span;

      return {
        id,
        meta,
        config: { ...config, span: firstRunSpan },
        content: <Widget key={`${id}-${revision}`} />,
      };
    }), [firstRun, widgetRevision, widgets]);

  const hiddenCount = useMemo(
    () => widgets.filter(({ config }) => !config.visible).length,
    [widgets]
  );

  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  useEffect(() => {
    if (!resetArmed) return undefined;

    const timer = window.setTimeout(() => setResetArmed(false), 3500);
    return () => window.clearTimeout(timer);
  }, [resetArmed]);

  useEffect(() => {
    if (!editing) return undefined;

    const handleKeyDown = (event) => {
      if (event.key !== 'Escape') return;
      setPanelOpen(false);
      setResetArmed(false);
      setEditing(false);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [editing]);

  const handleToggleEditing = useCallback(() => {
    if (!canEditDashboard) return;
    setEditing((current) => {
      const next = !current;
      if (!next) {
        setPanelOpen(false);
        setResetArmed(false);
      }
      return next;
    });
  }, [canEditDashboard]);

  const handleHide = useCallback((id) => {
    setWidgetVisibility(id, false);
    announce(`Блок «${WIDGET_REGISTRY[id]?.title || 'Виджет'}» скрыт`);
  }, [announce, setWidgetVisibility]);

  const handleRefresh = useCallback(async (id) => {
    await refreshDashboardData();
    setWidgetRevision((current) => ({
      ...current,
      [id]: (current[id] || 0) + 1,
    }));
    announce(`Данные блока «${WIDGET_REGISTRY[id]?.title || 'Виджет'}» обновлены`);
  }, [announce, refreshDashboardData]);

  const handleResetWidgetSize = useCallback((id) => {
    resetWidgetSize(id);
    announce(`Размер блока «${WIDGET_REGISTRY[id]?.title || 'Виджет'}» восстановлен`);
  }, [announce, resetWidgetSize]);

  const handleReset = useCallback(async () => {
    if (!resetArmed) {
      setResetArmed(true);
      return;
    }

    setResetArmed(false);
    await resetLayout();
    announce('Доска возвращена к стандартной раскладке');
  }, [announce, resetArmed, resetLayout]);

  const handleDensityChange = useCallback((nextDensity) => {
    setDensity(nextDensity);
    announce(nextDensity === DASHBOARD_DENSITIES.compact
      ? 'Включён компактный режим'
      : 'Включён комфортный режим');
  }, [announce, setDensity]);

  if (!isHydrated) {
    return <WorkspaceSkeleton />;
  }

  const statusLabel = getSaveLabel(saveState, syncSource, apiEnabled);
  const canRetry = apiEnabled && (saveState === 'offline' || saveState === 'error' || syncSource === 'local-fallback');

  return (
    <section
      id="dashboard-workspace"
      className={`dashboard-workspace ${editing ? 'is-editing' : ''} ${firstRun ? 'is-first-run' : ''}`}
      data-density={density}
      aria-label="Настраиваемая доска"
    >
      <div className="dashboard-workspace__toolbar">
        <div className="dashboard-workspace__toolbar-copy">
          <span className="dashboard-workspace__eyebrow">{firstRun ? 'Стартовая доска' : 'Рабочее пространство'}</span>
          <div className="dashboard-workspace__title-row">
            <h2>{firstRun ? 'Первые инструменты' : 'Моя доска'}</h2>
            <span
              className={`dashboard-workspace__save-state is-${firstRun ? 'saved' : saveState}`}
              aria-live="polite"
              title={firstRun ? 'Стартовый режим' : statusLabel}
            >
              {firstRun ? 'Стартовый режим' : statusLabel}
            </span>
          </div>
          <p>
            {editing
              ? 'Тяните блок за ручку, меняйте ширину за угол. Alt + стрелки перемещают блок точно, Esc завершает настройку.'
              : firstRun
                ? 'Показываем только блоки, которые полезны на старте. Полная доска откроется после завершения знакомства.'
                : 'Ваши основные показатели, задачи и инструменты в одном пространстве.'}
          </p>
        </div>

        <div className="dashboard-workspace__actions">
          {editing ? (
            <>
              <button
                className="dashboard-workspace__ghost-button"
                type="button"
                onClick={() => setPanelOpen((current) => !current)}
                aria-expanded={panelOpen}
              >
                Блоки
                {hiddenCount ? <span>{hiddenCount}</span> : null}
              </button>

              {canRetry ? (
                <button className="dashboard-workspace__ghost-button is-warning" type="button" onClick={retrySync}>
                  <RetryIcon />
                  Повторить синхронизацию
                </button>
              ) : null}

              <button
                className={`dashboard-workspace__ghost-button ${resetArmed ? 'is-danger-confirm' : ''}`}
                type="button"
                onClick={handleReset}
              >
                <ResetIcon />
                {resetArmed ? 'Подтвердить сброс' : 'Сбросить'}
              </button>
            </>
          ) : null}

          {!firstRun ? <button
            className={`dashboard-workspace__edit-button ${editing ? 'is-active' : ''}`}
            type="button"
            onClick={handleToggleEditing}
            disabled={!canEditDashboard}
            title={!canEditDashboard ? 'Ваша роль не разрешает настраивать доску' : undefined}
          >
            <TuneIcon />
            {editing ? 'Готово' : canEditDashboard ? 'Настроить доску' : 'Доска защищена'}
          </button> : null}
        </div>
      </div>

      {!firstRun && editing && panelOpen ? (
        <div className="dashboard-workspace__catalog">
          <div className="dashboard-workspace__catalog-head">
            <div>
              <strong>Настройка доски</strong>
              <span>Выберите плотность интерфейса и нужные блоки. Порядок и ширина меняются прямо на доске.</span>
            </div>
            <button type="button" onClick={() => setPanelOpen(false)} aria-label="Закрыть настройки доски">×</button>
          </div>

          <div className="dashboard-workspace__preference-row">
            <div>
              <strong>Плотность</strong>
              <span>Компактный режим помещает больше данных без уменьшения текста.</span>
            </div>

            <div className="dashboard-workspace__density" role="group" aria-label="Плотность доски">
              <button
                type="button"
                className={density === DASHBOARD_DENSITIES.comfortable ? 'is-active' : ''}
                onClick={() => handleDensityChange(DASHBOARD_DENSITIES.comfortable)}
                aria-pressed={density === DASHBOARD_DENSITIES.comfortable}
              >
                Комфортно
              </button>
              <button
                type="button"
                className={density === DASHBOARD_DENSITIES.compact ? 'is-active' : ''}
                onClick={() => handleDensityChange(DASHBOARD_DENSITIES.compact)}
                aria-pressed={density === DASHBOARD_DENSITIES.compact}
              >
                Компактно
              </button>
            </div>
          </div>

          <div className="dashboard-workspace__catalog-grid">
            {widgets.map(({ id, config }) => {
              const meta = WIDGET_REGISTRY[id];
              if (!meta) return null;

              return (
                <label className="dashboard-workspace__catalog-item" key={id}>
                  <div>
                    <strong>{meta.title}</strong>
                    <span>{meta.description}</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={config.visible}
                    onChange={(event) => setWidgetVisibility(id, event.target.checked)}
                  />
                  <i aria-hidden="true" />
                </label>
              );
            })}
          </div>
        </div>
      ) : null}

      <DashboardGrid
        items={visibleItems}
        editing={editing}
        onReorder={reorder}
        onMove={moveWidget}
        onResize={resizeWidget}
        onHide={handleHide}
        onRefresh={handleRefresh}
        onResetSize={handleResetWidgetSize}
      />

      {!visibleItems.length ? (
        <div className="dashboard-workspace__empty">
          <strong>Доска пустая</strong>
          <span>Откройте список блоков и верните нужные виджеты.</span>
          <button type="button" onClick={() => { setEditing(true); setPanelOpen(true); }}>Выбрать блоки</button>
        </div>
      ) : null}

      {toast ? (
        <div className="dashboard-workspace__toast" role="status" aria-live="polite">
          <span aria-hidden="true">✓</span>
          {toast}
        </div>
      ) : null}
    </section>
  );
}

export default memo(DashboardWorkspace);
