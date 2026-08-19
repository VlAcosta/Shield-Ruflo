import React, { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import useDashboardGridMenuAccessibility from './useDashboardGridMenuAccessibility';

function Harness() {
  const [open, setOpen] = useState(false);
  useDashboardGridMenuAccessibility();

  return (
    <div data-widget-menu="reviews">
      <button
        type="button"
        className="dashboard-grid__menu-trigger"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((current) => !current)}
      >
        Действия
      </button>
      {open ? (
        <div role="menu" aria-label="Действия с блоком Отзывы">
          <button type="button" role="menuitem">Обновить данные</button>
          <button type="button" role="menuitem" disabled>Стандартный размер</button>
          <button type="button" role="menuitem">Скрыть блок</button>
        </div>
      ) : null}
    </div>
  );
}

describe('useDashboardGridMenuAccessibility', () => {
  let requestAnimationFrameSpy;

  beforeEach(() => {
    requestAnimationFrameSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      window.setTimeout(() => callback(performance.now()), 0);
      return 1;
    });
  });

  afterEach(() => {
    requestAnimationFrameSpy.mockRestore();
  });

  it('opens from ArrowDown and cycles only enabled menu items', async () => {
    render(<Harness />);
    const trigger = screen.getByRole('button', { name: 'Действия' });

    trigger.focus();
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });

    const refresh = await screen.findByRole('menuitem', { name: 'Обновить данные' });
    const hide = screen.getByRole('menuitem', { name: 'Скрыть блок' });
    await waitFor(() => expect(refresh).toHaveFocus());

    fireEvent.keyDown(refresh, { key: 'ArrowDown' });
    expect(hide).toHaveFocus();

    fireEvent.keyDown(hide, { key: 'ArrowDown' });
    expect(refresh).toHaveFocus();

    fireEvent.keyDown(refresh, { key: 'End' });
    expect(hide).toHaveFocus();

    fireEvent.keyDown(hide, { key: 'Home' });
    expect(refresh).toHaveFocus();
  });

  it('opens from ArrowUp at the last enabled item and restores trigger focus on Escape', async () => {
    render(<Harness />);
    const trigger = screen.getByRole('button', { name: 'Действия' });

    trigger.focus();
    fireEvent.keyDown(trigger, { key: 'ArrowUp' });

    const hide = await screen.findByRole('menuitem', { name: 'Скрыть блок' });
    await waitFor(() => expect(hide).toHaveFocus());

    fireEvent.keyDown(hide, { key: 'Escape' });
    await waitFor(() => expect(trigger).toHaveFocus());
  });
});
