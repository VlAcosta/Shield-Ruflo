import { useEffect, useRef } from 'react';

const DIALOG_SELECTOR = '.calendar-composer__dialog, .checklist-create__card, .competitor-modal__dialog';
const FOCUSABLE_CANDIDATE_SELECTOR = 'button, a[href], input, select, textarea, [tabindex]';
const CLOSE_SELECTOR = [
  '.calendar-composer__close',
  '.checklist-create__head button[aria-label="Закрыть"]',
  '.competitor-modal__dialog > header button',
  'button[aria-label="Закрыть"]',
].join(', ');

function isFocusableCandidate(node) {
  if (!node || typeof node.getAttribute !== 'function') return false;
  if (node.getAttribute('aria-hidden') === 'true') return false;
  if (node.getAttribute('tabindex') === '-1') return false;
  if ('disabled' in node && node.disabled) return false;
  return true;
}

function getFocusable(dialog) {
  return dialog
    ? Array.from(dialog.querySelectorAll(FOCUSABLE_CANDIDATE_SELECTOR)).filter(isFocusableCandidate)
    : [];
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
  const lastFocusedInsideRef = useRef(null);

  useEffect(() => {
    let focusFrame = 0;
    let restoreFrame = 0;
    let containFrame = 0;

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
      const dialog = dialogRef.current || event.currentTarget;
      if (!dialog?.querySelector) return;
      if (event.key !== 'Escape') return;

      event.preventDefault();
      event.stopPropagation();
      const closeButton = dialog.querySelector(CLOSE_SELECTOR);
      closeButton?.click();
    };

    const attachDialog = (dialog) => {
      dialog?.addEventListener('keydown', handleDialogKeyDown, true);
    };

    const detachDialog = (dialog) => {
      dialog?.removeEventListener('keydown', handleDialogKeyDown, true);
    };

    const syncDialog = () => {
      const nextDialog = document.querySelector(DIALOG_SELECTOR);
      const currentDialog = dialogRef.current;
      if (nextDialog === currentDialog) return;

      if (currentDialog) detachDialog(currentDialog);
      window.cancelAnimationFrame(containFrame);

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
      lastFocusedInsideRef.current = null;

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

    const containFocus = (event) => {
      const dialog = dialogRef.current;
      const target = event.target;
      if (!dialog || !target) return;

      if (dialog.contains(target)) {
        lastFocusedInsideRef.current = target;
        return;
      }

      const focusable = getFocusable(dialog);
      const initial = getInitialFocus(dialog);
      const first = focusable[0] || initial || dialog;
      const last = focusable[focusable.length - 1] || first;
      const previous = lastFocusedInsideRef.current;
      const destination = previous === first ? last : first;

      window.cancelAnimationFrame(containFrame);
      containFrame = window.requestAnimationFrame(() => {
        const activeDialog = dialogRef.current;
        if (!activeDialog?.isConnected || !activeDialog.contains(destination)) return;
        focusElement(destination);
      });
    };

    const observer = new MutationObserver(syncDialog);
    observer.observe(document.body, { childList: true, subtree: true });

    document.addEventListener('click', rememberActivation, true);
    document.addEventListener('focusin', containFocus, true);
    syncDialog();

    return () => {
      observer.disconnect();
      document.removeEventListener('click', rememberActivation, true);
      document.removeEventListener('focusin', containFocus, true);
      detachDialog(dialogRef.current);
      window.cancelAnimationFrame(focusFrame);
      window.cancelAnimationFrame(restoreFrame);
      window.cancelAnimationFrame(containFrame);
      dialogRef.current = null;
      lastFocusedInsideRef.current = null;
    };
  }, []);
}
