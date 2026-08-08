import React, { memo, useMemo, useState } from 'react';
import Button from '../../../components/ui/Button';
import ReportList from '../ReportList';
import ReportDetail from '../ReportDetail';
import ReportBuilder from '../ReportBuilder';
import ReportSchedule from '../ReportSchedule';
import useReports from '../hooks/useReports';
import { REPORT_TABS } from '../model/reportData';
import './ReportsWorkspace.scss';
import useAccessControl from '../../access/hooks/useAccessControl';

function ReportsSkeleton() {
  return <div className="reports-skeleton" aria-label="Загрузка отчётов"><span className="reports-skeleton__hero" /><span className="reports-skeleton__tabs" /><span className="reports-skeleton__table" /></div>;
}

function SparkIcon() {
  return <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M10 2.7l1.2 4.2 4.1 1.2-4.1 1.2-1.2 4.2-1.2-4.2-4.1-1.2 4.1-1.2L10 2.7ZM15.3 13.2l.6 2 .2.6.6.2 2 .6-2 .6-.6.2-.2.6-.6 2-.6-2-.2-.6-.6-.2-2-.6 2-.6.6-.2.2-.6.6-2Z" fill="currentColor" /></svg>;
}

function ArrowIcon() {
  return <svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3.5 8h8.5M8.7 4.7L12 8l-3.3 3.3" stroke="currentColor" strokeWidth="1.45" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function formatLastReport(reports = []) {
  const ready = reports.find((item) => item.status === 'ready');
  return ready ? { title: ready.title, date: ready.date } : { title: 'Первый отчёт ещё не сформирован', date: '—' };
}

function ReportsWorkspace() {
  const reports = useReports();
  const access = useAccessControl();
  const canCreate = access.can('reports.create');
  const canExport = access.can('reports.export');
  const [tab, setTab] = useState('list');
  const [activeReportId, setActiveReportId] = useState(null);

  const activeReport = useMemo(() => reports.snapshot?.reports?.find((item) => item.id === activeReportId) || null, [activeReportId, reports.snapshot?.reports]);
  const overview = useMemo(() => {
    const list = reports.snapshot?.reports || [];
    const schedules = reports.snapshot?.schedules || [];
    const ready = list.filter((item) => item.status === 'ready').length;
    const processing = list.filter((item) => item.status === 'processing').length;
    const activeSchedules = schedules.filter((item) => item.enabled).length;
    const last = formatLastReport(list);
    const types = list.reduce((map, item) => { map[item.type || 'Сводный'] = (map[item.type || 'Сводный'] || 0) + 1; return map; }, {});
    const topType = Object.entries(types).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Репутация';
    return { total: list.length, ready, processing, activeSchedules, last, topType };
  }, [reports.snapshot]);

  const openReport = (reportId) => { setActiveReportId(reportId); setTab('list'); };
  const changeTab = (nextTab) => { setActiveReportId(null); setTab(nextTab); };
  const openBuilder = () => { if (canCreate) changeTab('builder'); };
  const handleGenerate = async () => { const generated = await reports.generate(); if (generated) { setActiveReportId(null); setTab('list'); } };

  if (reports.loading) return <ReportsSkeleton />;
  if (reports.error || !reports.snapshot) return <section className="reports-error"><span>!</span><div><h2>Отчёты временно недоступны</h2><p>{reports.error || 'Не удалось получить данные.'}</p></div><Button onClick={reports.reload}>Повторить</Button></section>;

  return (
    <div className="reports-workspace">
      {!activeReport ? (
        <section className="reports-command">
          <div className="reports-command__copy">
            <span className="reports-command__eyebrow"><i /> REPORT COMMAND CENTER</span>
            <h1>Отчёты, которые объясняют <em>что изменилось.</em></h1>
            <p>Собирайте репутацию, отзывы, задачи, площадки и конкурентов в одну управленческую сводку — вручную или по расписанию.</p>
            <div className="reports-command__actions">
              {canCreate ? <button type="button" className="is-primary" onClick={openBuilder}><SparkIcon />Сформировать отчёт<ArrowIcon /></button> : null}
              {canCreate ? <button type="button" onClick={() => changeTab('schedule')}>Расписание</button> : null}
            </div>
          </div>

          <div className="reports-command__overview">
            <div className="reports-command__ring" style={{ '--reports-progress': `${Math.min(100, overview.total ? Math.round((overview.ready / overview.total) * 100) : 0)}%` }}><span><strong>{overview.ready}</strong><small>готово</small></span></div>
            <div className="reports-command__status"><span>Система отчётности</span><strong>{overview.processing ? `${overview.processing} формируется` : 'Готова к работе'}</strong><small>{overview.activeSchedules ? `${overview.activeSchedules} автоотправки активны` : 'Автоотправка не настроена'}</small></div>
          </div>

          <div className="reports-command__metrics">
            <article><span>Всего отчётов</span><strong>{overview.total}</strong><small>{overview.ready} готовы к скачиванию</small></article>
            <article><span>Автоотправка</span><strong>{overview.activeSchedules}</strong><small>активных сценария</small></article>
            <article><span>Основной тип</span><strong>{overview.topType}</strong><small>чаще всего формируется</small></article>
          </div>

          <div className="reports-command__last"><span>ПОСЛЕДНИЙ ГОТОВЫЙ</span><div><strong>{overview.last.title}</strong><small>{overview.last.date}</small></div>{overview.ready ? <button type="button" onClick={() => { const first = reports.snapshot.reports.find((item) => item.status === 'ready'); if (first) openReport(first.id); }}>Открыть <ArrowIcon /></button> : null}</div>
        </section>
      ) : null}

      {!activeReport ? (
        <div className="reports-workspace__navigation">
          <nav className="reports-workspace__tabs" aria-label="Разделы отчётов">
            {REPORT_TABS.filter((item) => item.id === 'list' || canCreate).map((item) => <button key={item.id} type="button" className={tab === item.id ? 'is-active' : ''} onClick={() => changeTab(item.id)}>{item.label}</button>)}
          </nav>
          <div className="reports-workspace__context"><i /><span>{tab === 'list' ? 'Архив и готовые материалы' : tab === 'builder' ? 'Соберите отчёт под задачу' : 'Регулярная доставка без ручного запуска'}</span></div>
        </div>
      ) : null}

      <div className="reports-workspace__content" key={activeReport ? `detail-${activeReport.id}` : tab}>
        {activeReport ? <ReportDetail report={activeReport} downloadBusy={reports.busy.downloadId === activeReport.id} onBack={() => setActiveReportId(null)} onDownload={reports.download} canDownload={canExport} /> : null}
        {!activeReport && tab === 'list' ? <ReportList reports={reports.snapshot.reports} downloadId={reports.busy.downloadId} onOpen={openReport} onDownload={reports.download} canDownload={canExport} /> : null}
        {!activeReport && tab === 'builder' ? <ReportBuilder builder={reports.builder} activeBlocks={reports.activeBlocks} generating={reports.busy.generate} onPeriodChange={reports.setBuilderPeriod} onCustomChange={reports.setCustomPeriod} onToggleBlock={reports.toggleBuilderBlock} onGenerate={handleGenerate} /> : null}
        {!activeReport && tab === 'schedule' ? <ReportSchedule schedules={reports.snapshot.schedules} saving={reports.busy.schedule} onSave={reports.saveSchedules} /> : null}
      </div>

      {reports.notice ? <div className={`reports-toast reports-toast--${reports.notice.tone}`} role="status" key={reports.notice.id}><span />{reports.notice.message}</div> : null}
    </div>
  );
}
export default memo(ReportsWorkspace);
