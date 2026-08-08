import { getRuntimeEnv, getRuntimeMode } from './runtimeEnv';

const demoFlag = String(getRuntimeEnv('ENABLE_DEMO_DATA', '')).trim().toLowerCase();
const mode = getRuntimeMode();

// Demo business data is convenient during local design work, but must never
// silently leak into production. In production it is disabled unless the
// operator explicitly opts in with REACT_APP_ENABLE_DEMO_DATA=true.
export const DEMO_DATA_ENABLED = demoFlag
  ? demoFlag === 'true'
  : mode !== 'production';

export function isDemoDataEnabled() {
  return DEMO_DATA_ENABLED;
}
