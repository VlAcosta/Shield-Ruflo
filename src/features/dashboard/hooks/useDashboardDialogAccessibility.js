import { useEffect, useRef } from 'react';

const DIALOG_SELECTOR = '.calendar-composer__dialog, .checklist-create__card';
const FOCUSABLE_SELECTOR = [
  'button:not(:disabled)',
  'a[href]',
  'input:not(:disabled)',
  'select:not(:disabled)',
  'textarea:not(:disabled)',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');
const CLOSE_SELECTOR = [
  '.calendar-composer__close',
  '.checklist-create__head button[aria-label="Закрыть"]',
  'button[aria-label="Закрыть"]',
].join(', ');

function getFocusable(dialog) {
  return dialog ? Array.from(dialog.querySelectorAll(FOCUSABLE_SELECTOR)) : [];
}

function getInitialFocus(dialog) {
  return dialog?.querySelector('input:not(:disabled)')
    || dialog?.querySelector('textarea:not(:disabled)')
    || dialog?.querySelector('select:not(:disabled)')
    || dialog?.querySelector('button:not(:disabled)')
    || null;
}

function focusElement(node) {
  if (!node?.isConnected || typeof node.focus !== 'function') return false;
  node.focus();
  return document.activeElement === node;
}

export default function useDashboardDialogAccessibility() {
  const dialogRef = useRef(null);
  const openerRef = useRef(null);
  const lastActivationRef = useRef(null);

  useEffect(() => {
    let focusFrame = 0;
    let restoreFrame = 0;

    const focusDialog = (dialog) => {
      window.cancelAnimationFrame(focusFrame);
      focusFrame = window.requestAnimationFrame(() => {
        if (!dialog?.isConnected) return;
        focusElement(getInitialFocus(dialog) || getFocusable(dialog)[0] || dialog);
      });
    };

    const restoreFocus = () => {
      window.cancelAnimationFrame(restoreFrame);
      restoreFrame = window.requestAnimationFrame(() => {
        focusElement(openerRef.current);
        openerRef.current = null;
      });
    };

    const handleDialogKeyDown = (event) => {
      const dialog = event.currentTarget;
      if (!(dialog instanceof HTMLElement)) return;

      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        const closeButton = dialog.querySelector(CLOSE_SELECTOR);
        closeButton?.click();
        return;
      }

      if (event.key !== 'Tab') return;
      const focusable = getFocusable(dialog);
      if (!focusable.length) {
        event.preventDefault();
        focusElement(dialog);
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const eventTarget = event.target instanceof HTMLElement && dialog.contains(event.target)
        ? event.target
        : document.activeElement;

      if (event.shiftKey && eventTarget === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && eventTarget === last) {
        event.preventDefault();
        first.focus();
      }
    };

    const attachDialog = (dialog) => {
      dialog?.addEventListener('keydown', handleDialogKeyDown);
    };

    const detachDialog = (dialog) => {
      dialog?.removeEventListener('keydown', handleDialogKeyDown);
    };

    const syncDialog = () => {
      const nextDialog = document.querySelector(DIALOG_SELECTOR);
      const currentDialog = dialogRef.current;
      if (nextDialog === currentDialog) return;

      if (currentDialog) detachDialog(currentDialog);

      if (!currentDialog && nextDialog) {
        const activeElement = document.activeElement;
        const candidate = lastActivationRef.current;
        openerRef.current = candidate?.isConnected && !nextDialog.contains(candidate)
          ? candidate
          : activeElement?.isConnected && !nextDialog.contains(activeElement)
            ? activeElement
            : null;
      }

      dialogRef.current = nextDialog;

      if (nextDialog) {
        attachDialog(nextDialog);
        focusDialog(nextDialog);
      } else if (currentDialog) {
        restoreFocus();
      }
    };

    const rememberActivation = (event) => {
      if (dialogRef.current) return;
      const trigger = event.target?.closest?.('button, a[href], [role="button"]');
      if (trigger) lastActivationRef.current = trigger;
    };

    const observer = new MutationObserver(syncDialog);
    observer.observe(document.body, { childList: true, subtree: true });

    document.addEventListener('click', rememberActivation, true);
    syncDialog();

    return () => {
      observer.disconnect();
      document.removeEventListener('click', rememberActivation, true);
      detachDialog(dialogRef.current);
      window.cancelAnimationFrame(focusFrame);
      window.cancelAnimationFrame(restoreFrame);
      dialogRef.current = null;
    };
  }, []);
}
