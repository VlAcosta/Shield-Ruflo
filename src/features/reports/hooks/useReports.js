import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  downloadReport,
  generateReport,
  getReportsSnapshot,
  updateReportSchedules,
} from '../../../services/reports/reportService';
import { BUILDER_BLOCKS } from '../model/reportData';
import { recordCompanyActivity } from '../../../services/activity/companyActivityService';

const DEFAULT_FORM = Object.freeze({
  period: 'month',
  customFrom: '',
  customTo: '',
  blocks: BUILDER_BLOCKS.map((item) => ({ ...item })),
});

export default function useReports() {
  const mountedRef = useRef(true);
  const noticeTimerRef = useRef(null);

  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [builder, setBuilder] = useState(DEFAULT_FORM);
  const [busy, setBusy] = useState({ generate: false, schedule: false, downloadId: null });
  const [notice, setNotice] = useState(null);

  useEffect(() => () => {
    mountedRef.current = false;
    if (noticeTimerRef.current) window.clearTimeout(noticeTimerRef.current);
  }, []);

  const showNotice = useCallback((message, tone = 'success') => {
    if (noticeTimerRef.current) window.clearTimeout(noticeTimerRef.current);
    setNotice({ id: Date.now(), message, tone });
    noticeTimerRef.current = window.setTimeout(() => {
      if (mountedRef.current) setNotice(null);
    }, 3200);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const data = await getReportsSnapshot();
      if (mountedRef.current) setSnapshot(data);
    } catch {
      if (mountedRef.current) setError('Не удалось загрузить отчёты.');
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggleBuilderBlock = useCallback((blockId) => {
    setBuilder((current) => ({
      ...current,
      blocks: current.blocks.map((item) => item.id === blockId ? { ...item, enabled: !item.enabled } : item),
    }));
  }, []);

  const setBuilderPeriod = useCallback((period) => {
    setBuilder((current) => ({ ...current, period }));
  }, []);

  const setCustomPeriod = useCallback((field, value) => {
    setBuilder((current) => ({ ...current, [field]: value }));
  }, []);

  const activeBlocks = useMemo(
    () => builder.blocks.filter((item) => item.enabled),
    [builder.blocks],
  );

  const generate = useCallback(async () => {
    if (!snapshot || busy.generate || !activeBlocks.length) return null;

    if (builder.period === 'custom' && (!builder.customFrom || !builder.customTo)) {
      showNotice('Укажите начало и конец периода', 'warning');
      return null;
    }

    const periodLabels = {
      week: 'Неделя',
      month: 'Месяц',
      quarter: 'Квартал',
      custom: `${builder.customFrom} — ${builder.customTo}`,
    };

    setBusy((current) => ({ ...current, generate: true }));

    try {
      const result = await generateReport({
        period: builder.period,
        periodLabel: periodLabels[builder.period],
        customFrom: builder.customFrom || null,
        customTo: builder.customTo || null,
        blocks: activeBlocks.map((item) => item.id),
      }, snapshot);

      if (result?.snapshot && mountedRef.current) setSnapshot(result.snapshot);
      const generatedReport = result?.report || result || null;
      showNotice('Отчёт поставлен в очередь на формирование');
      recordCompanyActivity({ type: 'report_generated', title: 'Запустил формирование отчёта', detail: periodLabels[builder.period] || builder.period, route: '/reports', targetId: generatedReport?.id || '', tone: 'violet' });
      return generatedReport;
    } catch {
      showNotice('Не удалось сформировать отчёт', 'error');
      return null;
    } finally {
      if (mountedRef.current) setBusy((current) => ({ ...current, generate: false }));
    }
  }, [activeBlocks, builder, busy.generate, showNotice, snapshot]);

  const saveSchedules = useCallback(async (schedules) => {
    if (!snapshot || busy.schedule) return;

    setBusy((current) => ({ ...current, schedule: true }));

    try {
      const result = await updateReportSchedules(schedules, snapshot);
      if (mountedRef.current) {
        setSnapshot(result?.snapshot || { ...snapshot, schedules });
      }
      showNotice('Расписание сохранено');
      recordCompanyActivity({ type: 'report_schedule_updated', title: 'Обновил расписание отчётов', route: '/reports', tone: 'indigo' });
    } catch {
      showNotice('Не удалось сохранить расписание', 'error');
    } finally {
      if (mountedRef.current) setBusy((current) => ({ ...current, schedule: false }));
    }
  }, [busy.schedule, showNotice, snapshot]);

  const download = useCallback(async (report) => {
    if (!report || busy.downloadId) return;
    setBusy((current) => ({ ...current, downloadId: report.id }));

    try {
      const blob = await downloadReport(report.id, report);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${report.title.replace(/[\\/:*?"<>|]+/g, '-')}.txt`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      showNotice('Файл подготовлен к скачиванию');
      recordCompanyActivity({ type: 'report_downloaded', title: `Скачал отчёт «${report.title}»`, route: '/reports', targetId: report.id, tone: 'cyan' });
    } catch {
      showNotice('Не удалось скачать отчёт', 'error');
    } finally {
      if (mountedRef.current) setBusy((current) => ({ ...current, downloadId: null }));
    }
  }, [busy.downloadId, showNotice]);

  return {
    snapshot,
    loading,
    error,
    reload: load,
    builder,
    activeBlocks,
    setBuilderPeriod,
    setCustomPeriod,
    toggleBuilderBlock,
    generate,
    saveSchedules,
    download,
    busy,
    notice,
  };
}
