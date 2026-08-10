import { describe, expect, it, vi } from 'vitest';
import {
  GoogleBusinessReviewsClient,
  googleStarRating,
} from '../src/modules/integrations/providers/google/google-business-profile.reviews.js';

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('P17 Google Business Profile reviews transport', () => {
  it('requests one provider page with the documented max page size and page token', async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      expect(url.origin + url.pathname).toBe('https://mybusiness.googleapis.com/v4/accounts/account_1/locations/location_1/reviews');
      expect(url.searchParams.get('pageSize')).toBe('50');
      expect(url.searchParams.get('pageToken')).toBe('opaque-next-page');
      expect(new Headers(init?.headers).get('authorization')).toBe('Bearer access-token');
      return response({
        reviews: [{
          name: 'accounts/account_1/locations/location_1/reviews/review_1',
          reviewId: 'review_1',
          reviewer: { displayName: 'Анна', profilePhotoUrl: 'https://example.test/avatar.jpg' },
          starRating: 'FIVE',
          comment: 'Отлично',
          createTime: '2026-08-01T10:00:00Z',
          updateTime: '2026-08-01T10:00:00Z',
        }],
        nextPageToken: 'provider-page-2',
        totalReviewCount: 61,
        averageRating: 4.8,
      });
    }) as unknown as typeof fetch;

    const client = new GoogleBusinessReviewsClient({ timeoutMs: 5_000, fetcher });
    await expect(client.listReviewsPage(
      'access-token',
      'accounts/account_1/locations/location_1',
      'opaque-next-page',
    )).resolves.toEqual(expect.objectContaining({
      nextPageToken: 'provider-page-2',
      totalReviewCount: 61,
      averageRating: 4.8,
      reviews: [expect.objectContaining({ reviewId: 'review_1', starRating: 'FIVE' })],
    }));
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('maps Google star rating enums to canonical numeric ratings', () => {
    expect(googleStarRating('ONE')).toBe(1);
    expect(googleStarRating('TWO')).toBe(2);
    expect(googleStarRating('THREE')).toBe(3);
    expect(googleStarRating('FOUR')).toBe(4);
    expect(googleStarRating('FIVE')).toBe(5);
    expect(googleStarRating('UNKNOWN')).toBeNull();
    expect(googleStarRating(undefined)).toBeNull();
  });

  it('sanitizes provider authorization and rate-limit failures', async () => {
    const forbidden = new GoogleBusinessReviewsClient({
      timeoutMs: 5_000,
      fetcher: vi.fn(async () => response({ error: { message: 'token=do-not-leak' } }, 403)) as unknown as typeof fetch,
    });
    await expect(forbidden.listReviewsPage('access-token-secret', 'accounts/a/locations/l')).rejects.toMatchObject({
      code: 'GOOGLE_REVIEWS_ACCESS_DENIED',
      statusCode: 403,
      retryable: false,
    });

    const limited = new GoogleBusinessReviewsClient({
      timeoutMs: 5_000,
      fetcher: vi.fn(async () => response({ error: { message: 'quota secret dump' } }, 429)) as unknown as typeof fetch,
    });
    await expect(limited.listReviewsPage('access-token-secret', 'accounts/a/locations/l')).rejects.toMatchObject({
      code: 'GOOGLE_REVIEWS_RATE_LIMITED',
      statusCode: 429,
      retryable: true,
    });

    try {
      await forbidden.listReviewsPage('access-token-secret', 'accounts/a/locations/l');
    } catch (error) {
      expect(String((error as Error).message)).not.toContain('access-token-secret');
      expect(String((error as Error).message)).not.toContain('do-not-leak');
    }
  });

  it('rejects malformed provider parent paths before any network request', async () => {
    const fetcher = vi.fn() as unknown as typeof fetch;
    const client = new GoogleBusinessReviewsClient({ timeoutMs: 5_000, fetcher });
    await expect(client.listReviewsPage('token', 'locations/location_1')).rejects.toMatchObject({
      code: 'GOOGLE_REVIEW_PARENT_INVALID',
      statusCode: 400,
    });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
