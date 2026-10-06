import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import PricingWorkspace from './PricingWorkspace';
import { authService } from '../../services/auth/authService';
import { pricingService } from '../../services/billing/pricingService';

vi.mock('../../services/auth/authService', () => ({
  authService: {
    restoreSession: vi.fn(),
  },
}));

vi.mock('../../services/billing/pricingService', () => ({
  pricingService: {
    getCatalog: vi.fn(),
    createCheckout: vi.fn(),
  },
}));

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}{location.search}</div>;
}

function renderPricing(initialEntry = '/pricing') {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/pricing" element={<><PricingWorkspace /><LocationProbe /></>} />
        <Route path="/auth" element={<LocationProbe />} />
        <Route path="/chat" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('pricing checkout continuity', () => {
  beforeEach(() => {
    pricingService.getCatalog.mockResolvedValue([]);
    pricingService.createCheckout.mockReset();
    authService.restoreSession.mockReset();
  });

  test('preserves annual billing when registration is required before checkout', async () => {
    authService.restoreSession.mockRejectedValue({ status: 401 });

    renderPricing();

    fireEvent.click(screen.getByRole('button', { name: /За год/ }));
    fireEvent.click(screen.getByRole('button', { name: /Начать 14 дней/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Продолжить/ }));

    await waitFor(() => {
      expect(screen.getByTestId('location')).toHaveTextContent('/auth?mode=register');
    });

    const location = screen.getByTestId('location').textContent;
    const params = new URLSearchParams(location.split('?')[1] || '');
    expect(params.get('next')).toBe('/pricing?checkout=START&billing=annual');
  });

  test('restores annual billing from the checkout continuation URL', async () => {
    renderPricing('/pricing?checkout=START&billing=annual');

    expect(await screen.findByText(/Оплата за год:/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /За год/ })).toHaveClass('is-active');
  });

  test('shows a visible error when Business contact flow cannot check the session', async () => {
    authService.restoreSession.mockRejectedValue(new Error('Сервис авторизации временно недоступен'));

    renderPricing();

    fireEvent.click(screen.getByRole('button', { name: /Обсудить условия/ }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Сервис авторизации временно недоступен');
  });
});
