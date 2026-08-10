import { getRuntimeEnv } from '../core/runtimeEnv';
import { DEFAULT_TASKS_SNAPSHOT } from '../../features/tasks/model/taskData';
import { apiRequest, createIdempotencyKey, joinEndpoint } from '../core/apiClient';
import { getCompanyScope, readScopedJson, writeScopedJson } from '../core/dataScope';
import { isDemoDataEnabled } from '../core/runtimeConfig';

const TASKS_ENDPOINT = String(getRuntimeEnv('TASKS_ENDPOINT', '/api/v1/tasks')).replace(/\/$/, '');
const TASKS_CACHE_KEY = 'business-shield:tasks:snapshot:v1';
export const TASKS_CHANGED_EVENT = 'business-shield:tasks-changed';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function readCache() {
  return readScopedJson(TASKS_CACHE_KEY, { scope: getCompanyScope(), legacy: true, fallback: null });
}

function writeCache(snapshot, { emit = true } = {}) {
  writeScopedJson(TASKS_CACHE_KEY, snapshot, { scope: getCompanyScope() });
  if (emit && typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(TASKS_CHANGED_EVENT, { detail: snapshot }));
}

async function request(path = '', options = {}) {
  return apiRequest(joinEndpoint(TASKS_ENDPOINT, path), { ...options, timeout: 8000 });
}

function normalizeTask(task) {
  return {
    comments: [],
    checklist: [],
    attachments: [],
    description: '',
    ...task,
  };
}

function snapshotFromResponse(remote) {
  if (remote?.snapshot) return remote.snapshot;
  if (Array.isArray(remote?.tasks)) return remote;
  return null;
}

export async function getTasksSnapshot({ signal } = {}) {
  try {
    const remote = await request('', { signal });
    const source = snapshotFromResponse(remote);
    if (!source) throw new Error('Invalid Tasks API response');
    const snapshot = { ...source, tasks: (source.tasks || []).map(normalizeTask) };
    writeCache(snapshot, { emit: false });
    return snapshot;
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    const cached = readCache();
    if (cached) return { ...cached, tasks: (cached.tasks || []).map(normalizeTask), stale: true, error };
    if (isDemoDataEnabled()) return clone(DEFAULT_TASKS_SNAPSHOT);
    throw error;
  }
}

function mergeTaskIntoSnapshot(task, snapshot) {
  const normalized = normalizeTask(task);
  return {
    ...(snapshot || { version: 2, preferences: { view: 'board' }, tasks: [] }),
    tasks: [normalized, ...((snapshot?.tasks || []).filter((item) => item.id !== normalized.id))],
  };
}

export async function createTask(payload, snapshot) {
  const remote = await request('', {
    method: 'POST',
    body: payload,
    idempotencyKey: createIdempotencyKey('task-create'),
  });
  const task = normalizeTask(remote?.task || remote);
  if (!task?.id) throw new Error('Tasks API did not return created task');
  const nextSnapshot = mergeTaskIntoSnapshot(task, snapshot);
  writeCache(nextSnapshot);
  return { task, snapshot: nextSnapshot };
}

export async function updateTask(taskId, patch, snapshot) {
  const remote = await request(`/${taskId}`, { method: 'PATCH', body: patch });
  const task = normalizeTask(remote?.task || remote);
  if (!task?.id) throw new Error('Tasks API did not return updated task');
  const nextSnapshot = {
    ...snapshot,
    tasks: (snapshot?.tasks || []).map((item) => item.id === task.id ? task : item),
  };
  if (!(snapshot?.tasks || []).some((item) => item.id === task.id)) nextSnapshot.tasks.unshift(task);
  writeCache(nextSnapshot);
  return { task, snapshot: nextSnapshot };
}

export async function moveTask(taskId, status, beforeTaskId, snapshot) {
  const remote = await request(`/${taskId}/move`, {
    method: 'PATCH',
    body: { status, beforeTaskId: beforeTaskId || null },
  });
  const task = normalizeTask(remote?.task || remote);
  if (!task?.id) throw new Error('Tasks API did not return moved task');

  const remaining = (snapshot?.tasks || []).filter((item) => item.id !== task.id);
  let insertAt = beforeTaskId ? remaining.findIndex((item) => item.id === beforeTaskId) : -1;
  if (insertAt < 0) insertAt = remaining.length;
  remaining.splice(insertAt, 0, task);
  const nextSnapshot = { ...snapshot, tasks: remaining };
  writeCache(nextSnapshot);
  return { task, snapshot: nextSnapshot };
}

export async function saveTaskPreferences(preferences, snapshot) {
  const remote = await request('/preferences', { method: 'PATCH', body: preferences });
  const nextSnapshot = {
    ...snapshot,
    preferences: { ...(snapshot?.preferences || {}), ...(remote?.preferences || preferences) },
  };
  writeCache(nextSnapshot);
  return { snapshot: nextSnapshot };
}

export async function addTaskComment(taskId, text) {
  return request(`/${taskId}/comments`, { method: 'POST', body: { text } });
}

export async function addTaskChecklistItem(taskId, text) {
  return request(`/${taskId}/checklist`, { method: 'POST', body: { text } });
}

export async function setTaskChecklistItem(taskId, itemId, completed) {
  return request(`/${taskId}/checklist/${itemId}`, { method: 'PATCH', body: { completed } });
}
