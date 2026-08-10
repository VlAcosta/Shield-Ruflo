import React, { useCallback, useEffect, useState } from 'react';
import { businessLocationsService } from '../../../services/organizations/businessLocationsService';

const EMPTY_BUSINESS = { name: '', industry: '', website: '', is_primary: false };
const EMPTY_LOCATION = { name: '', city: '', address_line_1: '', latitude: '', longitude: '', is_primary: false };

export default function BusinessLocationsManager({ canView, canManageBusinesses, canManageLocations }) {
  const [businesses, setBusinesses] = useState([]);
  const [state, setState] = useState('loading');
  const [message, setMessage] = useState(null);
  const [busy, setBusy] = useState('');
  const [businessForm, setBusinessForm] = useState(EMPTY_BUSINESS);
  const [locationForms, setLocationForms] = useState({});
  const [businessEdits, setBusinessEdits] = useState({});
  const [locationEdits, setLocationEdits] = useState({});

  const load = useCallback(async () => {
    if (!canView) return;
    setState('loading');
    try {
      const next = await businessLocationsService.list();
      setBusinesses(next);
      setBusinessEdits((current) => Object.fromEntries(next.map((item) => [item.id, current[item.id] || {
        name: item.name || '', industry: item.industry || '', website: item.website || '',
      }])));
      setLocationEdits((current) => Object.fromEntries(next.flatMap((item) => (item.locations || []).map((location) => [location.id, current[location.id] || {
        name: location.name || '', city: location.city || '', address_line_1: location.addressLine1 || '',
        latitude: location.latitude ?? '', longitude: location.longitude ?? '',
      }]))));
      setState('ready');
    } catch (error) {
      setMessage({ tone: 'error', text: error?.message || 'Не удалось загрузить бизнесы' });
      setState('error');
    }
  }, [canView]);

  useEffect(() => { load(); }, [load]);
  if (!canView) return null;

  const run = async (key, operation, success) => {
    setBusy(key); setMessage(null);
    try {
      await operation();
      setMessage({ tone: 'success', text: success });
      await load();
      return true;
    } catch (error) {
      setMessage({ tone: 'error', text: error?.message || 'Операция не выполнена' });
      return false;
    } finally { setBusy(''); }
  };

  const createBusiness = async (event) => {
    event.preventDefault();
    if (!businessForm.name.trim()) return;
    const saved = await run('new-business', () => businessLocationsService.createBusiness(businessForm), 'Бизнес добавлен');
    if (saved) setBusinessForm(EMPTY_BUSINESS);
  };

  const createLocation = async (event, businessId) => {
    event.preventDefault();
    const form = locationForms[businessId] || EMPTY_LOCATION;
    if (!form.name.trim()) return;
    const payload = { ...form, latitude: form.latitude === '' ? undefined : Number(form.latitude), longitude: form.longitude === '' ? undefined : Number(form.longitude) };
    const saved = await run(`new-location-${businessId}`, () => businessLocationsService.createLocation(businessId, payload), 'Филиал добавлен');
    if (saved) setLocationForms((current) => ({ ...current, [businessId]: EMPTY_LOCATION }));
  };

  if (state === 'loading') return <section className="business-manager business-manager--state" role="status">Загружаем бизнесы и филиалы…</section>;
  if (state === 'error') return <section className="business-manager business-manager--state" role="alert"><strong>Данные недоступны</strong><span>{message?.text}</span><button type="button" onClick={load}>Повторить</button></section>;

  return <section className="business-manager" aria-labelledby="business-manager-title">
    <header><div><span>Структура</span><h2 id="business-manager-title">Бизнесы и филиалы</h2><p>Основной бизнес и филиал используются по умолчанию. Новые записи активны; кнопка «Архивировать» безопасно меняет их статус.</p></div></header>
    {message ? <div className={`business-manager__notice is-${message.tone}`} role={message.tone === 'error' ? 'alert' : 'status'}>{message.text}</div> : null}
    {!businesses.length ? <div className="business-manager__empty"><strong>Бизнесы ещё не добавлены</strong><span>Создайте первый бизнес, чтобы добавить филиалы.</span></div> : null}
    <div className="business-manager__list">{businesses.map((business) => {
      const newLocation = locationForms[business.id] || EMPTY_LOCATION;
      const businessEdit = businessEdits[business.id] || EMPTY_BUSINESS;
      return <article className="business-card" key={business.id}>
        <div className="business-card__head"><div><strong>{business.name}</strong><span>{business.industry || 'Отрасль не указана'}{business.isPrimary ? ' · Основной' : ''}</span></div>{canManageBusinesses ? <div className="business-card__actions">{!business.isPrimary ? <button type="button" disabled={Boolean(busy)} onClick={() => run(`primary-${business.id}`, () => businessLocationsService.updateBusiness(business.id, { is_primary: true }), 'Основной бизнес изменён')}>Сделать основным</button> : null}<button type="button" className="is-danger" disabled={Boolean(busy)} onClick={() => window.confirm(`Архивировать «${business.name}»?`) && run(`archive-${business.id}`, () => businessLocationsService.archiveBusiness(business.id), 'Бизнес архивирован')}>Архивировать</button></div> : null}</div>
        {canManageBusinesses ? <form className="entity-edit" aria-label={`Редактирование бизнеса ${business.name}`} onSubmit={(event) => { event.preventDefault(); run(`edit-${business.id}`, () => businessLocationsService.updateBusiness(business.id, businessEdit), 'Бизнес обновлён'); }}><input aria-label="Название бизнеса" value={businessEdit.name} onChange={(event) => setBusinessEdits((current) => ({ ...current, [business.id]: { ...businessEdit, name: event.target.value } }))}/><input aria-label="Отрасль бизнеса" placeholder="Отрасль" value={businessEdit.industry} onChange={(event) => setBusinessEdits((current) => ({ ...current, [business.id]: { ...businessEdit, industry: event.target.value } }))}/><input aria-label="Сайт бизнеса" placeholder="https://example.ru" value={businessEdit.website} onChange={(event) => setBusinessEdits((current) => ({ ...current, [business.id]: { ...businessEdit, website: event.target.value } }))}/><button disabled={Boolean(busy) || !businessEdit.name.trim()}>Сохранить</button></form> : null}
        <div className="location-list">{(business.locations || []).map((location) => {
          const edit = locationEdits[location.id] || EMPTY_LOCATION;
          const editPayload = { ...edit, latitude: edit.latitude === '' ? undefined : Number(edit.latitude), longitude: edit.longitude === '' ? undefined : Number(edit.longitude) };
          return <div className="location-row-wrap" key={location.id}><div className="location-row"><div><strong>{location.name}</strong><span>{[location.city, location.addressLine1].filter(Boolean).join(', ') || 'Адрес не указан'}{location.isPrimary ? ' · Основной' : ''}</span></div>{canManageLocations ? <div>{!location.isPrimary ? <button type="button" disabled={Boolean(busy)} onClick={() => run(`primary-location-${location.id}`, () => businessLocationsService.updateLocation(location.id, { is_primary: true }), 'Основной филиал изменён')}>Основной</button> : null}<button type="button" className="is-danger" disabled={Boolean(busy)} onClick={() => window.confirm(`Архивировать филиал «${location.name}»?`) && run(`archive-location-${location.id}`, () => businessLocationsService.archiveLocation(location.id), 'Филиал архивирован')}>Архивировать</button></div> : null}</div>{canManageLocations ? <form className="entity-edit entity-edit--location" aria-label={`Редактирование филиала ${location.name}`} onSubmit={(event) => { event.preventDefault(); run(`edit-location-${location.id}`, () => businessLocationsService.updateLocation(location.id, editPayload), 'Филиал обновлён'); }}><input aria-label="Название филиала" value={edit.name} onChange={(event) => setLocationEdits((current) => ({ ...current, [location.id]: { ...edit, name: event.target.value } }))}/><input aria-label="Город филиала" value={edit.city} onChange={(event) => setLocationEdits((current) => ({ ...current, [location.id]: { ...edit, city: event.target.value } }))}/><input aria-label="Адрес филиала" value={edit.address_line_1} onChange={(event) => setLocationEdits((current) => ({ ...current, [location.id]: { ...edit, address_line_1: event.target.value } }))}/><input type="number" step="any" min="-90" max="90" aria-label="Широта филиала" placeholder="Широта" value={edit.latitude} onChange={(event) => setLocationEdits((current) => ({ ...current, [location.id]: { ...edit, latitude: event.target.value } }))}/><input type="number" step="any" min="-180" max="180" aria-label="Долгота филиала" placeholder="Долгота" value={edit.longitude} onChange={(event) => setLocationEdits((current) => ({ ...current, [location.id]: { ...edit, longitude: event.target.value } }))}/><button disabled={Boolean(busy) || !edit.name.trim()}>Сохранить</button></form> : null}</div>;
        })}{!(business.locations || []).length ? <div className="location-list__empty">У этого бизнеса пока нет филиалов.</div> : null}</div>
        {canManageLocations ? <form className="location-form" onSubmit={(event) => createLocation(event, business.id)}><input aria-label={`Название филиала для ${business.name}`} placeholder="Название филиала" value={newLocation.name} onChange={(event) => setLocationForms((current) => ({ ...current, [business.id]: { ...newLocation, name: event.target.value } }))}/><input aria-label={`Город филиала для ${business.name}`} placeholder="Город" value={newLocation.city} onChange={(event) => setLocationForms((current) => ({ ...current, [business.id]: { ...newLocation, city: event.target.value } }))}/><input aria-label={`Адрес филиала для ${business.name}`} placeholder="Адрес" value={newLocation.address_line_1} onChange={(event) => setLocationForms((current) => ({ ...current, [business.id]: { ...newLocation, address_line_1: event.target.value } }))}/><input type="number" step="any" min="-90" max="90" aria-label={`Широта филиала для ${business.name}`} placeholder="Широта" value={newLocation.latitude} onChange={(event) => setLocationForms((current) => ({ ...current, [business.id]: { ...newLocation, latitude: event.target.value } }))}/><input type="number" step="any" min="-180" max="180" aria-label={`Долгота филиала для ${business.name}`} placeholder="Долгота" value={newLocation.longitude} onChange={(event) => setLocationForms((current) => ({ ...current, [business.id]: { ...newLocation, longitude: event.target.value } }))}/><button disabled={Boolean(busy) || !newLocation.name.trim()}>Добавить филиал</button></form> : null}
      </article>;
    })}</div>
    {canManageBusinesses ? <form className="business-create" onSubmit={createBusiness}><strong>Новый бизнес</strong><div><input aria-label="Название нового бизнеса" placeholder="Название" value={businessForm.name} onChange={(event) => setBusinessForm((current) => ({ ...current, name: event.target.value }))}/><input aria-label="Отрасль нового бизнеса" placeholder="Отрасль" value={businessForm.industry} onChange={(event) => setBusinessForm((current) => ({ ...current, industry: event.target.value }))}/><input aria-label="Сайт нового бизнеса" placeholder="https://example.ru" value={businessForm.website} onChange={(event) => setBusinessForm((current) => ({ ...current, website: event.target.value }))}/><button disabled={Boolean(busy) || !businessForm.name.trim()}>{busy === 'new-business' ? 'Добавляем…' : 'Добавить бизнес'}</button></div></form> : null}
    {!canManageBusinesses && !canManageLocations ? <p className="business-manager__readonly">Ваша роль разрешает просмотр без изменений.</p> : null}
  </section>;
}
