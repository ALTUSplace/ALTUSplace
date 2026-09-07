import { describe, expect, it } from 'vitest';
import { shapeArabic } from './arabicShaper';

describe('Arabic PDF shaping', () => {
  it('converts connected Arabic letters to presentation forms', () => {
    const shaped = shapeArabic('كراء');
    expect(shaped).not.toBe('كراء');
    expect(Array.from(shaped).some((char) => char.codePointAt(0)! >= 0xFE70 && char.codePointAt(0)! <= 0xFEFF)).toBe(true);
  });

  it('keeps French, numbers and punctuation intact', () => {
    expect(shapeArabic('B2-Rent 2026 / MAD')).toBe('B2-Rent 2026 / MAD');
  });
});
