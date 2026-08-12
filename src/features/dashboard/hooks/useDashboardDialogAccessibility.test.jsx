import React, { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import useDashboardDialogAccessibility from './useDashboardDialogAccessibility';

function Harness() {
  const [open, setOpen] = useState(false);
  useDashboardDialogAccessibility();

  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>Открыть событие</button>
      {open ? (
        <form className="calendar-composer__dialog" role="dialog" aria-modal="true">
          <input aria-label="Название" />
          <button type="button">Второе действие</button>
          <button type="button" className="calendar-composer__close" aria-label="Закрыть" onClick={() => setOpen(false)}>×</button>
        </form>
      ) : null}
    </div>
  );
}

describe('useDashboardDialogAccessibility', () => {
  it('contains focus in the dialog and restores the opener after Escape', async () => {
    const windowKeyDown = vi.fn();
    window.addEventListener('keydown', windowKeyDown);

    render(<Harness />);
    const opener = screen.getByRole('button', { name: 'Открыть событие' });
    fireEvent.click(opener);

    const input = await screen.findByRole('textbox', { name: 'Название' });
    const close = screen.getByRole('button', { name: 'Закрыть' });

    await waitFor(() => expect(input).toHaveFocus());

    // Forward escape: after the last control, any focus attempt outside the
    // modal is redirected to the first focusable control.
    close.focus();
    opener.focus();
    expect(input).toHaveFocus();

    // Reverse escape: after the first control, an outside focus attempt is
    // redirected to the last focusable control.
    input.focus();
    opener.focus();
    expect(close).toHaveFocus();

    fireEvent.keyDown(close, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(opener).toHaveFocus();
    });
    expect(windowKeyDown).not.toHaveBeenCalled();

    window.removeEventListener('keydown', windowKeyDown);
  });
});
