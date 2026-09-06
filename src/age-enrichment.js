import {applyDynamicAges, playerKey} from './age-domain.js';

async function loadJson(path, fallback) {
  try {
    const response = await fetch(path, {cache: 'no-store'});
    const contentType = response.headers.get('content-type') || '';
    if (!response.ok || !contentType.includes('application/json')) return fallback;
    return await response.json();
  } catch {
    return fallback;
  }
}

const [players, quality] = await Promise.all([
  loadJson('./data/players.json', []),
  loadJson('./data/import-quality.json', {ageMatched: 0, ambiguousCount: 0, unmatchedCount: 0, ambiguous: [], unmatched: []}),
]);

const ages = new Map(applyDynamicAges(players).map(player => [playerKey(player.name, player.team), player]));

function decorateMarket() {
  const table = document.querySelector('#marketTable table');
  if (!table || table.dataset.ageEnriched) return;
  const header = table.tHead?.rows[0];
  if (!header) return;
  if ([...header.cells].some(cell => cell.textContent.trim() === 'Età')) {
    table.dataset.ageEnriched = 'true';
    return;
  }
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
    const player = ages.get(playerKey(name, team));
    ageCell.textContent = player?.age ?? '—';
    if (player?.ageIsFallback) {
      ageCell.classList.add('age-fallback');
      ageCell.title = 'Età storica (DOB non disponibile)';
      ageCell.setAttribute('aria-label', `${player.age}, valore storico di fallback`);
    }
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
    qualityCard('Giocatori attivi', quality.activePlayers ?? players.length),
    qualityCard('DOB conosciuta', quality.dobKnown ?? 0),
    qualityCard('DOB mancante', quality.dobMissing ?? players.length),
    qualityCard('Copertura DOB', `${quality.dobCoveragePct ?? 0}%`),
    qualityCard('Fallback età', quality.ageFallback ?? 0),
    qualityCard('Matching ambiguo', quality.dobAmbiguous ?? 0),
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
  const missing = quality.dobMissingPlayers || [];
  if (missing.length) {
    const panel = document.createElement('section');
    panel.className = 'card section dob-missing';
    panel.innerHTML = '<h2>DOB da completare</h2><div class="dob-filters"><input type="search" placeholder="Filtra giocatore o squadra" aria-label="Filtra giocatori senza data di nascita"><select aria-label="Filtra stato fallback"><option value="all">Tutti</option><option value="fallback">Con età fallback</option><option value="none">Senza età</option></select></div><div class="dob-list"></div>';
    const input = panel.querySelector('input');
    const select = panel.querySelector('select');
    const list = panel.querySelector('.dob-list');
    const renderMissing = () => {
      const query = input.value.trim().toLocaleLowerCase('it');
      const filtered = missing.filter(item => `${item.name} ${item.team}`.toLocaleLowerCase('it').includes(query)
        && (select.value === 'all' || (select.value === 'fallback') === Boolean(item.hasLegacyAge)));
      list.textContent = '';
      const table = document.createElement('table');
      table.innerHTML = '<thead><tr><th>ID</th><th>Giocatore</th><th>Squadra</th><th>Stato</th></tr></thead><tbody></tbody>';
      for (const item of filtered) {
        const row = table.tBodies[0].insertRow();
        for (const value of [item.id || '—', item.name, item.team, item.hasLegacyAge ? 'Età fallback' : 'Età assente']) row.insertCell().textContent = value;
      }
      list.append(table);
    };
    input.addEventListener('input', renderMissing);
    select.addEventListener('change', renderMissing);
    renderMissing();
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
