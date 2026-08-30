export function playerKey(name, team) {
  return `${String(name).trim()}\u0000${String(team).trim()}`;
}
