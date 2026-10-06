import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import LandingPage from './LandingPage';

function renderLanding() {
  return render(
    <MemoryRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/pricing" element={<h1>Выбор тарифа</h1>} />
        <Route path="/auth" element={<h1>Вход в кабинет</h1>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('landing navigation', () => {
  test('footer links point to existing sections and navigate to the pricing page', () => {
    const { container } = renderLanding();
    const footer = screen.getByRole('navigation', { name: 'Навигация внизу страницы' });
    const links = within(footer).getAllByRole('link');
    for (const link of links) {
      const href = link.getAttribute('href');
      if (href.startsWith('#')) expect(container.querySelector(href)).not.toBeNull();
    }
    fireEvent.click(within(footer).getByRole('link', { name: 'Сравнить тарифы' }));
    expect(screen.getByRole('heading', { name: 'Выбор тарифа' })).toBeInTheDocument();
  });

  test('footer login link opens the login route', () => {
    renderLanding();
    const footer = screen.getByRole('navigation', { name: 'Навигация внизу страницы' });
    const login = within(footer).getByRole('link', { name: 'Войти в кабинет' });
    expect(login).toHaveAttribute('href', '/auth?mode=login');
    fireEvent.click(login);
    expect(screen.getByRole('heading', { name: 'Вход в кабинет' })).toBeInTheDocument();
  });

  test('closed mobile menu is inert and closes after selection or Escape', () => {
    const { container } = renderLanding();
    const menu = container.querySelector('.landing-mobileMenu');
    expect(menu).toHaveAttribute('inert');
    fireEvent.click(screen.getByLabelText('Открыть меню'));
    expect(menu).not.toHaveAttribute('inert');
    fireEvent.click(within(menu).getByText('Тарифы'));
    expect(menu).toHaveAttribute('inert');
    fireEvent.click(screen.getByLabelText('Открыть меню'));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(menu).toHaveAttribute('inert');
    expect(screen.getByLabelText('Открыть меню')).toHaveAttribute('aria-expanded', 'false');
  });
});
