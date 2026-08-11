import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import BrandMark from '../../../components/brand/BrandMark';
import useAccessControl from '../hooks/useAccessControl';
import { findFirstAllowedRoute, getRoleLabel, getRoutePermission } from '../../../services/access/rbacService';
import { getPermissionAccessState } from '../../../services/access/planAccessService';
import './AccessDenied.scss';

export default function AccessDenied() {
  const navigate = useNavigate();
  const location = useLocation();
  const access = useAccessControl();
  const params = new URLSearchParams(location.search);
  const from = params.get('from') || '';
  const fallback = findFirstAllowedRoute(access);
  const permission = getRoutePermission(from);
  const accessState = permission ? getPermissionAccessState(permission, access) : 'role_denied';
  const planLocked = accessState === 'plan_locked';
  const canViewBilling = access.can('billing.view');

  const openPlans = () => {
    const upgradeParams = new URLSearchParams();
    if (permission) upgradeParams.set('upgrade', permission);
    if (from) upgradeParams.set('from', from);
    navigate(`/subscriptions?${upgradeParams.toString()}`);
  };

  return (
    <section className={`access-denied ${planLocked ? 'access-denied--plan' : ''}`}>
      <div className="access-denied__ambient" aria-hidden="true"><i/><i/><i/></div>
      <div className="access-denied__card">
        <div className="access-denied__mark">
          <BrandMark size={54}/>
          <span>{planLocked ? 'PRO' : '×'}</span>
        </div>
        <span className="access-denied__eyebrow">{planLocked ? 'PLAN ACCESS · PRO' : 'ACCESS CONTROL · 403'}</span>
        <h1>{planLocked ? 'Функция доступна в PRO' : 'Этот раздел закрыт вашей ролью'}</h1>
        {planLocked ? (
          <p>
            Ваша роль <strong>{getRoleLabel(access.roleId)}</strong> может работать с этим разделом, но текущий тариф организации его не включает. Доступ можно открыть сменой тарифа — права команды при этом не расширяются.
          </p>
        ) : (
          <p>
            Текущий уровень доступа — <strong>{getRoleLabel(access.roleId)}</strong>. Владелец или администратор компании может открыть нужное разрешение в разделе «Команда и доступ».
          </p>
        )}
        {from ? <div className="access-denied__route"><span>Запрошенный раздел</span><code>{from}</code></div> : null}
        <div className="access-denied__actions">
          {planLocked && canViewBilling ? (
            <button type="button" onClick={openPlans}>Посмотреть тарифы</button>
          ) : (
            <button type="button" onClick={() => navigate(fallback, { replace: true })}>Открыть доступный раздел</button>
          )}
          <button type="button" className="is-secondary" onClick={() => navigate(planLocked ? fallback : '/profile')}>
            {planLocked ? 'Вернуться в кабинет' : 'Мой профиль'}
          </button>
        </div>
      </div>
    </section>
  );
}
