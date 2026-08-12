import React, { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
  it('focuses the dialog, traps Tab and restores the opener after Escape', async () => {
    const windowKeyDown = vi.fn();
    window.addEventListener('keydown', windowKeyDown);

    render(<Harness />);
    const opener = screen.getByRole('button', { name: 'Открыть событие' });
    fireEvent.click(opener);

    const input = await screen.findByRole('textbox', { name: 'Название' });
    const close = screen.getByRole('button', { name: 'Закрыть' });

    await waitFor(() => expect(input).toHaveFocus());

    close.focus();
    userEvent.tab();
    expect(input).toHaveFocus();

    input.focus();
    userEvent.tab({ shift: true });
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
