from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text(encoding='utf-8')


def write(path, text):
    (ROOT / path).write_text(text, encoding='utf-8')


def replace_once(path, old, new):
    text = read(path)
    if new in text:
        return
    if old not in text:
        raise RuntimeError(f'anchor not found in {path}: {old[:140]!r}')
    write(path, text.replace(old, new, 1))


# Registration should enter organization setup immediately after the profile is persisted.
replace_once(
    'src/features/auth/AuthWorkspace.jsx',
    "      } else {\n        authService.persistSession({ user });\n        localStorage.removeItem('onboarding_completed');\n        localStorage.removeItem('portal_pin_unlocked');\n        setSuccessText('Аккаунт создан. Осталось настроить рабочее пространство.');\n      }\n      setStep('success');",
    "      } else {\n        authService.persistSession({ user });\n        localStorage.removeItem('onboarding_completed');\n        localStorage.removeItem('portal_pin_unlocked');\n        navigate('/onboarding', { replace: true });\n        return;\n      }\n      setStep('success');",
)

# Company lookup now passes the selected identity and supports the SMZ route.
replace_once(
    'src/features/onboarding/OnboardingWorkspace/OnboardingWorkspace.jsx',
    "      const result = await lookupOrganizationByInn(organization.inn);",
    "      const result = await lookupOrganizationByInn(organization.inn, organization.type);",
)
replace_once(
    'src/features/onboarding/OnboardingWorkspace/OnboardingWorkspace.jsx',
    "          type: found.type === 'ip' ? 'ip' : 'ul',\n          title: found.shortTitle || found.title || '',",
    "          type: found.type === 'smz' ? 'smz' : (found.type === 'ip' ? 'ip' : 'ul'),\n          title: found.type === 'smz' ? '' : (found.shortTitle || found.title || ''),",
)
replace_once(
    'src/features/onboarding/OnboardingWorkspace/OnboardingWorkspace.jsx',
    "      setManualMode(false);",
    "      setManualMode(found.type === 'smz');",
)
replace_once(
    'src/features/onboarding/OnboardingWorkspace/OnboardingWorkspace.jsx',
    "  const manualReady = Boolean(organization.title.trim())\n    && validInn\n    && (organization.type === 'ip' ? organization.ogrn.length === 15 : organization.kpp.length === 9);",
    "  const manualReady = Boolean(organization.title.trim())\n    && validInn\n    && (organization.type === 'smz' ? true : (organization.type === 'ip' ? organization.ogrn.length === 15 : organization.kpp.length === 9));",
)
replace_once(
    'src/features/onboarding/OnboardingWorkspace/OnboardingWorkspace.jsx',
    "            <button\n              type=\"button\"\n              className={organization.type === 'ip' ? 'is-active' : ''}\n              onClick={() => invalidateConfirmation({ type: 'ip', inn: '', kpp: '', ogrn: '', title: '' })}\n            >\n              <strong>ИП</strong><span>ИНН 12 цифр</span>\n            </button>\n          </div>",
    "            <button\n              type=\"button\"\n              className={organization.type === 'ip' ? 'is-active' : ''}\n              onClick={() => invalidateConfirmation({ type: 'ip', inn: '', kpp: '', ogrn: '', title: '' })}\n            >\n              <strong>ИП</strong><span>ИНН 12 цифр</span>\n            </button>\n            <button\n              type=\"button\"\n              className={organization.type === 'smz' ? 'is-active' : ''}\n              onClick={() => invalidateConfirmation({ type: 'smz', inn: '', kpp: '', ogrn: '', title: '' })}\n            >\n              <strong>Самозанятый</strong><span>НПД · маркетплейсы</span>\n            </button>\n          </div>",
)
replace_once(
    'src/features/onboarding/OnboardingWorkspace/OnboardingWorkspace.jsx',
    "        <h2>{manualMode ? 'Заполните реквизиты вручную' : 'Найдём вашу организацию по ИНН'}</h2>\n        <p>{manualMode ? 'Используйте ручной режим, если поиск временно недоступен.' : 'Введите ИНН — остальные официальные данные попробуем получить автоматически.'}</p>",
    "        <h2>{organization.type === 'smz' ? 'Подключим самозанятого к Бизнес Щит' : (manualMode ? 'Заполните реквизиты вручную' : 'Найдём вашу организацию по ИНН')}</h2>\n        <p>{organization.type === 'smz' ? 'Проверим действующий статус НПД в ФНС, затем попросим только название магазина или бренда.' : (manualMode ? 'Используйте ручной режим, если поиск временно недоступен.' : 'Введите ИНН — реквизиты ЕГРЮЛ/ЕГРИП получим автоматически.')}</p>",
)
replace_once(
    'src/features/onboarding/OnboardingWorkspace/OnboardingWorkspace.jsx',
    "                <strong>{lookupState.loading ? 'Ищем организацию…' : 'Найти организацию'}</strong>\n                <small>Поиск через настроенный серверный источник</small>",
    "                <strong>{lookupState.loading ? 'Проверяем данные…' : (organization.type === 'smz' ? 'Проверить статус НПД' : 'Найти организацию')}</strong>\n                <small>{organization.type === 'smz' ? 'Официальная проверка ФНС' : 'ЕГРЮЛ / ЕГРИП'}</small>",
)
replace_once(
    'src/features/onboarding/OnboardingWorkspace/OnboardingWorkspace.jsx',
    "            <div className=\"organization-manualFields\">\n              <label className=\"onboarding-field\">\n                <span>Наименование</span>\n                <input value={organization.title} onChange={(event) => invalidateConfirmation({ title: event.target.value })} placeholder=\"ООО «Название»\" />\n              </label>",
    "            <div className=\"organization-manualFields\">\n              {organization.type === 'smz' && organization.status ? (\n                <div className=\"organization-npd-status\"><Icon name=\"check\" size={15} /><span><strong>Статус НПД подтверждён</strong><small>{organization.status}</small></span></div>\n              ) : null}\n              <label className=\"onboarding-field\">\n                <span>{organization.type === 'smz' ? 'Название магазина / бренда' : 'Наименование'}</span>\n                <input value={organization.title} onChange={(event) => invalidateConfirmation({ title: event.target.value })} placeholder={organization.type === 'smz' ? 'Например, Acosta Store' : 'ООО «Название»'} />\n              </label>",
)
replace_once(
    'src/features/onboarding/OnboardingWorkspace/OnboardingWorkspace.jsx',
    "              {organization.type === 'ul' ? (\n                <label className=\"onboarding-field\">\n                  <span>КПП</span>\n                  <input value={organization.kpp} onChange={(event) => invalidateConfirmation({ kpp: onlyDigits(event.target.value, 9) })} inputMode=\"numeric\" placeholder=\"9 цифр\" />\n                </label>\n              ) : (\n                <label className=\"onboarding-field\">\n                  <span>ОГРН</span>\n                  <input value={organization.ogrn} onChange={(event) => invalidateConfirmation({ ogrn: onlyDigits(event.target.value, 15) })} inputMode=\"numeric\" placeholder=\"15 цифр\" />\n                </label>\n              )}",
    "              {organization.type === 'ul' ? (\n                <label className=\"onboarding-field\">\n                  <span>КПП</span>\n                  <input value={organization.kpp} onChange={(event) => invalidateConfirmation({ kpp: onlyDigits(event.target.value, 9) })} inputMode=\"numeric\" placeholder=\"9 цифр\" />\n                </label>\n              ) : organization.type === 'ip' ? (\n                <label className=\"onboarding-field\">\n                  <span>ОГРН</span>\n                  <input value={organization.ogrn} onChange={(event) => invalidateConfirmation({ ogrn: onlyDigits(event.target.value, 15) })} inputMode=\"numeric\" placeholder=\"15 цифр\" />\n                </label>\n              ) : null}",
)
replace_once(
    'src/features/onboarding/OnboardingWorkspace/OnboardingWorkspace.jsx',
    "        <div><dt>ОГРН</dt><dd>{organization.ogrn || '—'}</dd></div>",
    "        {organization.ogrn ? <div><dt>ОГРН</dt><dd>{organization.ogrn}</dd></div> : null}",
)

# Billing hook: make the one-time PRO trial an actual user action.
replace_once(
    'src/features/subscriptions/hooks/useSubscriptions.js',
    "import { recordCompanyActivity } from '../../../services/activity/companyActivityService';",
    "import { recordCompanyActivity } from '../../../services/activity/companyActivityService';\nimport { startProTrial as requestProTrial } from '../../../services/subscriptions/subscriptionTrialService';",
)
replace_once(
    'src/features/subscriptions/hooks/useSubscriptions.js',
    "  const [busy, setBusy] = useState({ renewal: false, promo: false, checkout: false });",
    "  const [busy, setBusy] = useState({ renewal: false, promo: false, checkout: false, trial: false });",
)
replace_once(
    'src/features/subscriptions/hooks/useSubscriptions.js',
    "  const downloadReceipt = useCallback(async (payment) => {",
    "  const startTrial = useCallback(async () => {\n    if (busy.trial || !snapshot?.trial?.available) return;\n    setBusy((current) => ({ ...current, trial: true }));\n    try {\n      const nextSnapshot = await requestProTrial();\n      setSnapshot(nextSnapshot);\n      setCart({});\n      showNotice('PRO активирован на 14 дней');\n      recordCompanyActivity({ type: 'billing_trial', title: 'Активировал PRO на 14 дней', route: '/subscriptions', tone: 'violet' });\n    } catch (trialError) {\n      showNotice(trialError?.message || 'Не удалось активировать пробный период', 'error');\n    } finally {\n      if (mountedRef.current) setBusy((current) => ({ ...current, trial: false }));\n    }\n  }, [busy.trial, showNotice, snapshot?.trial?.available]);\n\n  const downloadReceipt = useCallback(async (payment) => {",
)
replace_once(
    'src/features/subscriptions/hooks/useSubscriptions.js',
    "    checkout,\n    downloadReceipt,",
    "    checkout,\n    startTrial,\n    downloadReceipt,",
)

# Recovery styles are isolated from the older large SCSS files.
replace_once(
    'src/features/onboarding/OnboardingWorkspace/OnboardingWorkspace.jsx',
    "import './OnboardingWorkspace.scss';",
    "import './OnboardingWorkspace.scss';\nimport './OnboardingRecovery.scss';",
)
replace_once(
    'src/features/subscriptions/SubscriptionsWorkspace/SubscriptionsWorkspace.jsx',
    "import './SubscriptionsWorkspace.scss';",
    "import './SubscriptionsWorkspace.scss';\nimport './SubscriptionsRecovery.scss';",
)

print('production UX frontend patch applied')
