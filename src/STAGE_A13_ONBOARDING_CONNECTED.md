# Stage A13 — Onboarding Connected

Этот этап связывает первичную настройку с реальным состоянием пользовательского кабинета.

## Что изменено

### Организация → Профиль компании
- данные подтверждённой организации переносятся в `business-shield:profile:snapshot:v1`;
- синхронизируются название, ИНН, КПП, ОГРН, юридический адрес, дата регистрации, статус и источник;
- профиль компании показывает статус подтверждения и источник реестровых данных;
- старый ключ `organization` остаётся зеркалом для header/существующих хуков;
- при подключённом `REACT_APP_PROFILE_ENDPOINT` выполняется best-effort PATCH `/company`, но сбой API не блокирует завершение onboarding.

### Интеграции → Dashboard
- введён единый каталог интеграций;
- настройки сохраняются в `business-shield:integrations:v1`;
- legacy `connectedIntegrations` поддерживается для совместимости;
- Dashboard получает реальные названия, категории, ссылки и статусы площадок;
- изменения распространяются через `business-shield:integrations-changed` без перезагрузки.

### Безопасность → глобальная автоблокировка
- выбранные параметры сохраняются в `business-shield:pin-preferences:v1`;
- PortalLayout запускает inactivity timer только после завершённого onboarding и разблокированного PIN;
- учитываются keyboard/pointer/wheel/touch activity и возвращение во вкладку;
- после таймаута кабинет блокируется и показывает причину блокировки;
- Профиль → Безопасность теперь позволяет изменять автоблокировку и период 5/15/30/60 минут; изменения применяются сразу.

## Итоговая последовательность

`Onboarding → Organization → Integrations → Security → applyOnboardingConfiguration → Dashboard`

При завершении создаётся технический снимок:

`business-shield:onboarding:configuration:v1`

Он содержит дату завершения, организацию, список интеграций и политику безопасности.

## События
- `business-shield:profile-changed`
- `business-shield:organization-changed`
- `business-shield:integrations-changed`
- `business-shield:security-preferences-changed`
- `business-shield:onboarding-completed`

## Проверки
- JS/JSX TypeScript parser
- относительные импорты
- баланс SCSS/CSS фигурных скобок
