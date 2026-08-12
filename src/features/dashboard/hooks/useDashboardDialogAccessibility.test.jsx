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

function CompetitorHarness() {
  const [open, setOpen] = useState(false);
  useDashboardDialogAccessibility();

  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>Настроить конкурентов</button>
      {open ? (
        <section className="competitor-modal__dialog" role="dialog" aria-modal="true">
          <header>
            <h2>Конкуренты</h2>
            <button type="button" onClick={() => setOpen(false)}>×</button>
          </header>
          <input aria-label="Название конкурента" />
          <button type="button">Готово</button>
        </section>
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

    close.focus();
    opener.focus();
    await waitFor(() => expect(input).toHaveFocus());

    input.focus();
    opener.focus();
    await waitFor(() => expect(close).toHaveFocus());

    fireEvent.keyDown(close, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(opener).toHaveFocus();
    });
    expect(windowKeyDown).not.toHaveBeenCalled();

    window.removeEventListener('keydown', windowKeyDown);
  });

  it('supports the competitor dialog close button and restores its opener', async () => {
    render(<CompetitorHarness />);
    const opener = screen.getByRole('button', { name: 'Настроить конкурентов' });
    fireEvent.click(opener);

    const input = await screen.findByRole('textbox', { name: 'Название конкурента' });
    await waitFor(() => expect(input).toHaveFocus());

    fireEvent.keyDown(input, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(opener).toHaveFocus();
    });
  });
});
