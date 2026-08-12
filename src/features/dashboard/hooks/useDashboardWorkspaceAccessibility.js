import { useEffect, useRef } from 'react';

const CATALOG_SELECTOR = '.dashboard-workspace__catalog';
const CATALOG_TRIGGER_SELECTOR = [
  '.dashboard-workspace__add-button',
  '.dashboard-workspace__empty button',
  '.dashboard-workspace__actions button[aria-expanded]',
].join(', ');
const CATALOG_WIDGET_SELECTOR = '.dashboard-workspace__catalog-grid input[type="checkbox"]:not(:disabled)';
const CATALOG_DENSITY_SELECTOR = '.dashboard-workspace__density button:not(:disabled)';
const CATALOG_CLOSE_SELECTOR = '.dashboard-workspace__catalog-head button:not(:disabled)';

function focusElement(node) {
  if (!node?.isConnected || typeof node.focus !== 'function') return false;
  node.focus();
  return document.activeElement === node;
}

export default function useDashboardWorkspaceAccessibility() {
  const openerRef = useRef(null);
  const catalogVisibleRef = useRef(false);

  useEffect(() => {
    let focusFrame = 0;
    let restoreFrame = 0;

    const focusCatalog = () => {
      window.cancelAnimationFrame(focusFrame);
      focusFrame = window.requestAnimationFrame(() => {
        const catalog = document.querySelector(CATALOG_SELECTOR);
        const target = catalog?.querySelector(CATALOG_WIDGET_SELECTOR)
          || catalog?.querySelector(CATALOG_DENSITY_SELECTOR)
          || catalog?.querySelector(CATALOG_CLOSE_SELECTOR);
        focusElement(target);
      });
    };

    const restoreFocus = () => {
      window.cancelAnimationFrame(restoreFrame);
      restoreFrame = window.requestAnimationFrame(() => {
        if (focusElement(openerRef.current)) return;
        focusElement(document.querySelector('.dashboard-workspace__actions button[aria-expanded]'));
      });
    };

    const syncCatalogPresence = () => {
      const visible = Boolean(document.querySelector(CATALOG_SELECTOR));
      if (visible === catalogVisibleRef.current) return;

      catalogVisibleRef.current = visible;
      if (visible) focusCatalog();
      else restoreFocus();
    };

    const rememberOpener = (event) => {
      const trigger = event.target?.closest?.(CATALOG_TRIGGER_SELECTOR);
      if (trigger) openerRef.current = trigger;
    };

    const handleEscape = (event) => {
      if (event.key !== 'Escape') return;
      const catalog = document.querySelector(CATALOG_SELECTOR);
      if (!catalog) return;

      event.preventDefault();
      event.stopPropagation();
      const closeButton = catalog.querySelector(CATALOG_CLOSE_SELECTOR);
      closeButton?.click();
    };

    const observer = new MutationObserver(syncCatalogPresence);
    observer.observe(document.body, { childList: true, subtree: true });

    document.addEventListener('click', rememberOpener, true);
    document.addEventListener('keydown', handleEscape, true);
    syncCatalogPresence();

    return () => {
      observer.disconnect();
      document.removeEventListener('click', rememberOpener, true);
      document.removeEventListener('keydown', handleEscape, true);
      window.cancelAnimationFrame(focusFrame);
      window.cancelAnimationFrame(restoreFrame);
      catalogVisibleRef.current = false;
    };
  }, []);
}
