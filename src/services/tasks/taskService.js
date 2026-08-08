import { getRuntimeEnv } from '../core/runtimeEnv';
import { DEFAULT_TASKS_SNAPSHOT } from '../../features/tasks/model/taskData';
import { apiRequest, createIdempotencyKey, joinEndpoint } from '../core/apiClient';
import { getCompanyScope, readScopedJson, writeScopedJson } from '../core/dataScope';
import { isDemoDataEnabled } from '../core/runtimeConfig';

const TASKS_ENDPOINT = String(getRuntimeEnv('TASKS_ENDPOINT')).replace(/\/$/, '');
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
  if (!TASKS_ENDPOINT) return null;
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

export async function getTasksSnapshot({ signal } = {}) {
  try {
    const remote = await request('', { signal });
    if (remote) {
      const source = remote.snapshot || remote;
      const snapshot = { ...source, tasks: (source.tasks || []).map(normalizeTask) };
      writeCache(snapshot, { emit: false });
      return snapshot;
    }
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    const cached = readCache();
    if (cached) return { ...cached, tasks: (cached.tasks || []).map(normalizeTask) };
  }
  return readCache() || (isDemoDataEnabled() ? clone(DEFAULT_TASKS_SNAPSHOT) : { version: 1, preferences: { view: 'board' }, tasks: [] });
}

function materializeRemoteSnapshot(remote, fallbackSnapshot, fallbackTask = null) {
  if (!remote) return null;
  const source = remote.snapshot || (Array.isArray(remote.tasks) ? remote : null);
  if (source) {
    const snapshot = { ...source, tasks: (source.tasks || []).map(normalizeTask) };
    writeCache(snapshot);
    return { ...remote, snapshot, task: remote.task ? normalizeTask(remote.task) : fallbackTask };
  }
  const remoteTask = remote.task || (remote.id && remote.title ? remote : null);
  if (remoteTask) {
    const task = normalizeTask(remoteTask);
    const snapshot = {
      ...fallbackSnapshot,
      tasks: [task, ...(fallbackSnapshot?.tasks || []).filter((item) => item.id !== task.id)],
    };
    writeCache(snapshot);
    return { ...(remote.task ? remote : {}), task, snapshot };
  }
  return remote;
}

export async function createTask(payload, snapshot) {
  const remote = await request('', {
    method: 'POST',
    body: payload,
    idempotencyKey: createIdempotencyKey('task-create'),
  });

  if (remote) {
    const materialized = materializeRemoteSnapshot(remote, snapshot);
    if (materialized?.snapshot) return materialized;
  }

  const task = normalizeTask({
    ...payload,
    id: `task-${Date.now()}`,
    createdAt: new Date().toLocaleDateString('ru-RU'),
  });

  const nextSnapshot = {
    ...snapshot,
    tasks: [task, ...snapshot.tasks],
  };

  writeCache(nextSnapshot);
  return { task, snapshot: nextSnapshot };
}

export async function updateTask(taskId, patch, snapshot) {
  const remote = await request(`/${taskId}`, {
    method: 'PATCH',
    body: patch,
  });

  if (remote) {
    const materialized = materializeRemoteSnapshot(remote, snapshot);
    if (materialized?.snapshot) return materialized;
  }

  const nextSnapshot = {
    ...snapshot,
    tasks: snapshot.tasks.map((task) => task.id === taskId ? normalizeTask({ ...task, ...patch }) : task),
  };

  writeCache(nextSnapshot);
  return {
    task: nextSnapshot.tasks.find((task) => task.id === taskId),
    snapshot: nextSnapshot,
  };
}

export async function moveTask(taskId, status, beforeTaskId, snapshot) {
  const remote = await request(`/${taskId}/move`, {
    method: 'PATCH',
    body: { status, beforeTaskId: beforeTaskId || null },
  });

  if (remote) {
    const materialized = materializeRemoteSnapshot(remote, snapshot);
    if (materialized?.snapshot) return materialized;
  }

  const source = snapshot.tasks.find((task) => task.id === taskId);
  if (!source) return { snapshot };

  const remaining = snapshot.tasks.filter((task) => task.id !== taskId);
  const moved = { ...source, status };
  let insertAt = beforeTaskId ? remaining.findIndex((task) => task.id === beforeTaskId) : -1;

  if (insertAt < 0) {
    const lastStatusIndex = remaining.reduce((last, task, index) => task.status === status ? index : last, -1);
    insertAt = lastStatusIndex >= 0 ? lastStatusIndex + 1 : remaining.length;
  }

  const tasks = [...remaining];
  tasks.splice(insertAt, 0, moved);
  const nextSnapshot = { ...snapshot, tasks };
  writeCache(nextSnapshot);
  return { task: moved, snapshot: nextSnapshot };
}

export async function saveTaskPreferences(preferences, snapshot) {
  const remote = await request('/preferences', {
    method: 'PATCH',
    body: preferences,
  });

  if (remote) {
    const materialized = materializeRemoteSnapshot(remote, snapshot);
    if (materialized?.snapshot) return materialized;
  }

  const nextSnapshot = {
    ...snapshot,
    preferences: {
      ...(snapshot.preferences || {}),
      ...preferences,
    },
  };

  writeCache(nextSnapshot);
  return { snapshot: nextSnapshot };
}
