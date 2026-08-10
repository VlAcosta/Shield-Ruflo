import { act, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from './App';
import { authService } from './services/auth/authService';
import { AUTH_SESSION_INVALID_EVENT } from './services/core/apiClient';

afterEach(() => {
  jest.restoreAllMocks();
  localStorage.clear();
});

test('renders the public landing route', () => {
  render(<MemoryRouter initialEntries={['/']}><App /></MemoryRouter>);
  expect(screen.getByLabelText('Загрузка главной страницы')).toBeInTheDocument();
});

test('requires an authenticated backend session for onboarding', async () => {
  jest.spyOn(authService, 'restoreSession').mockRejectedValue(Object.assign(new Error('Expired'), { status: 401 }));
  jest.spyOn(authService, 'clearLocalSession').mockImplementation(() => {});

  render(<MemoryRouter initialEntries={['/onboarding']}><App /></MemoryRouter>);

  expect(screen.getByLabelText('Загрузка раздела')).toBeInTheDocument();
  expect(await screen.findByText('С возвращением')).toBeInTheDocument();
  expect(authService.restoreSession).toHaveBeenCalledTimes(1);
});

test('leaves a protected route when the active session becomes invalid', async () => {
  localStorage.setItem('onboarding_completed', '1');
  jest.spyOn(authService, 'restoreSession').mockResolvedValue({ id: 'user-1' });
  jest.spyOn(authService, 'clearLocalSession').mockImplementation(() => {});

  render(<MemoryRouter initialEntries={['/dashboard']}><App /></MemoryRouter>);
  await waitFor(() => expect(authService.restoreSession).toHaveBeenCalledTimes(1));

  act(() => window.dispatchEvent(new CustomEvent(AUTH_SESSION_INVALID_EVENT)));

  expect(await screen.findByText('С возвращением')).toBeInTheDocument();
  expect(authService.clearLocalSession).toHaveBeenCalled();
});
