import { describe, expect, it } from 'vitest';
import {
  defaultReportMonth,
  isInsecureOrigin,
  phoneLastDigits,
  termMonths,
  tokenFromHash,
  whatsappLink,
  whatsappNumber,
} from './report-link';

describe('termMonths', () => {
  it('lists the months a term touches, across the new year', () => {
    expect(termMonths('2026-08-17T00:00:00.000Z', '2027-01-15T00:00:00.000Z')).toEqual([
      8, 9, 10, 11, 12, 1,
    ]);
  });
});

describe('defaultReportMonth', () => {
  const months = [8, 9, 10, 11, 12, 1];

  it('picks the month just finished', () => {
    expect(defaultReportMonth(months, new Date('2026-10-28T00:00:00Z'))).toBe(9);
  });

  it('picks the current month in the first month of term', () => {
    expect(defaultReportMonth(months, new Date('2026-08-20T00:00:00Z'))).toBe(8);
  });

  it('falls back to the last month once the term is over', () => {
    expect(defaultReportMonth(months, new Date('2027-03-01T00:00:00Z'))).toBe(1);
  });
});

describe('phoneLastDigits', () => {
  it('matches the server: last four digits, however typed', () => {
    expect(phoneLastDigits('020 5555 1234')).toBe('1234');
    expect(phoneLastDigits('12')).toBeNull();
  });
});

describe('whatsappNumber', () => {
  it('swaps the leading zero for the Lao country code', () => {
    expect(whatsappNumber('02055551234')).toBe('8562055551234');
    expect(whatsappNumber('+856 20 5555 1234')).toBe('8562055551234');
  });

  it('has no number for one too short to dial', () => {
    expect(whatsappNumber('1234')).toBeNull();
  });
});

describe('whatsappLink', () => {
  it('opens a chat with that number and the message filled in', () => {
    expect(whatsappLink('02055551234', 'ສະບາຍດີ & hi')).toBe(
      `https://wa.me/8562055551234?text=${encodeURIComponent('ສະບາຍດີ & hi')}`,
    );
  });

  it('lets the teacher pick the chat when there is no number', () => {
    expect(whatsappLink(null, 'x')).toBe('https://wa.me/?text=x');
  });
});

describe('isInsecureOrigin', () => {
  it('flags plain http', () => {
    expect(isInsecureOrigin({ protocol: 'http:' })).toBe(true);
    expect(isInsecureOrigin({ protocol: 'https:' })).toBe(false);
  });
});

describe('tokenFromHash', () => {
  const token = 'a'.repeat(43);

  it('reads the token from the fragment', () => {
    expect(tokenFromHash(`#${token}`)).toBe(token);
  });

  it('refuses a fragment that could not be a token', () => {
    expect(tokenFromHash('')).toBeNull();
    expect(tokenFromHash('#abc')).toBeNull();
  });
});
