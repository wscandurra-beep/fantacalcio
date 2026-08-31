export function applyInjurySnapshot(players, snapshot) {
  const injuries = Array.isArray(snapshot?.injuries) ? snapshot.injuries : [];
  const byPlayerId = new Map(
    injuries
      .filter(record => record?.playerId != null)
      .map(record => [String(record.playerId), record]),
  );

  return players.map(player => {
    const injury = byPlayerId.get(String(player.id));
    const status = injury
      ? [injury.injury || injury.description, injury.expectedReturn && `Rientro: ${injury.expectedReturn}`].filter(Boolean).join(' · ')
      : 'OK';
    return {...player, status};
  });
}

export function normalizeInjuryUpdate(update, snapshot) {
  if (!update || typeof update !== 'object' || !Date.parse(update.updatedAt)) return {};
  const injuries = Array.isArray(snapshot?.injuries) ? snapshot.injuries : [];
  return {...update, currentInjuries: injuries.length};
}

export function formatItalianDate(value) {
  if (!value || !Date.parse(value)) return 'mai';
  return new Intl.DateTimeFormat('it-IT', {
    timeZone: 'Europe/Rome',
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(value));
}
