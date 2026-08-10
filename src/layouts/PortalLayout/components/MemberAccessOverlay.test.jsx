import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { authService } from '../../../services/auth/authService';
import MemberAccessOverlay from './MemberAccessOverlay';

vi.mock('../../../services/auth/authService', () => ({
  authService: { logout: vi.fn() },
}));

describe('MemberAccessOverlay logout', () => {
  beforeEach(() => {
    authService.logout.mockReset();
  });

  test('keeps the user on screen and explains a server logout failure', async () => {
    let rejectLogout;
    authService.logout.mockImplementation(() => new Promise((_, reject) => {
      rejectLogout = reject;
    }));
    render(<MemberAccessOverlay reason="revoked" />);

    fireEvent.click(screen.getByRole('button', { name: 'Войти снова' }));
    expect(authService.logout).toHaveBeenCalledTimes(1);

    act(() => {
      rejectLogout(new Error('Сервис авторизации недоступен'));
    });

    expect(await screen.findByRole('alert')).toHaveTextContent('Сервис авторизации недоступен');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Войти снова' })).toBeEnabled());
  });

  test('moves focus into the modal and restores prior focus after unmount', () => {
    const previous = document.createElement('button');
    document.body.appendChild(previous);
    previous.focus();
    const { unmount } = render(<MemberAccessOverlay reason="frozen" />);
    expect(screen.getByRole('button', { name: 'Войти другим аккаунтом' })).toHaveFocus();
    fireEvent.keyDown(screen.getByRole('button', { name: 'Войти другим аккаунтом' }), { key: 'Tab' });
    expect(screen.getByRole('button', { name: 'Войти другим аккаунтом' })).toHaveFocus();
    unmount();
    expect(previous).toHaveFocus();
    previous.remove();
  });
});
