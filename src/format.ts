// Focal-length display formatting shared by the build pipeline and the views.
// Raw focal_length strings are messy ("50mm", "7.5cm", 75, null) — prefer the
// numeric focal_min/max fields and fall back to a cleaned string.

export function fmtFocal(
  raw: string | number | null | undefined,
  minMm?: number | null,
  maxMm?: number | null,
  sep = '–',
): string {
  if (minMm && maxMm) {
    return minMm === maxMm ? `${trim(minMm)}mm` : `${trim(minMm)}${sep}${trim(maxMm)}mm`
  }
  if (raw == null || raw === '') return ''
  const s = String(raw).trim()
  const cm = s.match(/^(\d+(?:\.\d+)?)\s*cm$/i)
  if (cm) return `${trim(parseFloat(cm[1]) * 10)}mm`
  if (/mm$/i.test(s)) return s.replace(/\s*mm$/i, 'mm')
  if (/^\d+(\.\d+)?$/.test(s)) return `${s}mm`
  return s
}

function trim(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10)
}
