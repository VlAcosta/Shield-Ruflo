import { getReviews } from './reviewsService';

const originalFetch = global.fetch;

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    url: 'http://localhost/api/v1/reviews',
    headers: {
      get: (name) =>
        String(name).toLowerCase() === 'content-type'
          ? 'application/json'
          : null,
    },
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  };
}

describe('reviewsService', () => {
  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  test('loads reviews from the production Reviews API contract', async () => {
    global.fetch = jest.fn().mockResolvedValue(
      jsonResponse({
        items: [
          {
            id: 'review-1',
            author: 'Иван Иванов',
            rating: 5,
            status: 'new',
            createdAt: '2026-08-10T10:00:00.000Z',
          },
        ],
        pagination: {
          page: 1,
          pageSize: 30,
          total: 1,
          pages: 1,
        },
      }),
    );

    const result = await getReviews();

    expect(global.fetch).toHaveBeenCalled();
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toEqual(
      expect.objectContaining({
        id: 'review-1',
        author: 'Иван Иванов',
        rating: 5,
      }),
    );

    expect(result.pagination.total).toBe(1);
  });

  test('surfaces backend failure instead of silently using fake reviews', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
      url: 'http://localhost/api/v1/reviews',
      headers: {
        get: () => 'application/json',
      },
      json: async () => ({
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: 'Reviews unavailable',
        },
      }),
      text: async () => '',
    });

    await expect(getReviews()).rejects.toMatchObject({
      status: 503,
    });
  });
});
