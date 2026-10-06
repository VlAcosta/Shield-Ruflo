import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import OnboardingWorkspace from './OnboardingWorkspace';
import { createDefaultOnboardingDraft } from '../model/onboardingData';
import {
  loadOnboardingState,
  readOnboardingDraft,
  saveOnboardingState,
  startOnboarding,
} from '../../../services/onboarding/onboardingService';

vi.mock('../../../services/onboarding/onboardingService', () => ({
  applyOnboardingConfiguration: vi.fn(),
  clearOnboardingDraft: vi.fn(),
  loadOnboardingState: vi.fn(),
  lookupOrganizationByInn: vi.fn(),
  readOnboardingDraft: vi.fn(),
  saveOnboardingState: vi.fn(),
  startOnboarding: vi.fn(),
}));

function manualDraft() {
  const draft = createDefaultOnboardingDraft();
  return {
    ...draft,
    organization: {
      ...draft.organization,
      type: 'ul',
      title: 'ООО Ручной ввод',
      inn: '7701234567',
      kpp: '770101001',
      lookupEvidence: '',
      source: '',
      confirmed: false,
    },
  };
}

describe('onboarding draft recovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const draft = manualDraft();
    readOnboardingDraft.mockReturnValue(draft);
    loadOnboardingState.mockResolvedValue({
      onboarding: { onboardingStatus: 'IN_PROGRESS' },
      draft,
    });
    saveOnboardingState.mockResolvedValue({ onboarding: { onboardingStatus: 'IN_PROGRESS' } });
    startOnboarding.mockResolvedValue({ onboarding: { onboardingStatus: 'IN_PROGRESS' } });
  });

  test('restores manual organization entry instead of presenting it as registry lookup result', async () => {
    render(
      <MemoryRouter>
        <OnboardingWorkspace />
      </MemoryRouter>,
    );

    expect(await screen.findByRole('heading', { name: 'Заполните реквизиты вручную' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Проверьте найденную компанию' })).not.toBeInTheDocument();
    expect(screen.getByDisplayValue('ООО Ручной ввод')).toBeInTheDocument();
  });
});
