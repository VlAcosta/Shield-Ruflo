import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AUTOMATIONS_CHANGED_EVENT,
  AUTOMATIONS_LOG_EVENT,
  createRuleFromTemplate,
  deleteAutomationRule,
  evaluateReviewAutomations,
  fetchAutomationSnapshot,
  readAutomationLog,
  readAutomationRules,
  saveAutomationRule,
  toggleAutomationRule,
} from '../../../services/automations/automationService';

export default function useAutomations() {
  const [rules, setRules] = useState(readAutomationRules);
  const [log, setLog] = useState(readAutomationLog);
  const [running, setRunning] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const snapshot = await fetchAutomationSnapshot();
      setRules(snapshot.rules);
      setLog(snapshot.log);
    } catch (loadError) {
      setError(loadError?.message || 'Не удалось загрузить автоматизации');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
    const onRules = (event) => setRules(Array.isArray(event.detail) ? event.detail : readAutomationRules());
    const onLog = (event) => setLog(Array.isArray(event.detail) ? event.detail : readAutomationLog());
    window.addEventListener(AUTOMATIONS_CHANGED_EVENT, onRules);
    window.addEventListener(AUTOMATIONS_LOG_EVENT, onLog);
    return () => {
      window.removeEventListener(AUTOMATIONS_CHANGED_EVENT, onRules);
      window.removeEventListener(AUTOMATIONS_LOG_EVENT, onLog);
    };
  }, [reload]);

  const save = useCallback(async (rule) => {
    const saved = await saveAutomationRule(rule);
    setRules(readAutomationRules());
    setLog(readAutomationLog());
    return saved;
  }, []);

  const remove = useCallback(async (ruleId) => {
    setRules(await deleteAutomationRule(ruleId));
    setLog(readAutomationLog());
  }, []);

  const toggle = useCallback(async (ruleId, enabled) => {
    setRules(await toggleAutomationRule(ruleId, enabled));
    setLog(readAutomationLog());
  }, []);

  const runNow = useCallback(async () => {
    setRunning(true);
    setError('');
    try {
      await evaluateReviewAutomations({ reason: 'manual' });
      setRules(readAutomationRules());
      setLog(readAutomationLog());
    } catch (runError) {
      setError(runError?.message || 'Не удалось запустить проверку правил');
    } finally {
      setRunning(false);
    }
  }, []);

  const metrics = useMemo(() => ({
    total: rules.length,
    active: rules.filter((item) => item.enabled).length,
    runs: log.filter((item) => item.status === 'success').length,
    errors: log.filter((item) => item.status === 'error').length,
  }), [log, rules]);

  return {
    rules,
    log,
    metrics,
    save,
    remove,
    toggle,
    runNow,
    running,
    loading,
    error,
    reload,
    fromTemplate: createRuleFromTemplate,
  };
}
