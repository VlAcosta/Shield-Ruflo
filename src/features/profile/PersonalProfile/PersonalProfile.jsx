import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CameraIcon } from '../model/icons';
import { getInitials } from '../model/profileData';
import './PersonalProfile.scss';

function Field({ label, ...props }) {
  return (
    <label className="personal-profile__field">
      <span>{label}</span>
      <input {...props} />
    </label>
  );
}

export default function PersonalProfile({ value, busy, onSave }) {
  const fileRef = useRef(null);
  const [form, setForm] = useState(value);

  useEffect(() => {
    setForm(value);
  }, [value]);

  const initials = useMemo(
    () => getInitials(form.firstName, form.lastName),
    [form.firstName, form.lastName],
  );

  const update = (key, nextValue) => {
    setForm((current) => ({ ...current, [key]: nextValue }));
  };

  const handleAvatar = (event) => {
    const file = event.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;

    const reader = new FileReader();
    reader.onload = () => update('avatar', String(reader.result || ''));
    reader.readAsDataURL(file);
    event.target.value = '';
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    onSave(form);
  };

  return (
    <div className="personal-profile">
      <aside className="personal-profile__summary">
        <div className="personal-profile__identity">
          <div className="personal-profile__avatar-wrap">
            <div className="personal-profile__avatar">
              {form.avatar ? <img src={form.avatar} alt="" /> : initials}
            </div>
            <button
              type="button"
              className="personal-profile__camera"
              onClick={() => fileRef.current?.click()}
              aria-label="Изменить фотографию профиля"
            >
              <CameraIcon />
            </button>
            <input ref={fileRef} type="file" accept="image/*" onChange={handleAvatar} hidden />
          </div>

          <div>
            <h2>{`${form.firstName || ''} ${form.lastName || ''}`.trim() || 'Пользователь'}</h2>
            <p>{form.position || 'Пользователь кабинета'}</p>
          </div>
        </div>

        <div className="personal-profile__stats">
          <div><span>Отчётов</span><strong>{form.stats?.reports ?? 0}</strong></div>
          <div><span>Баллов</span><strong>{form.stats?.score ?? '0'}</strong></div>
          <div><span>Дней</span><strong>{form.stats?.days ?? 0}</strong></div>
        </div>

        <div className="personal-profile__note">
          <span>Профиль компании</span>
          <p>Данные используются в отчётах, приглашениях и общении с персональным менеджером.</p>
        </div>
      </aside>

      <form className="personal-profile__form" onSubmit={handleSubmit}>
        <header>
          <div>
            <span className="personal-profile__eyebrow">Профиль</span>
            <h3>Личные данные</h3>
            <p>Контактная информация и данные владельца кабинета.</p>
          </div>
          <span className="personal-profile__status"><i /> Данные защищены</span>
        </header>

        <div className="personal-profile__grid">
          <Field label="Имя" value={form.firstName || ''} onChange={(event) => update('firstName', event.target.value)} autoComplete="given-name" />
          <Field label="Фамилия" value={form.lastName || ''} onChange={(event) => update('lastName', event.target.value)} autoComplete="family-name" />
          <Field label="Email" type="email" value={form.email || ''} onChange={(event) => update('email', event.target.value)} autoComplete="email" />
          <Field label="Телефон" value={form.phone || ''} onChange={(event) => update('phone', event.target.value)} autoComplete="tel" />
          <Field label="Должность" value={form.position || ''} onChange={(event) => update('position', event.target.value)} />
          <Field label="Telegram" value={form.telegram || ''} onChange={(event) => update('telegram', event.target.value)} />
        </div>

        <footer>
          <span>Изменения применятся ко всему кабинету.</span>
          <button type="submit" disabled={busy}>
            {busy ? 'Сохраняем…' : 'Сохранить изменения'}
          </button>
        </footer>
      </form>
    </div>
  );
}
