import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import GoogleBusinessProfileSetup from './GoogleBusinessProfileSetup';
import {
  googleBusinessAccounts,
  googleBusinessLocations,
  googleBusinessSelect,
  providerDiagnostics,
  providerSync,
  providerSyncStatus,
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
  providerSync: vi.fn(),
  providerSyncStatus: vi.fn(),
}));

describe('P17 Google Business Profile setup and review sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState({}, '', '/integrations?google=authorized&setup=account_selection_required');
    providerDiagnostics.mockResolvedValue({
      providerId: 'google-business-profile',
      status: 'DEGRADED',
      connected: true,
      adapterInstalled: true,
      credentialsExposed: false,
      lastErrorCode: null,
      lastErrorMessage: null,
      availability: { configured: true, connectable: true },
    });
    providerSyncStatus.mockResolvedValue({
      providerId: 'google-business-profile',
      accountId: 'integration-1',
      lastSyncedAt: null,
      run: null,
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
    expect(providerSyncStatus).toHaveBeenCalled();
    expect(window.location.search).toBe('');
  });

  test('queues review ingestion and displays only backend-confirmed sync counters', async () => {
    window.history.replaceState({}, '', '/integrations');
    providerDiagnostics.mockResolvedValue({
      providerId: 'google-business-profile',
      status: 'CONNECTED',
      connected: true,
      adapterInstalled: true,
      credentialsExposed: false,
      lastValidatedAt: '2026-08-10T20:00:00.000Z',
      lastErrorCode: null,
      lastErrorMessage: null,
      availability: { configured: true, connectable: true },
    });
    providerSyncStatus
      .mockResolvedValueOnce({ providerId: 'google-business-profile', accountId: 'integration-1', lastSyncedAt: null, run: null })
      .mockResolvedValue({
        providerId: 'google-business-profile',
        accountId: 'integration-1',
        lastSyncedAt: '2026-08-10T20:05:00.000Z',
        run: {
          id: 'run-1',
          status: 'SUCCESS',
          importedCount: 7,
          updatedCount: 2,
          skippedCount: 11,
          errorCount: 0,
          finishedAt: '2026-08-10T20:05:00.000Z',
        },
      });
    providerSync.mockResolvedValue({
      providerId: 'google-business-profile',
      status: 'syncing',
      run: { id: 'run-1', status: 'QUEUED', importedCount: 0, updatedCount: 0, skippedCount: 0, errorCount: 0 },
    });

    render(<GoogleBusinessProfileSetup />);
    const syncButton = await screen.findByRole('button', { name: 'Синхронизировать отзывы' });
    fireEvent.click(syncButton);

    await waitFor(() => expect(providerSync).toHaveBeenCalledWith('google'));
    await waitFor(() => expect(screen.getByText('Синхронизировано')).toBeInTheDocument());
    expect(screen.getByText('7')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('11')).toBeInTheDocument();
    expect(screen.getByText('0')).toBeInTheDocument();
    expect(screen.getByText(/Синхронизация отзывов поставлена в очередь/)).toBeInTheDocument();
  });
});
