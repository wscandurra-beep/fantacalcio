import {playerKey} from './age-domain.js';

const [players, quality] = await Promise.all([
  fetch('./data/players.json').then(response => response.json()),
  fetch('./data/import-quality.json').then(response => response.json()),
]);

const ages = new Map(players.map(player => [playerKey(player.name, player.team), player.age]));

function decorateMarket() {
  const table = document.querySelector('#marketTable table');
  if (!table || table.dataset.ageEnriched) return;
  const header = table.tHead?.rows[0];
  if (!header) return;
  const performanceHeader = [...header.cells].find(cell => cell.textContent.trim() === 'PG / MF');
  if (!performanceHeader) return;

  const ageHeader = document.createElement('th');
  ageHeader.textContent = 'Età';
  header.insertBefore(ageHeader, performanceHeader);

  for (const row of table.tBodies[0]?.rows || []) {
    const playerCell = row.cells[1];
    const name = playerCell?.querySelector('b')?.textContent || '';
    const team = (playerCell?.querySelector('.muted')?.textContent || '').split('·')[0].trim();
    const ageCell = document.createElement('td');
    ageCell.textContent = ages.get(playerKey(name, team)) ?? '—';
    row.insertBefore(ageCell, row.cells[7]);
  }
  table.dataset.ageEnriched = 'true';
}

function qualityCard(label, value) {
  const card = document.createElement('div');
  card.className = 'card metric';
  const title = document.createElement('label');
  title.textContent = label;
  const count = document.createElement('strong');
  count.textContent = value;
  card.append(title, count);
  return card;
}

function decorateQuality() {
  const heading = [...document.querySelectorAll('#app h1')].find(item => item.textContent.trim() === 'Data quality');
  const grid = heading?.nextElementSibling;
  if (!grid || grid.dataset.ageEnriched) return;
  grid.append(
    qualityCard('Età associate', quality.ageMatched),
    qualityCard('Nomi ambigui', quality.ambiguousCount),
    qualityCard('Righe statistiche non associate', quality.unmatchedCount),
  );

  const diagnostics = [...quality.ambiguous.map(item => `Ambiguo: ${item.name} (${item.team || 'squadra ignota'})`),
    ...quality.unmatched.slice(0, 40).map(item => `Non associato: ${item.name} (${item.team || 'squadra ignota'})`)];
  if (diagnostics.length) {
    const panel = document.createElement('section');
    panel.className = 'card section';
    const title = document.createElement('h2');
    title.textContent = 'Diagnostica associazioni';
    const list = document.createElement('ul');
    list.className = 'diagnostics';
    for (const diagnostic of diagnostics) {
      const item = document.createElement('li');
      item.textContent = diagnostic;
      list.append(item);
    }
    panel.append(title, list);
    grid.parentElement.append(panel);
  }
  grid.dataset.ageEnriched = 'true';
}

function decorate() {
  decorateMarket();
  decorateQuality();
}

new MutationObserver(decorate).observe(document.querySelector('#app'), {childList: true, subtree: true});
decorate();
