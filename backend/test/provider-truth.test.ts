import { beforeAll, describe, expect, it } from 'vitest';
import { registerGoogleBusinessProfileProvider } from '../src/modules/integrations/providers/google/index.js';
import { providerTruthMatrix } from '../src/modules/integrations/providers/provider.truth.js';

describe('provider capability truth matrix', () => {
  beforeAll(() => {
    registerGoogleBusinessProfileProvider();
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
        frequency: 'on_demand_job',
        retryAttempts: 5,
        dedupe: true,
      },
    });
    expect(['PRODUCTION_ADAPTER', 'ADAPTER_NOT_CONFIGURED']).toContain(google?.releaseStage);
  });

  it('never grants capabilities to planned providers without an adapter', () => {
    const plannedIds = ['yandex', '2gis', 'ozon', 'otzovik', 'wb'];
    const matrix = providerTruthMatrix();
    for (const providerId of plannedIds) {
      const provider = matrix.find((item) => item.id === providerId);
      expect(provider).toMatchObject({
        releaseStage: 'PLANNED',
        configured: false,
        connectable: false,
        capabilities: {
          reviewIngest: false,
          reviewRead: false,
          reviewReply: false,
          reviewDelete: false,
        },
        sync: { supported: false, frequency: 'unavailable', retryAttempts: null, dedupe: false },
        availability: { reasonCode: 'PROVIDER_ADAPTER_NOT_IMPLEMENTED' },
      });
    }
  });

  it('does not claim delete capability because the adapter contract has no delete method', () => {
    expect(providerTruthMatrix().every((item) => item.capabilities.reviewDelete === false)).toBe(true);
  });
});
