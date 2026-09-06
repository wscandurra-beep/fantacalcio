export function playerKey(name, team) {
  return `${String(name).trim()}\u0000${String(team).trim()}`;
}

function parseIsoDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
  if (!match) return null;
  const [year, month, day] = match.slice(1).map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) return null;
  return {year, month, day};
}

/** Calculate completed years at a reference instant (today by default). */
export function calculateAge(dateOfBirth, referenceDate = new Date()) {
  const born = parseIsoDate(dateOfBirth);
  if (!born || !(referenceDate instanceof Date) || Number.isNaN(referenceDate.valueOf())) return null;
  const year = referenceDate.getUTCFullYear();
  const month = referenceDate.getUTCMonth() + 1;
  const day = referenceDate.getUTCDate();
  return year - born.year - (month < born.month || (month === born.month && day < born.day) ? 1 : 0);
}

/** The single application boundary for DOB-derived age and explicit legacy fallback. */
export function resolvePlayerAge(player, referenceDate = new Date()) {
  const derived = calculateAge(player?.dateOfBirth, referenceDate);
  if (derived !== null) return {age: derived, basis: 'dateOfBirth', fallback: false};
  const legacy = Number(player?.legacyAge ?? player?.age);
  if (Number.isInteger(legacy) && legacy >= 15 && legacy <= 50) return {age: legacy, basis: 'legacy', fallback: true};
  return {age: null, basis: 'missing', fallback: false};
}

export function applyDynamicAges(players, referenceDate = new Date()) {
  return players.map(player => {
    const resolved = resolvePlayerAge(player, referenceDate);
    return {...player, age: resolved.age, ageBasis: resolved.basis, ageIsFallback: resolved.fallback};
  });
}
