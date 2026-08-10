import { act, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from './App';
import { authService } from './services/auth/authService';
import { adminAccessService } from './services/admin/adminAccessService';
import { AUTH_SESSION_INVALID_EVENT } from './services/core/apiClient';

const routerFuture = { v7_startTransition: true, v7_relativeSplatPath: true };

function renderApp(path) {
  return render(
    <MemoryRouter initialEntries={[path]} future={routerFuture}>
      <App />
    </MemoryRouter>,
  );
}

afterEach(() => {
  jest.restoreAllMocks();
  localStorage.clear();
});

test('renders the public landing route', async () => {
  renderApp('/');
  expect(screen.getByLabelText('Загрузка главной страницы')).toBeInTheDocument();
  await act(async () => { await Promise.resolve(); });
});

test('requires an authenticated backend session for onboarding', async () => {
  jest.spyOn(authService, 'restoreSession').mockRejectedValue(Object.assign(new Error('Expired'), { status: 401 }));
  jest.spyOn(authService, 'clearLocalSession').mockImplementation(() => {});

  renderApp('/onboarding');

  expect(screen.getByLabelText('Загрузка раздела')).toBeInTheDocument();
  expect(await screen.findByText('С возвращением')).toBeInTheDocument();
  expect(authService.restoreSession).toHaveBeenCalledTimes(1);
});

test('leaves a protected route when the active session becomes invalid', async () => {
  localStorage.setItem('onboarding_completed', '1');
  jest.spyOn(authService, 'restoreSession').mockResolvedValue({ id: 'user-1' });
  jest.spyOn(authService, 'clearLocalSession').mockImplementation(() => {});

  renderApp('/dashboard');
  await waitFor(() => expect(authService.restoreSession).toHaveBeenCalledTimes(1));

  act(() => window.dispatchEvent(new CustomEvent(AUTH_SESSION_INVALID_EVENT)));

  expect(await screen.findByText('С возвращением')).toBeInTheDocument();
  expect(authService.clearLocalSession).toHaveBeenCalled();
});

test('requires backend platform-admin authorization before rendering admin routes', async () => {
  jest.spyOn(authService, 'restoreSession').mockResolvedValue({ id: 'user-1' });
  jest.spyOn(adminAccessService, 'check').mockRejectedValue(Object.assign(new Error('Denied'), { status: 403 }));

  renderApp('/admin/dashboard');

  expect(await screen.findByText('Доступ к админ-панели запрещён')).toBeInTheDocument();
  expect(adminAccessService.check).toHaveBeenCalledTimes(1);
});
