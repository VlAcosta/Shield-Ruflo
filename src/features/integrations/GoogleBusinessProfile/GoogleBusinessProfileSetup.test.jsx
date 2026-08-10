import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import GoogleBusinessProfileSetup from './GoogleBusinessProfileSetup';
import {
  googleBusinessAccounts,
  googleBusinessLocations,
  googleBusinessSelect,
  providerDiagnostics,
} from '../../../services/integrations/integrationProviderRegistry';

vi.mock('../../access', () => ({
  useAccessControl: () => ({ can: () => true }),
}));

vi.mock('../../../services/integrations/integrationProviderRegistry', () => ({
  googleBusinessAccounts: vi.fn(),
  googleBusinessLocations: vi.fn(),
  googleBusinessOAuthStart: vi.fn(),
  googleBusinessSelect: vi.fn(),
  providerDiagnostics: vi.fn(),
  providerDisconnect: vi.fn(),
}));

describe('P16 Google Business Profile setup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState({}, '', '/integrations?google=authorized&setup=account_selection_required');
    providerDiagnostics.mockResolvedValue({
      providerId: 'google-business-profile',
      status: 'DEGRADED',
      connected: true,
      adapterInstalled: true,
      credentialsExposed: false,
      availability: { configured: true, connectable: true },
    });
    googleBusinessAccounts.mockResolvedValue({
      accounts: [{ name: 'accounts/account_1', accountName: 'ООО Север' }],
    });
    googleBusinessLocations.mockResolvedValue({
      locations: [
        { name: 'locations/location_1', title: 'Москва', storeCode: 'MSK' },
        { name: 'locations/location_2', title: 'Тула', storeCode: 'TULA' },
      ],
    });
    googleBusinessSelect.mockResolvedValue({
      integration: {
        status: 'CONNECTED',
        lastValidatedAt: '2026-08-10T20:00:00.000Z',
        lastErrorCode: null,
        lastErrorMessage: null,
      },
    });
  });

  test('continues an authorized callback through account and location verification', async () => {
    render(<GoogleBusinessProfileSetup />);

    expect(await screen.findByText('Google подтвердил авторизацию. Завершите выбор бизнес-профиля и локаций.')).toBeInTheDocument();
    await waitFor(() => expect(googleBusinessAccounts).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(googleBusinessLocations).toHaveBeenCalledWith('accounts/account_1'));

    expect(await screen.findByText('Москва')).toBeInTheDocument();
    expect(screen.getByText('Тула')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Москва').closest('label').querySelector('input'));
    fireEvent.click(screen.getByRole('button', { name: 'Подтвердить локации' }));

    await waitFor(() => expect(googleBusinessSelect).toHaveBeenCalledWith({
      googleAccountName: 'accounts/account_1',
      locationNames: ['locations/location_1'],
    }));
    expect(await screen.findByText(/Google Business Profile подключён/)).toBeInTheDocument();
    expect(providerDiagnostics).toHaveBeenCalled();
    expect(window.location.search).toBe('');
  });
});
