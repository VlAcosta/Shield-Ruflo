import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import BrandMark from '../../../components/brand/BrandMark';
import useAccessControl from '../hooks/useAccessControl';
import { findFirstAllowedRoute, getRoleLabel } from '../../../services/access/rbacService';
import './AccessDenied.scss';

export default function AccessDenied() {
  const navigate = useNavigate();
  const location = useLocation();
  const access = useAccessControl();
  const from = new URLSearchParams(location.search).get('from') || '';
  const fallback = findFirstAllowedRoute(access);

  return (
    <section className="access-denied">
      <div className="access-denied__ambient" aria-hidden="true"><i/><i/><i/></div>
      <div className="access-denied__card">
        <div className="access-denied__mark"><BrandMark size={54}/><span>×</span></div>
        <span className="access-denied__eyebrow">ACCESS CONTROL · 403</span>
        <h1>Этот раздел закрыт вашей ролью</h1>
        <p>
          Текущий уровень доступа — <strong>{getRoleLabel(access.roleId)}</strong>. Владелец или администратор компании может открыть нужное разрешение в разделе «Команда и доступ».
        </p>
        {from ? <div className="access-denied__route"><span>Запрошенный раздел</span><code>{from}</code></div> : null}
        <div className="access-denied__actions">
          <button type="button" onClick={() => navigate(fallback, { replace: true })}>Открыть доступный раздел</button>
          <button type="button" className="is-secondary" onClick={() => navigate('/profile')}>Мой профиль</button>
        </div>
      </div>
    </section>
  );
}
