import useAppearance from '../../appearance/hooks/useAppearance';
import { APPEARANCE_MODES } from '../../../services/appearance/appearanceService';

export default function useDashboardTheme() {
  const appearance = useAppearance();
  return {
    theme: appearance.mode,
    resolvedTheme: appearance.resolvedTheme,
    isDark: appearance.isDark,
    setTheme: appearance.setMode,
    toggleTheme: appearance.toggleResolvedTheme,
    isSystem: appearance.mode === APPEARANCE_MODES.system,
  };
}
