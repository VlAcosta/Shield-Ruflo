import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { agencyService } from '../../services/agency/agencyService';
import useAccessControl from '../access/hooks/useAccessControl';
import './AgencyInvitationAcceptWorkspace.scss';

export default function AgencyInvitationAcceptWorkspace() {
  const { token = '' } = useParams();
  const access = useAccessControl();
  const canAccept = access.can('team.manage') && access.accessMode === 'DIRECT';
  const [state, setState] = useState('ready');
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  useEffect(() => {
    setState('ready');
    setError('');
    setResult(null);
  }, [token]);

  const accept = async () => {
    if (!canAccept || state === 'submitting') return;
    setState('submitting');
    setError('');
    try {
      const response = await agencyService.acceptInvitation(token);
      setResult(response);
      setState('success');
    } catch (requestError) {
      setError(requestError?.message || 'Не удалось принять приглашение');
      setState('error');
    }
  };

  return (
    <section className="agency-consent">
      <div className="agency-consent__card">
        <span className="agency-consent__eyebrow">Защищённый доступ</span>
        <h2>Подтверждение агентского доступа</h2>
        <p>
          Доступ не включается автоматически. После подтверждения агентство получит только те права,
          которые были перечислены в одноразовом приглашении. Административные права на оплату,
          команду и интеграции не делегируются.
        </p>

        {!canAccept && state !== 'success' ? (
          <div className="agency-consent__notice is-warning" role="alert">
            <strong>Нужен прямой административный доступ</strong>
            <span>Откройте ссылку в клиентском рабочем пространстве под владельцем или участником с правом управления командой.</span>
          </div>
        ) : null}

        {error ? <div className="agency-consent__notice is-error" role="alert">{error}</div> : null}

        {state === 'success' && result ? (
          <div className="agency-consent__success">
            <span aria-hidden="true">✓</span>
            <div>
              <strong>Агентский доступ подтверждён</strong>
              <p>Связь активирована. Вы можете отозвать её со стороны клиента в любой момент.</p>
              <div className="agency-consent__scopes">
                {(result.grant?.permissions || []).map((permission) => <code key={permission}>{permission}</code>)}
              </div>
            </div>
          </div>
        ) : (
          <div className="agency-consent__actions">
            <button type="button" onClick={accept} disabled={!canAccept || state === 'submitting' || !token}>
              {state === 'submitting' ? 'Подтверждаем…' : 'Подтвердить доступ'}
            </button>
            <Link to="/profile">Проверить организацию</Link>
          </div>
        )}
      </div>
    </section>
  );
}
