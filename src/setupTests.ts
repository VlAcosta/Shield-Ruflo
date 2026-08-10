import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

declare global {
  // Transitional Jest-compatible facade for the existing CRA-era tests.
  // New tests should import `vi` directly from Vitest.
  // eslint-disable-next-line no-var
  var jest: typeof vi;
}

globalThis.jest = vi;
