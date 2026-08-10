import { describe, expect, it } from 'vitest';
import { listReviewsQuerySchema, replySchema, updateReviewSchema } from './reviews.schemas.js';

describe('reviews schemas', () => {
  it('normalizes pagination and CSV filters', () => {
    const parsed = listReviewsQuerySchema.parse({ status: 'new,deferred', page: '2', pageSize: '25', assignedToMe: 'true' });
    expect(parsed.status).toEqual(['new', 'deferred']);
    expect(parsed.page).toBe(2);
    expect(parsed.pageSize).toBe(25);
    expect(parsed.assignedToMe).toBe(true);
  });

  it('rejects an empty reply', () => {
    expect(() => replySchema.parse({ text: '   ' })).toThrow();
  });

  it('defaults replies to a truthful local draft', () => {
    expect(replySchema.parse({ text: 'Спасибо за отзыв' })).toEqual({
      text: 'Спасибо за отзыв',
      publish: false,
    });
  });

  it('accepts the frontend review statuses', () => {
    expect(updateReviewSchema.parse({ status: 'done', workflowStatus: 'published', tags: ['важно'] })).toEqual({
      status: 'done',
      workflowStatus: 'published',
      tags: ['важно'],
    });
  });
});
