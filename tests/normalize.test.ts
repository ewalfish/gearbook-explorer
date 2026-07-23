import { describe, it, expect } from 'vitest'
import { normalize, queryVariants, tokenize, slugify } from '../src/normalize'

describe('normalize (PRD §5.4)', () => {
  it('lowercases and folds diacritics', () => {
    expect(normalize('Voigtländer')).toBe('voigtlander')
  })

  it('maps µ/μ to mju', () => {
    expect(normalize('µ-II')).toBe('mju ii')
    expect(normalize('Olympus μ[mju:]-II')).toContain('mju')
  })

  it('converts German comma decimals', () => {
    expect(normalize('Rolleiflex 2,8')).toBe(normalize('Rolleiflex 2.8'))
  })

  it('canonicalizes No. variants', () => {
    expect(normalize('Kodak No. 2 Folding')).toBe(normalize('Kodak No 2 Folding'))
    expect(normalize('N° 2')).toBe(normalize('No. 2'))
  })

  it('converts cm focal lengths to mm', () => {
    expect(normalize('5cm f/2')).toBe(normalize('50mm f/2'))
  })

  it('splits glued digit-letter suffixes both ways', () => {
    expect(normalize('F3HP')).toBe(normalize('F3 HP'))
    expect(normalize('44M')).toBe(normalize('44-M'))
  })

  it('unifies Mk / Mark forms', () => {
    const canonical = normalize('5D Mark II')
    expect(normalize('5D MkII')).toBe(canonical)
    expect(normalize('5D Mk2')).toBe(canonical)
    expect(normalize('5D Mark 2')).toBe(canonical)
    expect(normalize('5d mkii')).toBe(canonical)
  })

  it('strips punctuation to token boundaries', () => {
    expect(normalize('Yashica-Mat')).toBe('yashica mat')
    expect(normalize('S.S.C.')).toBe('s s c')
    expect(normalize('f/1.4')).toBe('f 1.4')
  })

  it('handles empty and junk input without crashing', () => {
    expect(normalize('')).toBe('')
    expect(normalize('   ')).toBe('')
    expect(normalize('!!!')).toBe('')
    expect(() => normalize('x'.repeat(300))).not.toThrow()
  })
})

describe('cross-market query variants', () => {
  const variantStrings = (q: string) =>
    queryVariants(tokenize(q)).map((v) => v.tokens.join(' '))

  it('literal query is always first and never replaced', () => {
    const vs = queryVariants(tokenize('stylus epic'))
    expect(vs[0].sourceLabel).toBeNull()
    expect(vs[0].tokens.join(' ')).toBe('stylus epic')
  })

  it('stylus ↔ mju', () => {
    expect(variantStrings('olympus stylus')).toContain('olympus mju')
    expect(variantStrings('stylus epic')).toContain('mju 2')
  })

  it('maxxum ↔ dynax ↔ alpha', () => {
    expect(variantStrings('maxxum 7000')).toContain('dynax 7000')
    expect(variantStrings('dynax 7000')).toContain('maxxum 7000')
    expect(variantStrings('alpha 7000')).toContain('maxxum 7000')
  })

  it('autoboy ↔ sure shot', () => {
    expect(variantStrings('autoboy')).toContain('sure shot')
  })

  it('kiss ↔ rebel', () => {
    expect(variantStrings('canon kiss')).toContain('canon rebel')
  })
})

describe('slugify', () => {
  it('produces url-safe cosmetic slugs', () => {
    expect(slugify('Canon AE-1')).toBe('canon-ae-1')
    expect(slugify('Olympus Mju-II')).toBe('olympus-mju-ii')
    expect(slugify('Asahi Super-Takumar 50 mm f/ 1.4')).toBe('asahi-super-takumar-50-mm-f-1-4')
  })
})
