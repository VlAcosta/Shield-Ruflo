import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  addTaskChecklistItem,
  addTaskComment,
  createTask as createTaskRequest,
  getTasksSnapshot,
  moveTask as moveTaskRequest,
  saveTaskPreferences,
  setTaskChecklistItem,
  updateTask as updateTaskRequest,
} from '../../../services/tasks/taskService';
import { TASK_STATUS_ORDER } from '../model/taskData';
import { recordCompanyActivity } from '../../../services/activity/companyActivityService';

export default function useTasks() {
  const mountedRef = useRef(true);
  const noticeTimerRef = useRef(null);

  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState({ create: false, taskId: null });
  const [notice, setNotice] = useState(null);
  const [query, setQuery] = useState('');
  const [priority, setPriority] = useState('all');
  const [type, setType] = useState('all');
  const [selectedTaskId, setSelectedTaskId] = useState(null);

  useEffect(() => () => {
    mountedRef.current = false;
    if (noticeTimerRef.current) window.clearTimeout(noticeTimerRef.current);
  }, []);

  const showNotice = useCallback((message, tone = 'success') => {
    if (noticeTimerRef.current) window.clearTimeout(noticeTimerRef.current);
    setNotice({ id: Date.now(), message, tone });
    noticeTimerRef.current = window.setTimeout(() => {
      if (mountedRef.current) setNotice(null);
    }, 3000);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getTasksSnapshot();
      if (mountedRef.current) setSnapshot(data);
    } catch {
      if (mountedRef.current) setError('Не удалось загрузить задачи.');
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const view = snapshot?.preferences?.view || 'board';

  const setView = useCallback(async (nextView) => {
    if (!snapshot || nextView === view) return;
    const optimistic = { ...snapshot, preferences: { ...(snapshot.preferences || {}), view: nextView } };
    setSnapshot(optimistic);
    try {
      const result = await saveTaskPreferences({ view: nextView }, optimistic);
      if (mountedRef.current && result?.snapshot) setSnapshot(result.snapshot);
    } catch {
      setSnapshot(snapshot);
      showNotice('Не удалось сохранить вид отображения', 'error');
    }
  }, [showNotice, snapshot, view]);

  const filteredTasks = useMemo(() => {
    if (!snapshot) return [];
    const normalized = query.trim().toLowerCase();
    return snapshot.tasks.filter((task) => {
      const matchesQuery = !normalized || [task.title, task.type, task.description]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalized));
      const matchesPriority = priority === 'all' || task.priority === priority;
      const matchesType = type === 'all' || task.type === type;
      return matchesQuery && matchesPriority && matchesType;
    });
  }, [priority, query, snapshot, type]);

  const columns = useMemo(() => TASK_STATUS_ORDER.map((status) => ({
    status,
    tasks: filteredTasks.filter((task) => task.status === status),
  })), [filteredTasks]);

  const selectedTask = useMemo(
    () => snapshot?.tasks.find((task) => task.id === selectedTaskId) || null,
    [selectedTaskId, snapshot],
  );

  const createTask = useCallback(async (payload) => {
    if (!snapshot || busy.create) return null;
    setBusy((current) => ({ ...current, create: true }));
    try {
      const result = await createTaskRequest(payload, snapshot);
      if (mountedRef.current && result?.snapshot) setSnapshot(result.snapshot);
      const createdTask = result?.task || null;
      showNotice('Задача создана');
      recordCompanyActivity({ type: 'task_created', title: `Создал задачу «${createdTask?.title || payload?.title || 'Без названия'}»`, route: '/tasks', targetId: createdTask?.id || '', tone: 'violet' });
      return createdTask;
    } catch {
      showNotice('Не удалось создать задачу', 'error');
      return null;
    } finally {
      if (mountedRef.current) setBusy((current) => ({ ...current, create: false }));
    }
  }, [busy.create, showNotice, snapshot]);

  const updateTask = useCallback(async (taskId, patch, successMessage = '') => {
    if (!snapshot || busy.taskId) return null;
    setBusy((current) => ({ ...current, taskId }));
    const previous = snapshot;
    const optimistic = { ...snapshot, tasks: snapshot.tasks.map((task) => task.id === taskId ? { ...task, ...patch } : task) };
    setSnapshot(optimistic);
    try {
      const result = await updateTaskRequest(taskId, patch, optimistic);
      if (mountedRef.current && result?.snapshot) setSnapshot(result.snapshot);
      if (successMessage) showNotice(successMessage);
      const changedTask = result?.task || optimistic.tasks.find((task) => task.id === taskId);
      if (patch.status || patch.priority || patch.assignee || patch.title) {
        recordCompanyActivity({ type: 'task_updated', title: `Обновил задачу «${changedTask?.title || 'Задача'}»`, detail: successMessage || 'Изменены рабочие параметры', route: '/tasks', targetId: taskId, tone: 'indigo' });
      }
      return result?.task || null;
    } catch {
      if (mountedRef.current) setSnapshot(previous);
      showNotice('Не удалось сохранить изменения', 'error');
      return null;
    } finally {
      if (mountedRef.current) setBusy((current) => ({ ...current, taskId: null }));
    }
  }, [busy.taskId, showNotice, snapshot]);

  const moveTask = useCallback(async (taskId, status, beforeTaskId = null) => {
    if (!snapshot) return;
    const previous = snapshot;
    const source = snapshot.tasks.find((task) => task.id === taskId);
    if (!source) return;
    const remaining = snapshot.tasks.filter((task) => task.id !== taskId);
    const moved = { ...source, status };
    let insertAt = beforeTaskId ? remaining.findIndex((task) => task.id === beforeTaskId) : -1;
    if (insertAt < 0) {
      const lastStatusIndex = remaining.reduce((last, task, index) => task.status === status ? index : last, -1);
      insertAt = lastStatusIndex >= 0 ? lastStatusIndex + 1 : remaining.length;
    }
    const tasks = [...remaining];
    tasks.splice(insertAt, 0, moved);
    const optimistic = { ...snapshot, tasks };
    setSnapshot(optimistic);
    try {
      const result = await moveTaskRequest(taskId, status, beforeTaskId, optimistic);
      if (mountedRef.current && result?.snapshot) setSnapshot(result.snapshot);
      recordCompanyActivity({ type: 'task_moved', title: `Переместил задачу «${source.title}»`, detail: `Новый статус: ${status}`, route: '/tasks', targetId: taskId, tone: 'cyan' });
    } catch {
      if (mountedRef.current) setSnapshot(previous);
      showNotice('Не удалось переместить задачу', 'error');
    }
  }, [showNotice, snapshot]);

  const toggleChecklist = useCallback(async (taskId, checklistId) => {
    const task = snapshot?.tasks.find((item) => item.id === taskId);
    const item = task?.checklist?.find((entry) => entry.id === checklistId);
    if (!task || !item) return;
    try {
      await setTaskChecklistItem(taskId, checklistId, !item.done);
      await load();
    } catch {
      showNotice('Не удалось обновить чек-лист', 'error');
    }
  }, [load, showNotice, snapshot]);

  const addComment = useCallback(async (taskId, text) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    try {
      await addTaskComment(taskId, trimmed);
      await load();
      showNotice('Комментарий добавлен');
    } catch {
      showNotice('Не удалось добавить комментарий', 'error');
    }
  }, [load, showNotice]);

  const addChecklist = useCallback(async (taskId, text) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    try {
      await addTaskChecklistItem(taskId, trimmed);
      await load();
      showNotice('Пункт добавлен');
    } catch {
      showNotice('Не удалось добавить пункт', 'error');
    }
  }, [load, showNotice]);

  const addAttachments = useCallback(() => {
    showNotice('Хранилище файлов ещё не подключено — файл не был загружен', 'warning');
  }, [showNotice]);

  return {
    snapshot,
    loading,
    error,
    reload: load,
    view,
    setView,
    query,
    setQuery,
    priority,
    setPriority,
    type,
    setType,
    filteredTasks,
    columns,
    selectedTask,
    selectedTaskId,
    setSelectedTaskId,
    createTask,
    updateTask,
    moveTask,
    toggleChecklist,
    addChecklist,
    addComment,
    addAttachments,
    busy,
    notice,
  };
}
