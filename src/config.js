/**
 * Mantra formations supported by the reference workbook and the official
 * Fantacalcio Mantra regulations. Keep this list in configuration so that
 * formation choices are not duplicated in presentation components.
 */
export const FORMATIONS = Object.freeze([
  { id: '3-4-3', label: '3-4-3' },
  { id: '3-4-1-2', label: '3-4-1-2' },
  { id: '3-4-2-1', label: '3-4-2-1' },
  { id: '3-5-2', label: '3-5-2' },
  { id: '3-5-1-1', label: '3-5-1-1' },
  { id: '4-3-3', label: '4-3-3' },
  { id: '4-3-1-2', label: '4-3-1-2' },
  { id: '4-4-2', label: '4-4-2' },
  { id: '4-1-4-1', label: '4-1-4-1' },
  { id: '4-4-1-1', label: '4-4-1-1' },
  { id: '4-2-3-1', label: '4-2-3-1' },
]);

export function isSupportedFormation(formation) {
  return FORMATIONS.some(({ id }) => id === formation);
}
