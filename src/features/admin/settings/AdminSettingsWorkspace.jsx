import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import useAdminSettings from './hooks/useAdminSettings';
import { SETTINGS_TABS } from './model/adminSettingsData';
import './AdminSettingsWorkspace.scss';

function Switch({ value, onChange, label }) {
  return <button type="button" className={`admin-settings-switch ${value ? 'is-on':''}`} onClick={() => onChange(!value)} aria-label={label}><i /></button>;
}

function PlansTab({ plans, savePlan, saving }) {
  const [drafts,setDrafts] = useState({});
  useEffect(() => {
    setDrafts(Object.fromEntries(plans.map((plan)=>[plan.id,{...plan}])));
  },[plans]);
  const update = (id,key,value)=>setDrafts((current)=>({...current,[id]:{...current[id],[key]:value}}));
  return <div className="admin-settings-plans">{plans.map((plan,index)=>{const draft=drafts[plan.id]||plan;return <article key={plan.id} className={`is-${plan.tone}`} style={{'--item-index':index}}><header><div><span>ТАРИФ</span><h3>{plan.name}</h3></div><b>{plan.clients || 0} клиентов</b></header><div className="admin-settings-plans__grid"><label><span>Название</span><input value={draft.name} onChange={(e)=>update(plan.id,'name',e.target.value)}/></label><label><span>Цена, ₽</span><input type="number" value={draft.price} onChange={(e)=>update(plan.id,'price',Number(e.target.value||0))}/></label><label><span>Пробный, дней</span><input type="number" value={draft.trialDays} onChange={(e)=>update(plan.id,'trialDays',Number(e.target.value||0))}/></label><label><span>Ответов</span><input type="number" value={draft.replies} onChange={(e)=>update(plan.id,'replies',Number(e.target.value||0))}/></label><label><span>Отчётов</span><input type="number" value={draft.reports} onChange={(e)=>update(plan.id,'reports',Number(e.target.value||0))}/></label><label><span>Консультаций</span><input type="number" value={draft.consultations} onChange={(e)=>update(plan.id,'consultations',Number(e.target.value||0))}/></label></div><footer><small>−1 = безлимит</small><button type="button" disabled={saving} onClick={()=>savePlan(plan.id,draft)}>{saving?'Сохраняем…':'Сохранить тариф'}</button></footer></article>;})}</div>;
}

function NotificationsTab({ data, onSave, onTest, saving }) {
  const [notifications,setNotifications] = useState(data.notifications);
  const [smtp,setSmtp] = useState(data.smtp);
  const [testResult,setTestResult] = useState('');
  useEffect(()=>{setNotifications(data.notifications);setSmtp(data.smtp);},[data.notifications,data.smtp]);
  const toggle=(id)=>setNotifications((items)=>items.map((item)=>item.id===id?{...item,enabled:!item.enabled}:item));
  const test=async()=>{setTestResult('Проверяем соединение…');try{const result=await onTest(smtp);setTestResult(result?.message||'Соединение установлено');}catch(err){setTestResult(err?.message||'Ошибка подключения');}};
  return <div className="admin-settings-two"><section className="admin-settings-panel"><header><div><span>EVENT TRIGGERS</span><h3>Триггеры уведомлений</h3><p>Какие системные события должны попадать в центр уведомлений.</p></div></header><div className="admin-settings-trigger-list">{notifications.map((item,index)=><article key={item.id} style={{'--item-index':index}}><span><strong>{item.label}</strong><small>{item.description}</small></span><Switch value={item.enabled} onChange={()=>toggle(item.id)} label={item.label}/></article>)}</div><footer><button type="button" disabled={saving} onClick={()=>onSave('notifications',notifications)}>Сохранить триггеры</button></footer></section><section className="admin-settings-panel"><header><div><span>MAIL GATEWAY</span><h3>SMTP настройки</h3><p>Канал системных писем и технических уведомлений.</p></div></header><div className="admin-settings-form"><label><span>SMTP хост</span><input value={smtp.host} onChange={(e)=>setSmtp({...smtp,host:e.target.value})}/></label><label><span>SMTP порт</span><input type="number" value={smtp.port} onChange={(e)=>setSmtp({...smtp,port:Number(e.target.value||0)})}/></label><label><span>Email пользователя</span><input value={smtp.email} onChange={(e)=>setSmtp({...smtp,email:e.target.value})}/></label><label><span>Пароль</span><input type="password" value={smtp.password} placeholder="••••••••" onChange={(e)=>setSmtp({...smtp,password:e.target.value})}/></label></div>{testResult?<div className="admin-settings-test-result">{testResult}</div>:null}<footer><button type="button" className="is-secondary" disabled={saving} onClick={test}>Тест</button><button type="button" disabled={saving} onClick={()=>onSave('smtp',smtp)}>Сохранить SMTP</button></footer></section></div>;
}

function IntegrationsTab({ integrations,onToggle,saving }) {
  return <div className="admin-settings-integrations">{integrations.map((item,index)=><article key={item.id} className={`is-${item.status}`} style={{'--item-index':index}}><div className={`admin-settings-integrations__logo is-${item.tone}`}>{item.glyph}</div><div><div className="admin-settings-integrations__title"><strong>{item.name}</strong><span><i />{item.status==='connected'?'Подключено':'Не подключено'}</span></div><small>{item.description}</small></div><button type="button" disabled={saving} onClick={()=>onToggle(item.id,item.status!=='connected')}>{item.status==='connected'?'Отключить':'Подключить'}</button></article>)}</div>;
}

function TemplatesTab({ templates,onSave,onDelete,saving }) {
  const [selected,setSelected] = useState(templates[0]||null);
  const [draft,setDraft] = useState(templates[0]||null);
  useEffect(()=>{if(!selected&&templates.length){setSelected(templates[0]);setDraft(templates[0]);}},[templates,selected]);
  const choose=(template)=>{setSelected(template);setDraft({...template});};
  const add=()=>{const blank={id:'',title:'Новый шаблон',category:'Нейтральные',body:'',tone:'warning'};setSelected(blank);setDraft(blank);};
  return <div className="admin-settings-template-layout"><section className="admin-settings-template-list"><header><div><span>RESPONSE LIBRARY</span><h3>Шаблоны</h3></div><button type="button" onClick={add}>+ Добавить</button></header><div>{templates.map((template,index)=><button type="button" key={template.id} className={selected?.id===template.id?'is-active':''} style={{'--item-index':index}} onClick={()=>choose(template)}><i className={`is-${template.tone}`}/><span><strong>{template.title}</strong><small>{template.category}</small></span><b>›</b></button>)}</div></section><section className="admin-settings-panel admin-settings-template-editor"><header><div><span>EDITOR</span><h3>{draft?.id?'Редактор шаблона':'Новый шаблон'}</h3><p>Используется как быстрый ответ в репутационных сценариях.</p></div></header>{draft?<div className="admin-settings-form"><label><span>Название</span><input value={draft.title} onChange={(e)=>setDraft({...draft,title:e.target.value})}/></label><label><span>Категория</span><select value={draft.category} onChange={(e)=>setDraft({...draft,category:e.target.value})}><option>Негативные</option><option>Позитивные</option><option>Нейтральные</option></select></label><label className="is-wide"><span>Текст ответа</span><textarea rows="9" value={draft.body} onChange={(e)=>setDraft({...draft,body:e.target.value})}/></label></div>:null}<footer>{draft?.id?<button type="button" className="is-danger" disabled={saving} onClick={()=>{onDelete(draft.id);setSelected(null);setDraft(null);}}>Удалить</button>:<span/>}<button type="button" disabled={saving||!draft} onClick={()=>onSave(draft)}>Сохранить шаблон</button></footer></section></div>;
}

function SecurityTab({ data,onSave,saving }) {
  const [security,setSecurity] = useState(data.security);
  useEffect(()=>setSecurity(data.security),[data.security]);
  return <div className="admin-settings-two admin-settings-security"><section className="admin-settings-panel"><header><div><span>SECURITY POLICY</span><h3>Параметры безопасности</h3><p>Сессии, PIN-защита и события повышенного риска.</p></div></header><div className="admin-settings-form"><label><span>Длина сессии, минуты</span><input type="number" value={security.sessionMinutes} onChange={(e)=>setSecurity({...security,sessionMinutes:Number(e.target.value||0)})}/></label><label><span>Попытки PIN до блокировки</span><input type="number" value={security.pinAttempts} onChange={(e)=>setSecurity({...security,pinAttempts:Number(e.target.value||0)})}/></label><label><span>Время блокировки PIN, сек.</span><input type="number" value={security.pinLockSeconds} onChange={(e)=>setSecurity({...security,pinLockSeconds:Number(e.target.value||0)})}/></label><label><span>Минимальная длина PIN</span><input type="number" value={security.minPinLength} onChange={(e)=>setSecurity({...security,minPinLength:Number(e.target.value||0)})}/></label></div><div className="admin-settings-security__switches"><article><span><strong>Двухфакторная защита</strong><small>Требовать дополнительный фактор для критичных действий</small></span><Switch value={security.require2fa} onChange={(value)=>setSecurity({...security,require2fa:value})} label="2FA"/></article><article><span><strong>Новый IP</strong><small>Уведомлять о входе с нового адреса</small></span><Switch value={security.notifyNewIp} onChange={(value)=>setSecurity({...security,notifyNewIp:value})} label="Новый IP"/></article></div><footer><button type="button" disabled={saving} onClick={()=>onSave('security',security)}>Сохранить политику</button></footer></section><section className="admin-settings-panel admin-settings-security-log"><header><div><span>AUDIT TRAIL</span><h3>Лог безопасности</h3><p>Последние значимые действия в Admin CRM.</p></div></header><div>{data.securityLog.map((event,index)=><article key={event.id} style={{'--item-index':index}}><i className={`is-${event.tone}`}/><span><strong>{event.title}</strong><small>{event.date} · {event.ip}</small></span></article>)}</div></section></div>;
}

function Skeleton(){return <div className="admin-settings-skeleton">{Array.from({length:7}).map((_,i)=><i key={i}/>)}</div>;}

export default function AdminSettingsWorkspace({ onRefreshReady }) {
  const [searchParams,setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get('tab');
  const [tab,setTab] = useState(SETTINGS_TABS.some((item)=>item.id===requestedTab)?requestedTab:'plans');
  const {data,error,refreshing,saving,refresh,saveSection,savePlan,toggleIntegration,saveTemplate,deleteTemplate,testSmtp}=useAdminSettings();
  const [toast,setToast] = useState('');
  useEffect(()=>{onRefreshReady?.(refresh);},[onRefreshReady,refresh]);
  useEffect(()=>{if(requestedTab&&SETTINGS_TABS.some((item)=>item.id===requestedTab))setTab(requestedTab);},[requestedTab]);
  const changeTab=(id)=>{setTab(id);setSearchParams({tab:id},{replace:true});};
  const run=async(action,message)=>{try{await action();setToast(message);setTimeout(()=>setToast(''),2200);}catch{/* hook exposes error */}};
  const sectionContent = useMemo(()=>{
    if(!data)return null;
    if(tab==='plans')return <PlansTab plans={data.plans} saving={saving} savePlan={(id,patch)=>run(()=>savePlan(id,patch),'Тариф обновлён')}/>;
    if(tab==='notifications')return <NotificationsTab data={data} saving={saving} onSave={(section,value)=>run(()=>saveSection(section,value),'Настройки сохранены')} onTest={testSmtp}/>;
    if(tab==='integrations')return <IntegrationsTab integrations={data.integrations} saving={saving} onToggle={(id,enabled)=>run(()=>toggleIntegration(id,enabled),'Статус интеграции обновлён')}/>;
    if(tab==='templates')return <TemplatesTab templates={data.templates} saving={saving} onSave={(template)=>run(()=>saveTemplate(template),'Шаблон сохранён')} onDelete={(id)=>run(()=>deleteTemplate(id),'Шаблон удалён')}/>;
    return <SecurityTab data={data} saving={saving} onSave={(section,value)=>run(()=>saveSection(section,value),'Политика безопасности обновлена')}/>;
  },[data,tab,saving,savePlan,saveSection,testSmtp,toggleIntegration,saveTemplate,deleteTemplate]);

  if(!data&&refreshing)return <Skeleton/>;
  if(!data&&error)return <section className="admin-settings-error"><strong>Не удалось загрузить настройки</strong><p>{error}</p><button type="button" onClick={refresh}>Повторить</button></section>;
  if(!data)return null;

  return <div className={`admin-settings ${refreshing?'is-refreshing':''}`}><section className="admin-settings__intro"><div><span>SYSTEM CONFIGURATION</span><h2>Настройте платформу как инфраструктуру</h2><p>Тарифы, события, интеграции, шаблоны и безопасность собраны в одном административном контуре.</p></div><div className="admin-settings__health"><i/><span><strong>6 / 6</strong><small>критических модулей доступны</small></span></div></section><section className="admin-settings__shell"><aside>{SETTINGS_TABS.map((item,index)=><button key={item.id} type="button" className={tab===item.id?'is-active':''} style={{'--tab-index':index}} onClick={()=>changeTab(item.id)}><i>{String(index+1).padStart(2,'0')}</i><span>{item.label}</span><b>›</b></button>)}</aside><main>{sectionContent}</main></section>{error?<div className="admin-settings-toast is-error">{error}</div>:null}{toast?<div className="admin-settings-toast">{toast}</div>:null}</div>;
}
