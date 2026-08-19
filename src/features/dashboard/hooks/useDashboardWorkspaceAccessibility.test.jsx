import React, { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import useDashboardWorkspaceAccessibility from './useDashboardWorkspaceAccessibility';

function Harness() {
  const [editing, setEditing] = useState(false);
  const [open, setOpen] = useState(false);
  useDashboardWorkspaceAccessibility();

  return (
    <div>
      {!editing ? (
        <button
          type="button"
          className="dashboard-workspace__add-button"
          onClick={() => {
            setEditing(true);
            setOpen(true);
          }}
        >
          Добавить блок
        </button>
      ) : null}

      {editing ? (
        <div className="dashboard-workspace__actions">
          <button type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)}>Блоки</button>
        </div>
      ) : null}

      {open ? (
        <div className="dashboard-workspace__catalog">
          <div className="dashboard-workspace__catalog-head">
            <button type="button" onClick={() => setOpen(false)} aria-label="Закрыть настройки доски">×</button>
          </div>
          <div className="dashboard-workspace__density">
            <button type="button">Комфортно</button>
          </div>
          <div className="dashboard-workspace__catalog-grid">
            <label>
              Первый блок
              <input type="checkbox" aria-label="Первый блок" />
            </label>
            <label>
              Второй блок
              <input type="checkbox" aria-label="Второй блок" />
            </label>
          </div>
        </div>
      ) : null}
    </div>
  );
}

describe('useDashboardWorkspaceAccessibility', () => {
  it('focuses the first widget switch and keeps Escape inside the catalog first', async () => {
    const windowEscape = vi.fn();
    window.addEventListener('keydown', windowEscape);

    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Добавить блок' }));

    await waitFor(() => {
      expect(screen.getByRole('checkbox', { name: 'Первый блок' })).toHaveFocus();
    });

    fireEvent.keyDown(document.activeElement, { key: 'Escape' });

    await waitFor(() => {
      expect(screen.queryByRole('checkbox', { name: 'Первый блок' })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Блоки' })).toHaveFocus();
    });
    expect(windowEscape).not.toHaveBeenCalled();

    fireEvent.keyDown(screen.getByRole('button', { name: 'Блоки' }), { key: 'Escape' });
    expect(windowEscape).toHaveBeenCalledTimes(1);

    window.removeEventListener('keydown', windowEscape);
  });

  it('returns focus to the persistent Blocks opener when it toggles the catalog', async () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Добавить блок' }));
    await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Первый блок' })).toHaveFocus());

    fireEvent.click(screen.getByRole('button', { name: 'Блоки' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Блоки' })).toHaveFocus());
  });
});
