import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AUTOMATIONS_CHANGED_EVENT,
  AUTOMATIONS_LOG_EVENT,
  createRuleFromTemplate,
  deleteAutomationRule,
  evaluateReviewAutomations,
  readAutomationLog,
  readAutomationRules,
  saveAutomationRule,
  toggleAutomationRule,
} from '../../../services/automations/automationService';

export default function useAutomations() {
  const [rules, setRules] = useState(readAutomationRules);
  const [log, setLog] = useState(readAutomationLog);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    const onRules = (event) => setRules(Array.isArray(event.detail) ? event.detail : readAutomationRules());
    const onLog = (event) => setLog(Array.isArray(event.detail) ? event.detail : readAutomationLog());
    window.addEventListener(AUTOMATIONS_CHANGED_EVENT, onRules);
    window.addEventListener(AUTOMATIONS_LOG_EVENT, onLog);
    return () => { window.removeEventListener(AUTOMATIONS_CHANGED_EVENT, onRules); window.removeEventListener(AUTOMATIONS_LOG_EVENT, onLog); };
  }, []);

  const save = useCallback((rule) => {
    const saved = saveAutomationRule(rule);
    setRules(readAutomationRules());
    return saved;
  }, []);
  const remove = useCallback((ruleId) => { setRules(deleteAutomationRule(ruleId)); }, []);
  const toggle = useCallback((ruleId, enabled) => { setRules(toggleAutomationRule(ruleId, enabled)); }, []);
  const runNow = useCallback(async () => { setRunning(true); try { await evaluateReviewAutomations({ reason: 'manual' }); setLog(readAutomationLog()); } finally { setRunning(false); } }, []);
  const metrics = useMemo(() => ({ total: rules.length, active: rules.filter((item) => item.enabled).length, runs: log.filter((item) => item.status === 'success').length, errors: log.filter((item) => item.status === 'error').length }), [log, rules]);

  return { rules, log, metrics, save, remove, toggle, runNow, running, fromTemplate: createRuleFromTemplate };
}
