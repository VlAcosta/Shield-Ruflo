import React, { useEffect, useState } from 'react';
import { BuildingIcon } from '../model/icons';
import BusinessLocationsManager from './BusinessLocationsManager';
import './CompanyProfile.scss';

const FIELDS = [
  ['title', 'Название компании'],
  ['inn', 'ИНН'],
  ['kpp', 'КПП'],
  ['ogrn', 'ОГРН'],
  ['legalAddress', 'Юридический адрес'],
  ['website', 'Веб-сайт'],
  ['industry', 'Отрасль'],
];

function validate(form) {
  const errors = {};
  if (!/^\d{10}$|^\d{12}$/.test(form.inn || '')) errors.inn = 'ИНН должен содержать 10 или 12 цифр';
  if (form.kpp && !/^\d{9}$/.test(form.kpp)) errors.kpp = 'КПП должен содержать 9 цифр';
  if (form.ogrn && !/^\d{13}$|^\d{15}$/.test(form.ogrn)) errors.ogrn = 'ОГРН должен содержать 13 или 15 цифр';
  if (form.website) {
    try { new URL(form.website); } catch { errors.website = 'Укажите полный адрес сайта, включая https://'; }
  }
  return errors;
}

export default function CompanyProfile({ value, busy, onSave, readOnly = false, canViewBusinesses = false, canManageBusinesses = false, canManageLocations = false }) {
  const [form, setForm] = useState(value);
  const errors = validate(form || {});
  const changed = FIELDS.some(([key]) => String(form?.[key] || '') !== String(value?.[key] || ''));
  const canSubmit = changed && !busy && Object.keys(errors).length === 0;

  useEffect(() => setForm(value), [value]);

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!readOnly && canSubmit) onSave?.(form);
  };

  return (
    <div className="company-profile-stack"><form className="company-profile" onSubmit={handleSubmit}>
      <header className="company-profile__header">
        <div className="company-profile__mark"><BuildingIcon /></div>
        <div>
          <span>Реквизиты</span>
          <h2>Данные компании</h2>
          <p>Информация используется в документах, отчётах и выставлении счетов.</p>
        </div>
      </header>

      {value.verified ? (
        <section className="company-profile__registry" aria-label="Статус данных организации">
          <span className="company-profile__registry-icon">✓</span>
          <div>
            <strong>{value.registryStatus || 'Организация подтверждена'}</strong>
            <p>Реквизиты перенесены из первого входа и используются во всём кабинете.</p>
          </div>
          <dl>
            {value.registrationDate ? <div><dt>Регистрация</dt><dd>{value.registrationDate}</dd></div> : null}
            <div><dt>Источник</dt><dd>{value.registrySource || 'Источник не указан'}</dd></div>
          </dl>
        </section>
      ) : null}

      <div className="company-profile__grid">
        {FIELDS.map(([key, label]) => (
          <label className={`company-profile__field ${key === 'legalAddress' ? 'company-profile__field--wide' : ''}`} key={key}>
            <span>{label}</span>
            <input
              value={form[key] || ''}
              onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))}
              readOnly={readOnly}
              aria-readonly={readOnly}
              aria-invalid={Boolean(errors[key])}
              aria-describedby={errors[key] ? `company-${key}-error` : undefined}
            />
            {errors[key] ? <small id={`company-${key}-error`} role="alert">{errors[key]}</small> : null}
          </label>
        ))}
      </div>

      <footer>
        <div className="company-profile__verified"><i /> {readOnly ? 'Доступ только для просмотра по вашей роли' : 'Реквизиты можно обновлять без обращения в поддержку'}</div>
        {!readOnly ? <button type="submit" disabled={!canSubmit}>{busy ? 'Сохраняем…' : changed ? 'Сохранить' : 'Нет изменений'}</button> : null}
      </footer>
    </form><BusinessLocationsManager canView={canViewBusinesses} canManageBusinesses={canManageBusinesses} canManageLocations={canManageLocations} /></div>
  );
}
