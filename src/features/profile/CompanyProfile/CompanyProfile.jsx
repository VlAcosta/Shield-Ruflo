import React, { useEffect, useState } from 'react';
import { BuildingIcon } from '../model/icons';
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

export default function CompanyProfile({ value, busy, onSave, readOnly = false }) {
  const [form, setForm] = useState(value);

  useEffect(() => setForm(value), [value]);

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!readOnly) onSave?.(form);
  };

  return (
    <form className="company-profile" onSubmit={handleSubmit}>
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
            <div><dt>Источник</dt><dd>{value.registrySource || 'ЕГРЮЛ / ФНС'}</dd></div>
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
            />
          </label>
        ))}
      </div>

      <footer>
        <div className="company-profile__verified"><i /> {readOnly ? 'Доступ только для просмотра по вашей роли' : 'Реквизиты можно обновлять без обращения в поддержку'}</div>
        {!readOnly ? <button type="submit" disabled={busy}>{busy ? 'Сохраняем…' : 'Сохранить'}</button> : null}
      </footer>
    </form>
  );
}
