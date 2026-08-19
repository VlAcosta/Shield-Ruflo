import React, { memo, useEffect, useRef, useState } from 'react';
import useWorkspaceSwitcher from '../../../features/agency/hooks/useWorkspaceSwitcher';
import './PortalWorkspaceSwitcher.scss';

function WorkspaceRow({ workspace, active, switching, onSelect }) {
  const delegated = workspace.access?.mode === 'DELEGATED';
  const initials = String(workspace.organization?.name || 'О')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');

  return (
    <button
      type="button"
      className={`workspace-switcher__item ${active ? 'is-active' : ''}`.trim()}
      onClick={() => onSelect(workspace)}
      disabled={active || Boolean(switching)}
      role="option"
      aria-selected={active}
    >
      <span className="workspace-switcher__avatar" aria-hidden="true">{initials || 'О'}</span>
      <span className="workspace-switcher__itemCopy">
        <strong>{workspace.organization?.name || 'Организация'}</strong>
        <small>{delegated ? `Клиент · ${workspace.agency?.name || 'Агентство'}` : 'Моя организация'}</small>
      </span>
      {switching ? <span className="workspace-switcher__spinner" aria-label="Переключение" /> : null}
      {!switching && active ? <span className="workspace-switcher__check" aria-hidden="true">✓</span> : null}
    </button>
  );
}

function WorkspaceGroup({ label, items, activeOrganizationId, switchingId, onSelect }) {
  if (!items.length) return null;
  return (
    <section className="workspace-switcher__group">
      <div className="workspace-switcher__groupLabel">{label}</div>
      <div role="listbox" aria-label={label}>
        {items.map((workspace) => (
          <WorkspaceRow
            key={`${workspace.access.mode}:${workspace.id}`}
            workspace={workspace}
            active={workspace.id === activeOrganizationId}
            switching={workspace.id === switchingId}
            onSelect={onSelect}
          />
        ))}
      </div>
    </section>
  );
}

function PortalWorkspaceSwitcher({ navigationLocked = false }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const workspaces = useWorkspaceSwitcher({ enabled: !navigationLocked });
  const active = workspaces.activeWorkspace;
  const delegated = active?.access?.mode === 'DELEGATED';
  const visible = !navigationLocked && (workspaces.items.length > 1 || delegated);

  useEffect(() => {
    if (!open) return undefined;
    const closeOnOutside = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutside);
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutside);
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  if (!visible) return null;

  const select = async (workspace) => {
    try {
      await workspaces.select(workspace);
      setOpen(false);
    } catch {
      // The hook keeps a user-facing error inside this popover.
    }
  };

  return (
    <div className="workspace-switcher" ref={rootRef}>
      <button
        type="button"
        className={`workspace-switcher__trigger ${open ? 'is-open' : ''}`.trim()}
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <span className="workspace-switcher__triggerCopy">
          <small>{delegated ? 'Клиентское пространство' : 'Рабочее пространство'}</small>
          <strong>{active?.organization?.name || 'Выбрать организацию'}</strong>
        </span>
        {delegated ? <span className="workspace-switcher__badge">Агентский доступ</span> : null}
        <span className="workspace-switcher__chevron" aria-hidden="true">⌄</span>
      </button>

      {open ? (
        <div className="workspace-switcher__menu" role="dialog" aria-label="Смена рабочего пространства">
          <div className="workspace-switcher__head">
            <div>
              <strong>Рабочие пространства</strong>
              <span>Доступ определяется сервером</span>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Закрыть">×</button>
          </div>

          {workspaces.state === 'loading' ? (
            <div className="workspace-switcher__state">Загружаем доступы…</div>
          ) : null}
          {workspaces.error ? <div className="workspace-switcher__error" role="alert">{workspaces.error}</div> : null}

          {workspaces.state !== 'loading' ? (
            <div className="workspace-switcher__body">
              <WorkspaceGroup
                label="Мои организации"
                items={workspaces.directItems}
                activeOrganizationId={workspaces.activeOrganizationId}
                switchingId={workspaces.switchingId}
                onSelect={select}
              />
              <WorkspaceGroup
                label="Клиенты агентства"
                items={workspaces.delegatedItems}
                activeOrganizationId={workspaces.activeOrganizationId}
                switchingId={workspaces.switchingId}
                onSelect={select}
              />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default memo(PortalWorkspaceSwitcher);
