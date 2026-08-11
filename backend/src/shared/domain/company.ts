import { AppError } from '../../core/errors/app-error.js';

export function parseRegistrationDate(value?: string | null): Date | null {
  const normalized = String(value ?? '').trim();
  if (!normalized) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    const date = new Date(`${normalized}T00:00:00.000Z`);
    if (!Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === normalized) return date;
  }

  const ru = normalized.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (ru) {
    const isoDate = `${ru[3]}-${ru[2]}-${ru[1]}`;
    const date = new Date(`${isoDate}T00:00:00.000Z`);
    if (!Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === isoDate) return date;
  }

  throw new AppError({
    code: 'INVALID_REGISTRATION_DATE',
    message: 'Дата регистрации должна быть в формате ДД.ММ.ГГГГ или ГГГГ-ММ-ДД',
    statusCode: 400,
  });
}

export function formatRegistrationDate(value?: Date | null): string {
  if (!value) return '';
  const day = String(value.getUTCDate()).padStart(2, '0');
  const month = String(value.getUTCMonth() + 1).padStart(2, '0');
  return `${day}.${month}.${value.getUTCFullYear()}`;
}

export function inferLegalType(inn?: string | null): 'ul' | 'ip' | null {
  const normalized = String(inn ?? '').replace(/\D/g, '');
  if (normalized.length === 10) return 'ul';
  if (normalized.length === 12) return 'ip';
  return null;
}

export function validateCompanyIdentifiers(input: {
  inn?: string | null;
  kpp?: string | null;
  ogrn?: string | null;
  legalType?: string | null;
}): void {
  const inn = String(input.inn ?? '').replace(/\D/g, '');
  const legalType = ['ip', 'ul', 'smz'].includes(String(input.legalType || ''))
    ? input.legalType
    : inferLegalType(inn);

  if (inn && ![10, 12].includes(inn.length)) {
    throw new AppError({ code: 'INVALID_INN', message: 'ИНН должен содержать 10 или 12 цифр', statusCode: 400 });
  }
  if (legalType === 'ul' && inn && inn.length !== 10) {
    throw new AppError({ code: 'INVALID_INN', message: 'Для юридического лица ИНН должен содержать 10 цифр', statusCode: 400 });
  }
  if (legalType === 'ip' && inn && inn.length !== 12) {
    throw new AppError({ code: 'INVALID_INN', message: 'Для ИП ИНН должен содержать 12 цифр', statusCode: 400 });
  }
  if (legalType === 'smz' && inn && inn.length !== 12) {
    throw new AppError({ code: 'INVALID_INN', message: 'Для самозанятого ИНН должен содержать 12 цифр', statusCode: 400 });
  }

  const kpp = String(input.kpp ?? '').replace(/\D/g, '');
  if (kpp && kpp.length !== 9) {
    throw new AppError({ code: 'INVALID_KPP', message: 'КПП должен содержать 9 цифр', statusCode: 400 });
  }
  if ((legalType === 'ip' || legalType === 'smz') && kpp) {
    throw new AppError({ code: 'INVALID_KPP', message: legalType === 'smz' ? 'Для самозанятого КПП не используется' : 'Для ИП КПП не используется', statusCode: 400 });
  }

  const ogrn = String(input.ogrn ?? '').replace(/\D/g, '');
  if (ogrn && ![13, 15].includes(ogrn.length)) {
    throw new AppError({ code: 'INVALID_OGRN', message: 'ОГРН должен содержать 13 цифр, ОГРНИП — 15 цифр', statusCode: 400 });
  }
  if (legalType === 'ul' && ogrn && ogrn.length !== 13) {
    throw new AppError({ code: 'INVALID_OGRN', message: 'Для юридического лица ОГРН должен содержать 13 цифр', statusCode: 400 });
  }
  if (legalType === 'ip' && ogrn && ogrn.length !== 15) {
    throw new AppError({ code: 'INVALID_OGRN', message: 'Для ИП ОГРНИП должен содержать 15 цифр', statusCode: 400 });
  }
}
