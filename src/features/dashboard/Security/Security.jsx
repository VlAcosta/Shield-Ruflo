import React, { memo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardCard from '../../../components/ui/DashboardCard';
import Button from '../../../components/ui/Button';
import DashboardWidgetState from '../components/DashboardWidgetState';
import useDashboardData from '../hooks/useDashboardData';
import './Security.scss';

function ShieldIcon(){return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 4L17 6V11C17 14.6 15.2 17.4 12 19C8.8 17.4 7 14.6 7 11V6L12 4Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/><path d="M9.6 11.6L11.1 13.1L14.6 9.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>}

function Security(){
  const navigate=useNavigate();
  const { section,status,refresh }=useDashboardData('security');
  const openSecurity=useCallback(()=>navigate('/profile?tab=security'),[navigate]);
  if(status==='loading'&&!section)return <DashboardCard className="dashboard-security" motion="scale"><DashboardWidgetState type="loading" compact/></DashboardCard>;
  if(status==='error'&&!section)return <DashboardCard className="dashboard-security" motion="scale"><DashboardWidgetState type="error" onRetry={refresh} compact/></DashboardCard>;
  const score=Math.max(0,Math.min(100,Number(section?.score||0)));
  return <DashboardCard className="dashboard-security" motion="scale"><div className="dashboard-security__top"><div className="dashboard-security__shield"><ShieldIcon/></div><div className="dashboard-security__score"><strong>{score}%</strong><span>уровень защиты</span></div></div><h3>{section?.status||'Безопасность не настроена'}</h3><p>{section?.hasPin?'PIN включён':'PIN не настроен'} · {section?.autoLock?`автоблокировка ${section.sessionMinutes} мин`:'автоблокировка выключена'} · {section?.activeSessions||0} сесс.</p><div className="dashboard-security__meter"><span style={{width:`${score}%`}}/></div><Button className="dashboard-security__button" size="sm" onClick={openSecurity}>Настройки безопасности</Button></DashboardCard>;
}
export default memo(Security);
