import { describe, expect, it } from 'vitest';
import { updateLocationSchema } from './organization.schemas.js';

describe('location update schema', () => {
  it('does not synthesize is_primary for a coordinate-only patch', () => {
    const update = updateLocationSchema.parse({ latitude: null, longitude: null });

    expect(update).toEqual({ latitude: null, longitude: null });
    expect(update).not.toHaveProperty('is_primary');
  });

  it('preserves an explicitly supplied is_primary value', () => {
    expect(updateLocationSchema.parse({ is_primary: false })).toEqual({ is_primary: false });
  });
});
