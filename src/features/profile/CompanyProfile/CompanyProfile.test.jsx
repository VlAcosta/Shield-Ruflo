import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import CompanyProfile from './CompanyProfile';

jest.mock('./BusinessLocationsManager', () => () => null);

const value = {
  title: 'ООО Север', inn: '7701234567', kpp: '770101001', ogrn: '1027700123456',
  legalAddress: 'Москва', website: 'https://example.ru', industry: 'Услуги', verified: false,
};

describe('CompanyProfile validation', () => {
  test('disables unchanged save and validates identifiers and website', () => {
    const onSave = jest.fn();
    render(<CompanyProfile value={value} onSave={onSave} />);
    expect(screen.getByRole('button', { name: 'Нет изменений' })).toBeDisabled();
    fireEvent.change(screen.getByDisplayValue('7701234567'), { target: { value: '123' } });
    expect(screen.getByText('ИНН должен содержать 10 или 12 цифр')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Сохранить' })).toBeDisabled();
    fireEvent.change(screen.getByDisplayValue('https://example.ru'), { target: { value: 'example' } });
    expect(screen.getByText('Укажите полный адрес сайта, включая https://')).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  test('submits a valid changed profile', () => {
    const onSave = jest.fn();
    render(<CompanyProfile value={value} onSave={onSave} />);
    fireEvent.change(screen.getByDisplayValue('Услуги'), { target: { value: 'Ритейл' } });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ industry: 'Ритейл' }));
  });
});
