import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import InviteUserModal from './InviteUserModal';
import { getAvailableRoles } from '../../../services/access/rbacService';

jest.mock('../../../services/access/rbacService', () => ({
  getAvailableRoles: jest.fn(),
}));

const roles = [
  { id: 'OWNER', label: 'Владелец', system: true },
  { id: 'ADMIN', label: 'Администратор', system: true },
  { id: 'MEMBER', label: 'Участник', system: true },
  { id: 'custom-local', label: 'Локальная роль', system: false },
];

describe('InviteUserModal canonical role contract', () => {
  beforeEach(() => getAvailableRoles.mockReturnValue(roles));

  test('defaults to canonical MEMBER and excludes owner and local-only roles', async () => {
    const onInvite = jest.fn().mockResolvedValue({ ok: false, message: 'Остановлено тестом' });
    render(<InviteUserModal open busy={false} onClose={jest.fn()} onInvite={onInvite} />);

    expect(screen.queryByRole('radio', { name: /Владелец/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: /Локальная роль/ })).not.toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Участник/ })).toBeChecked();

    fireEvent.change(screen.getByPlaceholderText('Анна Петрова'), { target: { value: 'Анна' } });
    fireEvent.change(screen.getByPlaceholderText('anna@company.ru'), { target: { value: 'anna@example.test' } });
    fireEvent.click(screen.getByRole('button', { name: 'Создать приглашение' }));

    await waitFor(() => expect(onInvite).toHaveBeenCalledWith(expect.objectContaining({ role: 'MEMBER' })));
  });

  test('announces validation, marks the invalid field, and moves focus to it', () => {
    render(<InviteUserModal open busy={false} onClose={jest.fn()} onInvite={jest.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Создать приглашение' }));

    const name = screen.getByPlaceholderText('Анна Петрова');
    expect(screen.getByRole('alert')).toHaveTextContent('Укажите имя пользователя');
    expect(name).toHaveAttribute('aria-invalid', 'true');
    expect(name).toHaveAttribute('aria-describedby', 'invite-user-error');
    expect(name).toHaveFocus();
  });

  test('traps keyboard focus and restores the trigger when closed', () => {
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    trigger.focus();
    const onClose = jest.fn();
    const { rerender } = render(<InviteUserModal open busy={false} onClose={onClose} onInvite={jest.fn()} />);
    const closeButtons = screen.getAllByRole('button', { name: 'Закрыть' });
    const last = screen.getByRole('button', { name: 'Создать приглашение' });
    last.focus();
    fireEvent.keyDown(window, { key: 'Tab' });
    expect(closeButtons[1]).toHaveFocus();

    rerender(<InviteUserModal open={false} busy={false} onClose={onClose} onInvite={jest.fn()} />);
    expect(trigger).toHaveFocus();
    trigger.remove();
  });
});
