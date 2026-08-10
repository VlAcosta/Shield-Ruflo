import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import BusinessLocationsManager from './BusinessLocationsManager';
import { businessLocationsService } from '../../../services/organizations/businessLocationsService';

jest.mock('../../../services/organizations/businessLocationsService', () => ({
  businessLocationsService: {
    list: jest.fn(), createBusiness: jest.fn(), updateBusiness: jest.fn(), archiveBusiness: jest.fn(),
    createLocation: jest.fn(), updateLocation: jest.fn(), archiveLocation: jest.fn(),
  },
}));

describe('BusinessLocationsManager', () => {
  beforeEach(() => jest.clearAllMocks());

  test('renders a truthful empty state and creates a business through the API', async () => {
    businessLocationsService.list.mockResolvedValue([]);
    businessLocationsService.createBusiness.mockResolvedValue({ business: { id: 'business-1' } });
    render(<BusinessLocationsManager canView canManageBusinesses canManageLocations />);
    expect(await screen.findByText('Бизнесы ещё не добавлены')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Название нового бизнеса'), { target: { value: 'Север' } });
    fireEvent.click(screen.getByRole('button', { name: 'Добавить бизнес' }));
    await waitFor(() => expect(businessLocationsService.createBusiness).toHaveBeenCalledWith(expect.objectContaining({ name: 'Север' })));
    expect(await screen.findByText('Бизнес добавлен')).toBeInTheDocument();
  });

  test('does not render management for users without view permission', () => {
    const { container } = render(<BusinessLocationsManager canView={false} canManageBusinesses={false} canManageLocations={false} />);
    expect(container).toBeEmptyDOMElement();
    expect(businessLocationsService.list).not.toHaveBeenCalled();
  });

  test('preserves a failed create form and supports editing core business fields', async () => {
    businessLocationsService.list.mockResolvedValue([{ id: 'business-1', name: 'Север', industry: 'Retail', website: '', isPrimary: true, locations: [] }]);
    businessLocationsService.createBusiness.mockRejectedValue(new Error('Сервер отклонил запрос'));
    businessLocationsService.updateBusiness.mockResolvedValue({});
    render(<BusinessLocationsManager canView canManageBusinesses canManageLocations={false} />);
    await screen.findByDisplayValue('Север');
    fireEvent.change(screen.getByLabelText('Название нового бизнеса'), { target: { value: 'Юг' } });
    fireEvent.click(screen.getByRole('button', { name: 'Добавить бизнес' }));
    expect(await screen.findByText('Сервер отклонил запрос')).toBeInTheDocument();
    expect(screen.getByLabelText('Название нового бизнеса')).toHaveValue('Юг');
    fireEvent.change(screen.getByLabelText('Отрасль бизнеса'), { target: { value: 'Services' } });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    await waitFor(() => expect(businessLocationsService.updateBusiness).toHaveBeenCalledWith('business-1', expect.objectContaining({ industry: 'Services' })));
  });

  test('keeps business and location management permissions independent', async () => {
    businessLocationsService.list.mockResolvedValue([{ id: 'business-1', name: 'Север', isPrimary: true, locations: [] }]);
    render(<BusinessLocationsManager canView canManageBusinesses canManageLocations={false} />);
    expect(await screen.findByLabelText('Название нового бизнеса')).toBeInTheDocument();
    expect(screen.queryByLabelText('Название филиала для Север')).not.toBeInTheDocument();
  });
});
