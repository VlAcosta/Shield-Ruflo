import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  APPEARANCE_EVENT,
  APPEARANCE_MODES,
  APPEARANCE_STORAGE_KEY,
  getAppearanceMode,
  resolveAppearanceTheme,
  setAppearanceMode as persistAppearanceMode,
} from '../../../services/appearance/appearanceService';

export default function useAppearance({ applyDocument = false } = {}) {
  const [mode, setModeState] = useState(getAppearanceMode);
  const [systemTheme, setSystemTheme] = useState(() => resolveAppearanceTheme(APPEARANCE_MODES.system));
  const resolvedTheme = useMemo(
    () => (mode === APPEARANCE_MODES.system ? systemTheme : mode),
    [mode, systemTheme]
  );

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const update = () => setSystemTheme(media.matches ? APPEARANCE_MODES.dark : APPEARANCE_MODES.light);
    update();
    if (typeof media.addEventListener === 'function') media.addEventListener('change', update);
    else media.addListener(update);
    return () => {
      if (typeof media.removeEventListener === 'function') media.removeEventListener('change', update);
      else media.removeListener(update);
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const handleAppearance = (event) => {
      if (event?.detail?.mode) setModeState(event.detail.mode);
      else setModeState(getAppearanceMode());
    };
    const handleStorage = (event) => {
      if (!event.key || !event.key.includes(APPEARANCE_STORAGE_KEY)) return;
      setModeState(getAppearanceMode());
    };

    window.addEventListener(APPEARANCE_EVENT, handleAppearance);
    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener(APPEARANCE_EVENT, handleAppearance);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  useEffect(() => {
    if (!applyDocument || typeof document === 'undefined') return undefined;
    const dark = resolvedTheme === APPEARANCE_MODES.dark;
    document.body.classList.toggle('portal-dark-active', dark);
    document.documentElement.dataset.bsTheme = resolvedTheme;
    document.documentElement.dataset.bsAppearance = mode;
    document.documentElement.style.colorScheme = resolvedTheme;

    return () => {
      document.body.classList.remove('portal-dark-active');
      document.documentElement.removeAttribute('data-bs-theme');
      document.documentElement.removeAttribute('data-bs-appearance');
      document.documentElement.style.removeProperty('color-scheme');
    };
  }, [applyDocument, mode, resolvedTheme]);

  const setMode = useCallback((nextMode) => {
    persistAppearanceMode(nextMode);
  }, []);

  const toggleResolvedTheme = useCallback(() => {
    persistAppearanceMode(
      resolvedTheme === APPEARANCE_MODES.dark ? APPEARANCE_MODES.light : APPEARANCE_MODES.dark
    );
  }, [resolvedTheme]);

  return {
    mode,
    resolvedTheme,
    isDark: resolvedTheme === APPEARANCE_MODES.dark,
    isSystem: mode === APPEARANCE_MODES.system,
    systemTheme,
    setMode,
    toggleResolvedTheme,
  };
}
