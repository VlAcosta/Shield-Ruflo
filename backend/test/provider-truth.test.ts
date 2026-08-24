import { beforeAll, describe, expect, it } from 'vitest';
import { registerIntegrationProviders } from '../src/modules/integrations/providers/index.js';
import { providerTruthMatrix } from '../src/modules/integrations/providers/provider.truth.js';

describe('provider capability truth matrix', () => {
  beforeAll(() => {
    registerIntegrationProviders();
  });

  it('derives Google review capabilities from the installed production adapter', () => {
    const google = providerTruthMatrix().find((item) => item.id === 'google-business-profile');
    expect(google).toBeTruthy();
    expect(google).toMatchObject({
      capabilities: {
        oauth: true,
        accountsRead: true,
        locationsRead: true,
        profileRead: true,
        reviewIngest: true,
        reviewRead: true,
        reviewReply: true,
        reviewDelete: false,
      },
      sync: {
        supported: true,
        frequency: 'scheduled_and_on_demand',
        retryAttempts: 5,
        dedupe: true,
      },
    });
    expect(['PRODUCTION_ADAPTER', 'ADAPTER_NOT_CONFIGURED']).toContain(google?.releaseStage);
  });

  it.each(['wb', 'ozon', 'yandex', 'otzovik'])('%s exposes review ingestion and reply through an installed adapter', (providerId) => {
    const provider = providerTruthMatrix().find((item) => item.id === providerId);
    expect(provider).toMatchObject({
      releaseStage: 'PRODUCTION_ADAPTER',
      configured: true,
      connectable: true,
      capabilities: {
        reviewIngest: true,
        reviewRead: true,
        reviewReply: true,
        reviewDelete: false,
      },
      sync: {
        supported: true,
        frequency: 'scheduled_and_on_demand',
        retryAttempts: 5,
        dedupe: true,
      },
    });
  });

  it('keeps 2GIS truthful: profile/statistics are available but review text is not', () => {
    const provider = providerTruthMatrix().find((item) => item.id === '2gis');
    expect(provider).toMatchObject({
      releaseStage: 'PRODUCTION_ADAPTER',
      configured: true,
      connectable: true,
      capabilities: {
        locationsRead: true,
        profileRead: true,
        reviewIngest: false,
        reviewRead: false,
        reviewReply: false,
        reviewDelete: false,
      },
      sync: {
        supported: false,
        frequency: 'unavailable',
        retryAttempts: null,
        dedupe: false,
      },
    });
  });

  it('does not claim delete capability because the adapter contract has no delete method', () => {
    expect(providerTruthMatrix().every((item) => item.capabilities.reviewDelete === false)).toBe(true);
  });
});
