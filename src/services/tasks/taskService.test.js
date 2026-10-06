import { deleteTask, getTasksSnapshot } from './taskService';

const originalFetch = global.fetch;

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    url: 'http://localhost/api/v1/tasks',
    headers: {
      get: (name) => String(name).toLowerCase() === 'content-type' ? 'application/json' : null,
    },
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  };
}

describe('taskService production contract', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  test('normalizes server deadlines and comment authors for the task UI', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      jsonResponse({
        version: 2,
        preferences: { view: 'board' },
        tasks: [
          {
            id: 'task-1',
            title: 'Проверить отзыв',
            status: 'new',
            priority: 'high',
            dueDate: '2026-10-07T12:00:00.000Z',
            comments: [
              {
                id: 'comment-1',
                text: 'Готовлю ответ',
                createdAt: '2026-10-07T10:30:00.000Z',
                author: { id: 'user-1', name: 'Анна Петрова' },
              },
            ],
          },
        ],
      }),
    );

    const snapshot = await getTasksSnapshot();

    expect(snapshot.tasks[0].dueDate).toBe('07.10.2026');
    expect(snapshot.tasks[0].type).toBe('Общее');
    expect(snapshot.tasks[0].comments[0]).toEqual(
      expect.objectContaining({
        author: 'Анна Петрова',
        initials: 'АП',
        text: 'Готовлю ответ',
      }),
    );
  });

  test('deletes a task on the server and removes it from the local snapshot', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      jsonResponse({ task: { id: 'task-1', title: 'Удаляемая задача' } }),
    );

    const snapshot = {
      version: 2,
      preferences: { view: 'board' },
      tasks: [
        { id: 'task-1', title: 'Удаляемая задача' },
        { id: 'task-2', title: 'Оставить' },
      ],
    };

    const result = await deleteTask('task-1', snapshot);

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/v1/tasks/task-1',
      expect.objectContaining({ method: 'DELETE', credentials: 'include' }),
    );
    expect(result.snapshot.tasks.map((task) => task.id)).toEqual(['task-2']);
  });
});
