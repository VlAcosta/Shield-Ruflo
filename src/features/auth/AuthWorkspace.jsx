import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import BrandMark from '../../components/brand/BrandMark';
import { authService } from '../../services/auth/authService';
import {
  acceptCompanyInvitation,
  getCompanyInvitation,
} from '../../services/profile/companyInvitationService';
import { getRoleLabel } from '../../services/access/rbacService';
import { getAccountScope, writeScopedJson } from '../../services/core/dataScope';
import './AuthWorkspace.scss';

const COUNTRIES = [
  { id: 'ru', label: 'Россия', dial: '+7', digits: 10, placeholder: '(999) 123-45-67' },
  { id: 'kz', label: 'Казахстан', dial: '+7', digits: 10, placeholder: '(700) 123-45-67' },
  { id: 'by', label: 'Беларусь', dial: '+375', digits: 9, placeholder: '29 123-45-67' },
];



const safeNext = (value, fallback) => {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return fallback;
  return value;
};
const onlyDigits = (value) => value.replace(/\D/g, '');
const formatTail = (value, digits) => {
  const clean = onlyDigits(value).slice(0, digits);
  if (digits === 9) {
    if (clean.length <= 2) return clean;
    if (clean.length <= 5) return `${clean.slice(0,2)} ${clean.slice(2)}`;
    if (clean.length <= 7) return `${clean.slice(0,2)} ${clean.slice(2,5)}-${clean.slice(5)}`;
    return `${clean.slice(0,2)} ${clean.slice(2,5)}-${clean.slice(5,7)}-${clean.slice(7,9)}`;
  }
  if (clean.length <= 3) return clean ? `(${clean}` : '';
  if (clean.length <= 6) return `(${clean.slice(0,3)}) ${clean.slice(3)}`;
  if (clean.length <= 8) return `(${clean.slice(0,3)}) ${clean.slice(3,6)}-${clean.slice(6)}`;
  return `(${clean.slice(0,3)}) ${clean.slice(3,6)}-${clean.slice(6,8)}-${clean.slice(8,10)}`;
};

function ArrowIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M14 7l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function AuthSide({ selectedPlan, invitation }) {
  return (
    <aside className="auth-v2__side">
      <Link to="/" className="auth-v2__brand"><BrandMark size={46} /><span><strong>БИЗНЕС ЩИТ</strong><small>reputation operating system</small></span></Link>
      <div className="auth-v2__side-copy">
        <span className="auth-v2__live"><i /> {invitation ? 'Защищённое приглашение' : 'Система работает 24/7'}</span>
        <h1>{invitation ? <>Вас пригласили<br/><em>в рабочую команду.</em></> : <>Спокойно работайте.<br/><em>Репутацию прикроем мы.</em></>}</h1>
        <p>{invitation ? `Присоединитесь к ${invitation.company?.title || 'компании'}, подтвердите телефон и настройте личный PIN. Организацию регистрировать повторно не потребуется.` : 'Один аккаунт для мониторинга отзывов, аналитики, задач, отчётов и связи с вашей командой Бизнес Щит.'}</p>
      </div>
      {invitation ? (
        <div className="auth-v2__invite-side-card">
          <span>Доступ в компанию</span>
          <strong>{invitation.company?.title || 'Компания'}</strong>
          <small>{getRoleLabel(invitation.role)}</small>
          <i>Организация уже настроена владельцем</i>
        </div>
      ) : (
        <div className="auth-v2__proof">
          <div><strong>98%</strong><span>положительных результатов</span></div>
          <div><strong>10k+</strong><span>обработанных отзывов</span></div>
          <div><strong>24/7</strong><span>мониторинг и поддержка</span></div>
        </div>
      )}
      {selectedPlan && !invitation ? <div className="auth-v2__plan"><span>Выбран тариф</span><strong>{selectedPlan.title || selectedPlan.name}</strong><small>{selectedPlan.total ? `${Number(selectedPlan.total).toLocaleString('ru-RU')} ₽` : 'Условия сохранены'}</small></div> : null}
      <div className="auth-v2__orb auth-v2__orb--one" aria-hidden="true" /><div className="auth-v2__orb auth-v2__orb--two" aria-hidden="true" />
    </aside>
  );
}

function OtpInput({ code, setCode, refs }) {
  const update = (index, value) => {
    const digit = onlyDigits(value).slice(-1);
    setCode((current) => current.map((item, idx) => idx === index ? digit : item));
    if (digit && index < 3) refs.current[index + 1]?.focus();
  };
  return (
    <div className="auth-v2__otp" onPaste={(event) => {
      const pasted = onlyDigits(event.clipboardData.getData('text')).slice(0,4);
      if (!pasted) return;
      event.preventDefault();
      setCode(Array.from({ length: 4 }, (_, index) => pasted[index] || ''));
      setTimeout(() => refs.current[Math.min(pasted.length,4) - 1]?.focus(), 0);
    }}>
      {code.map((digit, index) => (
        <input key={index} ref={(node) => { refs.current[index] = node; }} value={digit}
          onChange={(event) => update(index, event.target.value)}
          onKeyDown={(event) => { if (event.key === 'Backspace' && !digit && index > 0) refs.current[index - 1]?.focus(); }}
          inputMode="numeric" autoComplete={index === 0 ? 'one-time-code' : 'off'} aria-label={`Цифра ${index + 1}`} maxLength={1} />
      ))}
    </div>
  );
}

function persistCompanyContext(invitation, membership, pin) {
  const company = invitation?.company || membership?.company || {};
  const organization = {
    type: String(company.inn || '').length === 12 ? 'ip' : 'ul',
    title: company.title || 'Компания',
    inn: company.inn || '',
    kpp: company.kpp || '',
    ogrn: company.ogrn || '',
    address: company.legalAddress || '',
    confirmed: true,
  };
  localStorage.setItem('organization', JSON.stringify(organization));
  localStorage.setItem('onboarding_completed', '1');
  localStorage.setItem('portal_pin_code', pin);
  localStorage.setItem('portal_pin_unlocked', '1');
  localStorage.removeItem('business-shield:dashboard:first-run:v1');
  writeScopedJson('business-shield:dashboard:first-run:v1', {
    version: 1,
    dismissed: true,
    workspaceOpened: true,
    updatedAt: new Date().toISOString(),
  }, { scope: getAccountScope() });
  window.dispatchEvent(new CustomEvent('business-shield:organization-changed', { detail: { organization } }));
}

export default function AuthWorkspace() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const inviteToken = params.get('invite') || '';
  const invitationMode = Boolean(inviteToken);
  const initialMode = invitationMode || params.get('mode') === 'register' ? 'register' : 'login';
  const [mode, setMode] = useState(initialMode);
  const [step, setStep] = useState('phone');
  const [country, setCountry] = useState(COUNTRIES[0]);
  const [phoneTail, setPhoneTail] = useState('');
  const [code, setCode] = useState(['','','','']);
  const [sessionId, setSessionId] = useState('');
  const [seconds, setSeconds] = useState(0);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [pin, setPin] = useState('');
  const [pinRepeat, setPinRepeat] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [successText, setSuccessText] = useState('');
  const [invitation, setInvitation] = useState(null);
  const [inviteState, setInviteState] = useState(invitationMode ? 'loading' : 'none');
  const [inviteError, setInviteError] = useState('');
  const otpRefs = useRef([]);

  const selectedPlan = useMemo(() => {
    if (invitationMode) return null;
    try { return JSON.parse(localStorage.getItem('selectedPlan') || 'null'); } catch { return null; }
  }, [invitationMode]);

  const fullPhone = `${country.dial}${onlyDigits(phoneTail).slice(0, country.digits)}`;
  const phoneReady = onlyDigits(phoneTail).length === country.digits;
  const otpReady = code.every(Boolean);
  const emailReady = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const pinReady = /^\d{4}$/.test(pin) && pin === pinRepeat;
  const profileReady = firstName.trim().length >= 2 && emailReady && accepted && (!invitationMode || pinReady);
  const next = invitationMode ? '/dashboard' : safeNext(params.get('next'), mode === 'login' ? '/dashboard' : '/onboarding');

  useEffect(() => {
    document.body.classList.add('auth-route-v2');
    return () => document.body.classList.remove('auth-route-v2');
  }, []);

  useEffect(() => {
    if (!invitationMode) return undefined;
    let alive = true;
    setInviteState('loading');
    setInviteError('');
    getCompanyInvitation(inviteToken)
      .then((value) => {
        if (!alive) return;
        setInvitation(value);
        setInviteState('ready');
        setMode('register');
        setEmail(value.email || '');
        const parts = String(value.name || '').trim().split(/\s+/).filter(Boolean);
        if (parts[0]) setFirstName(parts[0]);
        if (parts.length > 1) setLastName(parts.slice(1).join(' '));
      })
      .catch((requestError) => {
        if (!alive) return;
        setInviteState('error');
        setInviteError(requestError?.message || 'Приглашение недоступно');
      });
    return () => { alive = false; };
  }, [invitationMode, inviteToken]);

  useEffect(() => {
    if (!seconds) return undefined;
    const timer = window.setInterval(() => setSeconds((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [seconds]);

  const switchMode = (nextMode) => {
    if (invitationMode) return;
    setMode(nextMode); setStep('phone'); setError(''); setCode(['','','','']); setSuccessText('');
    const nextParams = new URLSearchParams(params); nextParams.set('mode', nextMode); setParams(nextParams, { replace: true });
  };

  const requestCode = async () => {
    if (!phoneReady || busy) return;
    setBusy(true); setError('');
    try {
      const result = await authService.requestCode({ phone: fullPhone, mode: invitationMode ? 'register' : mode, planId: selectedPlan?.id, invitationToken: inviteToken || undefined });
      setSessionId(result.session_id || result.sessionId || ''); setCode(['','','','']); setSeconds(60); setStep('otp');
      setTimeout(() => otpRefs.current[0]?.focus(), 80);
    } catch (err) { setError(err?.message || 'Не удалось отправить код'); } finally { setBusy(false); }
  };

  const verifyCode = async () => {
    if (!otpReady || busy) return;
    setBusy(true); setError('');
    try {
      const result = await authService.verifyCode({ phone: fullPhone, code: code.join(''), sessionId, mode: invitationMode ? 'register' : mode, invitationToken: inviteToken || undefined });
      if (invitationMode) {
        if (result.user?.firstName) setFirstName(result.user.firstName);
        if (result.user?.lastName) setLastName(result.user.lastName);
        if (result.user?.email && !invitation?.email) setEmail(result.user.email);
        setStep('profile');
        return;
      }
      if (result.needs_registration) {
        setError('Аккаунт с этим номером не найден. Создайте новый — номер уже подтверждён.');
        setMode('register');
        const nextParams = new URLSearchParams(params); nextParams.set('mode', 'register'); setParams(nextParams, { replace: true });
        setStep('profile');
        return;
      }
      if (mode === 'login') {
        await authService.restoreSession();
        setSuccessText('Вход выполнен. Кабинет готов к работе.'); setStep('success');
      } else setStep('profile');
    } catch (err) { setError(err?.message || 'Не удалось подтвердить код'); } finally { setBusy(false); }
  };

  const completeRegistration = async () => {
    if (!profileReady || busy) return;
    setBusy(true); setError('');
    try {
      const result = await authService.register({ phone: fullPhone, firstName: firstName.trim(), lastName: lastName.trim(), email: email.trim(), plan: selectedPlan, invitationToken: inviteToken || undefined });
      let user = result.user || { phone: fullPhone, firstName: firstName.trim(), lastName: lastName.trim(), email: email.trim(), plan: selectedPlan };

      if (invitationMode) {
        const membership = await acceptCompanyInvitation(inviteToken, user);
        user = { ...user, membership, role: membership.role };
        authService.persistSession({ user });
        persistCompanyContext(invitation, membership, pin);
        setSuccessText(`Вы присоединились к ${invitation?.company?.title || 'компании'} как ${getRoleLabel(membership.accessRoleId || membership.role)}. Рабочее пространство уже настроено.`);
      } else {
        authService.persistSession({ user });
        localStorage.removeItem('onboarding_completed');
        localStorage.removeItem('portal_pin_unlocked');
        navigate('/onboarding', { replace: true });
        return;
      }
      setStep('success');
    } catch (err) { setError(err?.message || 'Не удалось создать аккаунт'); } finally { setBusy(false); }
  };

  const finish = () => navigate(next);

  return (
    <main className={`auth-v2 ${invitationMode ? 'auth-v2--invitation' : ''}`}>
      <AuthSide selectedPlan={selectedPlan} invitation={invitation} />
      <section className="auth-v2__main">
        <Link className="auth-v2__mobile-brand" to="/"><BrandMark size={38} /><strong>БИЗНЕС ЩИТ</strong></Link>
        <div className="auth-v2__card">
          {invitationMode ? (
            <div className="auth-v2__invite-head"><span>Приглашение в команду</span><strong>{invitation?.company?.title || (inviteState === 'loading' ? 'Проверяем ссылку…' : 'Бизнес Щит')}</strong>{invitation ? <small>{getRoleLabel(invitation.role)}</small> : null}</div>
          ) : (
            <div className="auth-v2__tabs" role="tablist"><button type="button" className={mode === 'login' ? 'is-active' : ''} onClick={() => switchMode('login')}>Вход</button><button type="button" className={mode === 'register' ? 'is-active' : ''} onClick={() => switchMode('register')}>Регистрация</button></div>
          )}

          {invitationMode && inviteState === 'loading' ? <div className="auth-v2__step auth-v2__invite-loading" role="status" aria-live="polite"><span className="auth-v2__invite-loader"/><span className="auth-v2__eyebrow">Проверяем доступ</span><h2>Открываем приглашение</h2><p>Проверяем компанию, роль и срок действия ссылки.</p></div> : null}
          {invitationMode && inviteState === 'error' ? <div className="auth-v2__step auth-v2__invite-invalid" role="alert" aria-live="assertive"><span className="auth-v2__eyebrow">Ссылка недоступна</span><h2>Не удалось принять приглашение</h2><p>{inviteError}</p><Link className="auth-v2__secondary-link" to="/auth?mode=login">Перейти к обычному входу</Link></div> : null}

          {(inviteState === 'none' || inviteState === 'ready') && step === 'phone' ? (
            <div className="auth-v2__step">
              <span className="auth-v2__eyebrow">{invitationMode ? 'Шаг 1 из 3 · подтверждение' : (mode === 'login' ? 'С возвращением' : 'Новый аккаунт')}</span>
              <h2>{invitationMode ? 'Подтвердите телефон' : (mode === 'login' ? 'Войти в кабинет' : 'Создать аккаунт')}</h2>
              <p>{invitationMode ? `После SMS-кода вы получите доступ к ${invitation?.company?.title || 'рабочему пространству компании'}.` : (mode === 'login' ? 'Введите номер телефона — пришлём одноразовый код.' : 'Регистрация без пароля. Подтвердите телефон, затем заполните профиль.')}</p>
              <label className="auth-v2__field"><span>Страна</span><select value={country.id} onChange={(event) => { const nextCountry = COUNTRIES.find((item) => item.id === event.target.value); setCountry(nextCountry); setPhoneTail(''); }}><option value="ru">🇷🇺 Россия (+7)</option><option value="kz">🇰🇿 Казахстан (+7)</option><option value="by">🇧🇾 Беларусь (+375)</option></select></label>
              <label className="auth-v2__field"><span>Телефон</span><div className="auth-v2__phone"><b>{country.dial}</b><input value={formatTail(phoneTail, country.digits)} onChange={(event) => setPhoneTail(onlyDigits(event.target.value).slice(0,country.digits))} placeholder={country.placeholder} inputMode="tel" autoComplete="tel" /></div></label>
              {error ? <div className="auth-v2__error" role="alert" aria-live="assertive">{error}</div> : null}
              <button className="auth-v2__primary" type="button" disabled={!phoneReady || busy} onClick={requestCode}>{busy ? 'Отправляем…' : 'Получить код'} <ArrowIcon /></button>
              <small className="auth-v2__policy">Телефон нужен для защищённого входа и важных событий аккаунта.</small>
            </div>
          ) : null}

          {(inviteState === 'none' || inviteState === 'ready') && step === 'otp' ? (
            <div className="auth-v2__step">
              <button className="auth-v2__back" type="button" onClick={() => { setStep('phone'); setError(''); }}>← Назад</button>
              <span className="auth-v2__eyebrow">{invitationMode ? 'Шаг 2 из 3' : 'Подтверждение'}</span><h2>Введите код</h2><p>Код отправлен на <strong>{country.dial} {formatTail(phoneTail, country.digits)}</strong>.</p>
              <OtpInput code={code} setCode={setCode} refs={otpRefs} />
              {error ? <div className="auth-v2__error" role="alert" aria-live="assertive">{error}</div> : null}
              <button className="auth-v2__primary" type="button" disabled={!otpReady || busy} onClick={verifyCode}>{busy ? 'Проверяем…' : 'Подтвердить'} <ArrowIcon /></button>
              <button className="auth-v2__resend" type="button" disabled={seconds > 0 || busy} onClick={requestCode}>{seconds > 0 ? `Отправить повторно через ${seconds} сек.` : 'Отправить код повторно'}</button>
            </div>
          ) : null}

          {(inviteState === 'none' || inviteState === 'ready') && step === 'profile' ? (
            <div className="auth-v2__step">
              <span className="auth-v2__eyebrow">{invitationMode ? 'Шаг 3 из 3 · личный доступ' : 'Профиль'}</span><h2>{invitationMode ? 'Завершите подключение' : 'Как к вам обращаться?'}</h2><p>{invitationMode ? `Данные относятся только к вашему профилю внутри ${invitation?.company?.title || 'компании'}.` : 'Эти данные увидит ваша команда и персональный менеджер.'}</p>
              <div className="auth-v2__two-cols"><label className="auth-v2__field"><span>Имя *</span><input value={firstName} onChange={(event) => setFirstName(event.target.value)} autoComplete="given-name" placeholder="Алексей" /></label><label className="auth-v2__field"><span>Фамилия</span><input value={lastName} onChange={(event) => setLastName(event.target.value)} autoComplete="family-name" placeholder="Иванов" /></label></div>
              <label className="auth-v2__field"><span>Email *</span><input value={email} onChange={(event) => !invitationMode && setEmail(event.target.value)} readOnly={invitationMode} autoComplete="email" type="email" placeholder="you@company.ru" /></label>
              {invitationMode ? <div className="auth-v2__pin-grid"><label className="auth-v2__field"><span>Личный PIN *</span><input value={pin} onChange={(event) => setPin(onlyDigits(event.target.value).slice(0,4))} inputMode="numeric" type="password" autoComplete="new-password" placeholder="4 цифры" maxLength={4} /></label><label className="auth-v2__field"><span>Повторите PIN *</span><input value={pinRepeat} onChange={(event) => setPinRepeat(onlyDigits(event.target.value).slice(0,4))} inputMode="numeric" type="password" autoComplete="new-password" placeholder="••••" maxLength={4} /></label>{pinRepeat && !pinReady ? <small className="auth-v2__pin-error">PIN должен состоять из 4 одинаково введённых цифр</small> : null}</div> : null}
              <label className="auth-v2__checkbox"><input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} /><span>Я принимаю условия использования и политику конфиденциальности</span></label>
              {error ? <div className="auth-v2__error" role="alert" aria-live="assertive">{error}</div> : null}
              <button className="auth-v2__primary" type="button" disabled={!profileReady || busy} onClick={completeRegistration}>{busy ? (invitationMode ? 'Подключаем к компании…' : 'Создаём аккаунт…') : (invitationMode ? 'Войти в компанию' : 'Создать аккаунт')} <ArrowIcon /></button>
            </div>
          ) : null}

          {(inviteState === 'none' || inviteState === 'ready') && step === 'success' ? (
            <div className="auth-v2__step auth-v2__success"><div className="auth-v2__success-icon"><BrandMark size={70} /></div><span className="auth-v2__eyebrow">Готово</span><h2>{invitationMode ? 'Доступ активирован' : (mode === 'login' ? 'Добро пожаловать' : 'Аккаунт создан')}</h2><p>{successText}</p><button className="auth-v2__primary" type="button" onClick={finish}>{invitationMode ? 'Открыть кабинет компании' : (next.startsWith('/pricing') ? 'Вернуться к оформлению' : 'Продолжить')} <ArrowIcon /></button></div>
          ) : null}
        </div>
        <div className="auth-v2__bottom"><Link to="/">← Главная</Link><span>{invitationMode ? 'Персональное приглашение · защищённый вход' : 'Защищённый вход · одноразовый код'}</span></div>
      </section>
    </main>
  );
}
