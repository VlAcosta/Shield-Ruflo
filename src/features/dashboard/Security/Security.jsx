import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardCard from '../../../components/ui/DashboardCard';
import Button from '../../../components/ui/Button';
import DashboardWidgetState from '../components/DashboardWidgetState';
import useDashboardData from '../hooks/useDashboardData';
import { PIN_CODE_KEY } from '../../../layouts/PortalLayout/constants';
import {
  readSecurityPreferences,
  SECURITY_PREFERENCES_CHANGED_EVENT,
} from '../../../services/security/securityPreferencesService';
import './Security.scss';

function ShieldIcon(){return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 4L17 6V11C17 14.6 15.2 17.4 12 19C8.8 17.4 7 14.6 7 11V6L12 4Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/><path d="M9.6 11.6L11.1 13.1L14.6 9.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>}

function readLocalSecurityState(){
  const preferences=readSecurityPreferences();
  const hasPin=typeof window!=='undefined'&&Boolean(window.localStorage.getItem(PIN_CODE_KEY));
  return {hasPin,autoLock:Boolean(preferences.autoLock),sessionMinutes:Number(preferences.sessionMinutes)||15};
}

function Security(){
  const navigate=useNavigate();
  const { section,status,refresh }=useDashboardData('security');
  const [localSecurity,setLocalSecurity]=useState(readLocalSecurityState);
  const openSecurity=useCallback(()=>navigate('/profile?tab=security'),[navigate]);

  useEffect(()=>{
    const sync=()=>setLocalSecurity(readLocalSecurityState());
    const handleStorage=(event)=>{
      if(!event.key||event.key===PIN_CODE_KEY||event.key.includes('pin-preferences'))sync();
    };
    window.addEventListener(SECURITY_PREFERENCES_CHANGED_EVENT,sync);
    window.addEventListener('storage',handleStorage);
    window.addEventListener('focus',sync);
    return ()=>{
      window.removeEventListener(SECURITY_PREFERENCES_CHANGED_EVENT,sync);
      window.removeEventListener('storage',handleStorage);
      window.removeEventListener('focus',sync);
    };
  },[]);

  const activeSessions=Number.isFinite(Number(section?.activeSessions))?Math.max(0,Number(section.activeSessions)):null;
  const score=useMemo(()=>Math.min(100,
    (localSecurity.hasPin?45:0)
    +(localSecurity.autoLock?30:0)
    +((activeSessions??1)<=3?15:5)
    +10
  ),[activeSessions,localSecurity]);
  const securityStatus=score>=85?'Аккаунт защищён':score>=65?'Защита настроена частично':'Требует настройки';

  if(status==='loading'&&!section)return <DashboardCard className="dashboard-security" motion="scale"><DashboardWidgetState type="loading" compact/></DashboardCard>;
  if(status==='error'&&!section)return <DashboardCard className="dashboard-security" motion="scale"><DashboardWidgetState type="error" onRetry={refresh} compact/></DashboardCard>;

  return <DashboardCard className="dashboard-security" motion="scale"><div className="dashboard-security__top"><div className="dashboard-security__shield"><ShieldIcon/></div><div className="dashboard-security__score"><strong>{score}%</strong><span>уровень защиты</span></div></div><h3>{securityStatus}</h3><p>{localSecurity.hasPin?'PIN включён':'PIN не настроен'} · {localSecurity.autoLock?`автоблокировка ${localSecurity.sessionMinutes} мин`:'автоблокировка выключена'} · {activeSessions===null?'сессии защищены':`${activeSessions} сесс.`}</p><div className="dashboard-security__meter"><span style={{width:`${score}%`}}/></div><Button className="dashboard-security__button" size="sm" onClick={openSecurity}>Настройки безопасности</Button></DashboardCard>
}
export default memo(Security);
