import { describe, expect, it } from 'vitest';

import { formatCoordsLabel, formatPlaceLabel, looksLikeZip } from './location';

describe('looksLikeZip', () => {
  it('accepts a bare 5-digit code, with or without surrounding space', () => {
    expect(looksLikeZip('79101')).toBe(true);
    expect(looksLikeZip('  79101 ')).toBe(true);
  });

  it('routes anything else to the free-text search endpoint', () => {
    expect(looksLikeZip('Stuttgart, AR')).toBe(false);
    expect(looksLikeZip('7910')).toBe(false);
    expect(looksLikeZip('79101-1234')).toBe(false);
    expect(looksLikeZip('')).toBe(false);
  });
});

describe('formatPlaceLabel', () => {
  const coords = { lat: 35.2219, lng: -101.8313 };

  it('names the place when the geocoder found one', () => {
    expect(formatPlaceLabel({ city: 'Amarillo', state: 'TX' }, coords)).toBe('Amarillo, TX');
  });

  it('does not render a leading comma when the city came back empty', () => {
    // apps/api's parseNominatimAddress types city and state as non-nullable
    // strings that can still be empty, which is normal in open country.
    expect(formatPlaceLabel({ city: '', state: 'TX' }, coords)).toBe('TX');
    expect(formatPlaceLabel({ city: 'Amarillo', state: '' }, coords)).toBe('Amarillo');
  });

  it('falls back to coordinates rather than showing nothing', () => {
    expect(formatPlaceLabel({ city: '', state: '' }, coords)).toBe('35.222, -101.831');
    expect(formatPlaceLabel(null, coords)).toBe('35.222, -101.831');
  });
});

describe('formatCoordsLabel', () => {
  it('rounds to about 100 metres so it fits a header', () => {
    expect(formatCoordsLabel({ lat: 35.2219, lng: -101.8313 })).toBe('35.222, -101.831');
  });
});
