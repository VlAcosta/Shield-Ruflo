import { useEffect } from 'react';

const TRIGGER_SELECTOR = '.dashboard-grid__menu-trigger';
const MENU_SELECTOR = '[role="menu"]';
const MENU_ITEM_SELECTOR = '[role="menuitem"]:not(:disabled)';

function getMenuItems(menu) {
  return menu ? Array.from(menu.querySelectorAll(MENU_ITEM_SELECTOR)) : [];
}

function getWidgetRoot(node) {
  return node?.closest?.('[data-widget-menu]') || null;
}

function getTrigger(root) {
  return root?.querySelector?.(TRIGGER_SELECTOR) || null;
}

function getMenu(root) {
  return root?.querySelector?.(MENU_SELECTOR) || null;
}

function focusOpenedMenu(trigger, edge = 'first') {
  window.requestAnimationFrame(() => {
    if (trigger?.getAttribute('aria-expanded') !== 'true') return;
    const items = getMenuItems(getMenu(getWidgetRoot(trigger)));
    if (!items.length) return;
    (edge === 'last' ? items.at(-1) : items[0])?.focus();
  });
}

export default function useDashboardGridMenuAccessibility() {
  useEffect(() => {
    const handleKeyDown = (event) => {
      const target = event.target;
      const trigger = target?.closest?.(TRIGGER_SELECTOR);

      if (trigger && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
        event.preventDefault();
        const edge = event.key === 'ArrowUp' ? 'last' : 'first';
        if (trigger.getAttribute('aria-expanded') !== 'true') trigger.click();
        focusOpenedMenu(trigger, edge);
        return;
      }

      const menu = target?.closest?.(MENU_SELECTOR);
      if (!menu) return;

      const items = getMenuItems(menu);
      if (!items.length) return;
      const currentIndex = Math.max(0, items.indexOf(document.activeElement));

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        items[(currentIndex + 1) % items.length]?.focus();
        return;
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        items[(currentIndex - 1 + items.length) % items.length]?.focus();
        return;
      }

      if (event.key === 'Home') {
        event.preventDefault();
        items[0]?.focus();
        return;
      }

      if (event.key === 'End') {
        event.preventDefault();
        items.at(-1)?.focus();
        return;
      }

      if (event.key === 'Escape') {
        const menuTrigger = getTrigger(getWidgetRoot(menu));
        window.requestAnimationFrame(() => menuTrigger?.focus());
      }
    };

    const handleKeyUp = (event) => {
      if (!['Enter', ' '].includes(event.key)) return;
      const trigger = event.target?.closest?.(TRIGGER_SELECTOR);
      if (trigger) focusOpenedMenu(trigger, 'first');
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('keyup', handleKeyUp);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('keyup', handleKeyUp);
    };
  }, []);
}
