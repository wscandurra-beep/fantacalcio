import {playerKey} from './age-domain.js';

let ages = new Map();
let quality = null;

function decorateMarket() {
  const table = document.querySelector('#marketTable table');
  if (!table || table.dataset.ageEnriched || !ages.size) return;
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
  if (!quality) return;
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

const app = document.querySelector('#app');
if (app) new MutationObserver(decorate).observe(app, {childList: true, subtree: true});

fetch('./data/players.json')
  .then(response => {
    if (!response.ok) throw new Error(`players.json: HTTP ${response.status}`);
    return response.json();
  })
  .then(players => {
    ages = new Map(players.map(player => [playerKey(player.name, player.team), player.age]));
    decorateMarket();
  })
  .catch(error => console.error('Impossibile caricare le età dei giocatori.', error));

fetch('./data/import-quality.json')
  .then(response => {
    if (!response.ok) throw new Error(`import-quality.json: HTTP ${response.status}`);
    return response.json();
  })
  .then(data => {
    quality = data;
    decorateQuality();
  })
  .catch(error => console.error('Impossibile caricare la diagnostica di importazione.', error));
