import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import FirstRunExperience from './FirstRunExperience';
import useOrganization from '../../../hooks/useOrganization';
import useDashboardFirstRun from '../hooks/useDashboardFirstRun';

vi.mock('../../../hooks/useOrganization', () => ({
  default: vi.fn(),
}));

vi.mock('../hooks/useDashboardFirstRun', () => ({
  default: vi.fn(),
}));

describe('dashboard first-run truthfulness', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useOrganization.mockReturnValue({ title: 'ООО Тест' });
    useDashboardFirstRun.mockReturnValue({
      active: true,
      integrations: [{
        id: 'yandex',
        name: 'Яндекс.Бизнес',
        shortName: 'Яндекс',
        tone: 'amber',
        link: 'https://example.test/company',
      }],
      sourceReady: true,
      workspaceReady: false,
      completedCount: 4,
      totalCount: 5,
      progress: 80,
      complete: false,
      milestones: {
        companyReady: true,
        integrationsReady: true,
        securityReady: true,
        sourceReady: true,
        workspaceReady: false,
      },
      configuration: { organization: { title: 'ООО Тест' } },
      security: { autoLock: true, sessionMinutes: 15 },
      markWorkspaceOpened: vi.fn(),
      dismiss: vi.fn(),
      saveSourceLink: vi.fn(),
    });
  });

  test('a saved source URL is not presented as an active monitor or live data collection', () => {
    render(
      <MemoryRouter>
        <FirstRunExperience />
      </MemoryRouter>,
    );

    expect(screen.getAllByText(/Ссылка на источник сохранена/i).length).toBeGreaterThan(0);
    expect(screen.getByRole('heading', { name: 'Источник подготовлен к подключению' })).toBeInTheDocument();
    expect(screen.getByText(/Реальный сбор отзывов начнётся только после успешного подключения/i)).toBeInTheDocument();

    expect(screen.queryByText(/Сбор данных запущен/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Щит уже сканирует подключённые площадки/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/MONITORING LIVE/i)).not.toBeInTheDocument();
  });
});
