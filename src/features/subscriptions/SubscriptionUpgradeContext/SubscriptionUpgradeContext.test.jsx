import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import SubscriptionUpgradeContext from './SubscriptionUpgradeContext';

const routerFuture = { v7_startTransition: true, v7_relativeSplatPath: true };

function renderContext(entry) {
  return render(
    <MemoryRouter future={routerFuture} initialEntries={[entry]}>
      <SubscriptionUpgradeContext />
    </MemoryRouter>,
  );
}

describe('SubscriptionUpgradeContext', () => {
  test('explains the exact constructor module for a plan-gated route', () => {
    renderContext('/subscriptions?upgrade=automations.view&from=%2Fprofile%3Ftab%3Dsystem');

    expect(screen.getByText('Для раздела «Автоматизации» нужен расширенный тариф')).toBeInTheDocument();
    expect(screen.getByText('«Автоматизации»')).toBeInTheDocument();
  });

  test('renders nothing when the page was opened normally', () => {
    renderContext('/subscriptions');
    expect(screen.queryByLabelText('Причина выбора тарифа')).not.toBeInTheDocument();
  });
});
