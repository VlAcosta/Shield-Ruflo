import React, { memo, useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardCard from '../../../components/ui/DashboardCard';
import Avatar from '../../../components/ui/Avatar';
import DashboardWidgetState from '../components/DashboardWidgetState';
import useDashboardData from '../hooks/useDashboardData';
import useAccessControl from '../../access/hooks/useAccessControl';
import './Team.scss';

function PlusIcon(){return <svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M8 3V13M3 8H13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>}

function Team(){
  const navigate=useNavigate();
  const access=useAccessControl();
  const [activeId,setActiveId]=useState(null);
  const { section,status,refresh }=useDashboardData('team');
  const team=Array.isArray(section)?section:[];
  const canManage=access.can('team.manage')||access.can('team.invite');
  const handleOpenTeam=useCallback(()=>navigate('/profile?tab=users'),[navigate]);
  return <DashboardCard title="Команда" action={canManage?<button type="button" className="dashboard-team__invite" onClick={handleOpenTeam} aria-label="Открыть управление командой"><PlusIcon/></button>:null} className="dashboard-team" motion="rise">
    {status==='loading'&&!section?<DashboardWidgetState type="loading" compact/>:status==='error'&&!section?<DashboardWidgetState type="error" onRetry={refresh} compact/>:!team.length?<DashboardWidgetState title="В команде пока никого" text={canManage?'Пригласите сотрудника и назначьте ему роль — команда появится здесь.':'Участники команды появятся здесь после приглашения пользователем с правом управления.'} compact/>:<>
      <div className="dashboard-team__overview"><span><strong>{team.length}</strong> участник{team.length===1?'':'а'}</span><button type="button" onClick={handleOpenTeam}>{canManage?'Управление':'Открыть'}</button></div>
      <div className="dashboard-team__list">{team.slice(0,4).map((person,index)=><button type="button" className={`dashboard-team__person ${activeId===person.id?'is-active':''}`} key={person.id} onMouseEnter={()=>setActiveId(person.id)} onMouseLeave={()=>setActiveId(null)} onFocus={()=>setActiveId(person.id)} onBlur={()=>setActiveId(null)} onClick={handleOpenTeam} style={{'--team-index':index}}><span className="dashboard-team__avatar-wrap"><Avatar initials={person.initials} tone={person.tone||'violet'} size="sm"/><i className={`is-${person.status||'offline'}`} aria-hidden="true"/></span><span className="dashboard-team__info"><strong>{person.name}</strong><small>{person.role}</small></span><span className="dashboard-team__presence">{person.status==='online'?'Онлайн':person.status==='away'?'Недавно':'Офлайн'}</span></button>)}</div>
    </>}
  </DashboardCard>
}
export default memo(Team);
