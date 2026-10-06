import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import AuthWorkspace from './AuthWorkspace';
import { authService } from '../../services/auth/authService';
import {
  acceptCompanyInvitation,
  getCompanyInvitation,
} from '../../services/profile/companyInvitationService';

vi.mock('../../services/auth/authService', () => ({
  authService: {
    requestCode: vi.fn(),
    verifyCode: vi.fn(),
    register: vi.fn(),
    persistSession: vi.fn(),
    restoreSession: vi.fn(),
  },
}));

vi.mock('../../services/profile/companyInvitationService', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    acceptCompanyInvitation: vi.fn(),
    getCompanyInvitation: vi.fn(),
  };
});

function renderInvitation() {
  return render(
    <MemoryRouter initialEntries={['/auth?invite=invite-token']}>
      <Routes>
        <Route path="/auth" element={<AuthWorkspace />} />
        <Route path="/dashboard" element={<div>Dashboard</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

async function advanceToProfile() {
  await screen.findByRole('heading', { name: 'Подтвердите телефон' });

  fireEvent.change(screen.getByPlaceholderText('(999) 123-45-67'), {
    target: { value: '9991234567' },
  });
  fireEvent.click(screen.getByRole('button', { name: /Получить код/ }));

  await screen.findByRole('heading', { name: 'Введите код' });
  screen.getAllByLabelText(/Цифра \d/).forEach((input, index) => {
    fireEvent.change(input, { target: { value: String(index + 1) } });
  });
  fireEvent.click(screen.getByRole('button', { name: /Подтвердить/ }));

  await screen.findByRole('heading', { name: 'Завершите подключение' });
}

describe('invitation registration', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();

    authService.requestCode.mockResolvedValue({ session_id: 'session-1' });
    authService.verifyCode.mockResolvedValue({
      user: { firstName: 'Анна', lastName: 'Петрова' },
    });
    authService.register.mockResolvedValue({
      user: { id: 'user-1', firstName: 'Анна', lastName: 'Петрова' },
    });
    acceptCompanyInvitation.mockResolvedValue({
      id: 'membership-1',
      organizationId: 'org-1',
      role: 'ANALYST',
      company: { title: 'ООО Тест' },
    });
  });

  test('allows entering an email when the invitation does not contain one', async () => {
    getCompanyInvitation.mockResolvedValue({
      company: { title: 'ООО Тест' },
      role: 'ANALYST',
      name: 'Анна Петрова',
      email: '',
    });

    renderInvitation();
    await advanceToProfile();

    const email = screen.getByPlaceholderText('you@company.ru');
    expect(email).not.toHaveAttribute('readonly');

    fireEvent.change(email, { target: { value: 'anna@example.test' } });
    expect(email).toHaveValue('anna@example.test');
  });

  test('keeps an invitation email locked when it was provided by the inviter', async () => {
    getCompanyInvitation.mockResolvedValue({
      company: { title: 'ООО Тест' },
      role: 'ANALYST',
      name: 'Анна Петрова',
      email: 'invite@example.test',
    });

    renderInvitation();
    await advanceToProfile();

    const email = screen.getByDisplayValue('invite@example.test');
    expect(email).toHaveAttribute('readonly');
  });
});
