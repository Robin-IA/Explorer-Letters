// Letters from Congress: the page over every per-Congress explorer.
//
// It lists the Congresses and searches across them. Every figure on the page
// is computed from the explorers' own index.json files as they load, never
// typed here or carried over from another source (EXPLORERS.md, "The
// federated explorer"). hub.json only says which explorers exist and where.
//
// Search reads each explorer's payload/search.json, newest Congress first,
// and shows each Congress's matches as they arrive. It matches what the
// explorers' own search matches -- subject, recipient, topics -- plus member
// names, which are gathered across Congresses into one card per person.

const $ = s => document.querySelector(s);
// replaceChildren prints null as the word "null"; el() skips it, this does too.
const fill = (node, ...kids) => node.replaceChildren(...kids.flat().filter(k => k != null && k !== false));
const num = n => Number(n || 0).toLocaleString('en-US');
const PER_CONGRESS = 25;   // matches shown per Congress before "all N"
const CAP = 4000;          // matches counted per Congress, as the explorers do

function el(tag, attrs = {}, ...kids) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    node.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return node;
}

// Wraps each occurrence of the query in <mark>, as text nodes, never HTML.
function marked(text, needle) {
  if (!needle) return text;
  const out = [];
  const low = text.toLowerCase();
  let at = 0;
  for (let i = low.indexOf(needle); i >= 0; i = low.indexOf(needle, at)) {
    out.push(text.slice(at, i), el('mark', {}, text.slice(i, i + needle.length)));
    at = i + needle.length;
  }
  out.push(text.slice(at));
  return out;
}

let HUB = null;
const INDEXES = new Map();   // number -> index.json, or {failed}
const SEARCHES = new Map();  // number -> Promise of search.json

const base = c => c.path.endsWith('/') ? c.path : `${c.path}/`;
const stampOf = n => (INDEXES.get(n) || {}).stamp || '';
const congressLink = (c, qs = '') => `${base(c)}${qs ? `?${qs}` : ''}`;

async function loadIndex(c) {
  try {
    // Revalidated, as each explorer does: a stale index states wrong numbers.
    const r = await fetch(`${base(c)}index.json`, { cache: 'no-cache' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    INDEXES.set(c.number, await r.json());
  } catch (err) {
    INDEXES.set(c.number, { failed: String(err.message || err) });
  }
}

function loadSearch(c) {
  if (!SEARCHES.has(c.number)) {
    const idx = INDEXES.get(c.number) || {};
    const url = `${base(c)}${idx.search_url || 'payload/search.json'}?v=${stampOf(c.number)}`;
    SEARCHES.set(c.number, fetch(url)
      .then(r => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .catch(err => ({ failed: String(err.message || err) })));
  }
  return SEARCHES.get(c.number);
}

// ------------------------------------------------------------- the list

function renderList() {
  const loaded = [...HUB.congresses].sort((a, b) => b.number - a.number)
    .map(c => [c, INDEXES.get(c.number)]);
  const ok = loaded.filter(([, i]) => i && !i.failed);
  const max = Math.max(1, ...ok.map(([, i]) => i.letters || 0));
  $('#congresses').replaceChildren(...loaded.map(([c, idx]) => {
    if (!idx) return el('div', { class: 'congress missing' }, el('div', { class: 'nm' }, c.label || `${c.number}th`), el('div', { class: 'dt' }, 'Loading…'));
    if (idx.failed) {
      return el('div', { class: 'congress missing' },
        el('div', { class: 'nm' }, c.label || `Congress ${c.number}`),
        el('div', { class: 'dt' }, `Could not load (${idx.failed})`));
    }
    const k = idx.congress || {};
    // A card, not one big link, so the download sits beside the explorer link
    // rather than inside it. The download is a placeholder: the data file for
    // each Congress is not built yet, and the page says so rather than
    // offering a link that goes nowhere. When it exists, set c.download in
    // hub.json (build_hub.py) and the link appears.
    return el('div', { class: 'congress' },
      el('a', { class: 'nm', href: congressLink(c) }, `${k.ordinal || c.number} Congress`),
      el('div', { class: 'dt' }, k.dates || ''),
      el('div', { class: 'ct tab' }, el('b', {}, num(idx.letters)), ' letters · ',
        num(idx.members_with_letters), ' of ', num(idx.members_total), ' members'),
      el('div', { class: 'bar' }, el('i', { style: `width:${Math.max(2, (idx.letters / max) * 100)}%` })),
      el('div', { class: 'acts' },
        el('a', { href: congressLink(c) }, 'Open the explorer'),
        c.download
          ? el('a', { href: c.download, download: '' }, 'Download data')
          : el('span', { class: 'soon', title: 'The data file for this Congress is not built yet' },
            'Download data · coming soon')));
  }));

  if (ok.length) {
    const letters = ok.reduce((s, [, i]) => s + (i.letters || 0), 0);
    const people = new Set();
    for (const [, i] of ok) for (const m of i.members || []) if (m.letters) people.add(m.id);
    const years = ok.map(([, i]) => i.congress || {}).filter(k => k.start);
    const first = years.length ? Math.min(...years.map(k => +k.start.slice(0, 4))) : '';
    const last = years.length ? Math.max(...years.map(k => +k.end.slice(0, 4))) : '';
    $('#totals').textContent = `${num(letters)} letters from ${num(people.size)} members, `
      + `across ${ok.length} Congresses${first ? `, ${first}–${last}` : ''}.`
      + (ok.length < HUB.congresses.length ? ` ${HUB.congresses.length - ok.length} could not be loaded.` : '');
    $('#lede').textContent = `Letters that members of Congress published on their own websites, `
      + `preserved by the Wayback Machine. ${num(letters)} of them, one explorer per Congress; `
      + `search here looks across all of them.`;
  }
}

// ----------------------------------------------------------- the search

let searchRun = 0;

async function runSearch(query) {
  const run = ++searchRun;
  const needle = (query || '').trim().toLowerCase();
  const out = $('#results');
  $('#list').hidden = !!needle;
  if (!needle) { out.replaceChildren(); return; }

  const newest = [...HUB.congresses].sort((a, b) => b.number - a.number)
    .filter(c => { const i = INDEXES.get(c.number); return i && !i.failed; });

  // Members first: everything they need is already in the indexes.
  const people = new Map();
  for (const c of newest) {
    for (const m of INDEXES.get(c.number).members || []) {
      if (!m.name.toLowerCase().includes(needle)) continue;
      const p = people.get(m.id) || { m, terms: [] };
      p.terms.push([c, m.letters || 0]);
      people.set(m.id, p);
    }
  }
  const peopleList = [...people.values()]
    .sort((a, b) => b.terms.reduce((s, t) => s + t[1], 0) - a.terms.reduce((s, t) => s + t[1], 0));

  const status = el('p', { class: 'status' }, `Searching ${newest.length} Congresses…`);
  const groups = new Map(newest.map(c => [c.number, el('div', { class: 'group' })]));
  fill(out,
    peopleList.length ? el('h2', { class: 'sec' }, `Members named “${query.trim()}”`) : null,
    peopleList.length ? el('div', { class: 'people' }, ...peopleList.slice(0, 24).map(({ m, terms }) =>
      el('div', { class: 'person' },
        el('div', { class: 'nm' }, marked(m.name, needle)),
        el('div', { class: 'meta' }, [m.chamber === 'sen' ? 'Senate' : 'House', m.state, m.party].filter(Boolean).join(' · '),
          ` · ${num(terms.reduce((s, t) => s + t[1], 0))} letters · served in ${terms.length} `
            + (terms.length === 1 ? 'Congress' : 'Congresses')),
        terms.some(([, n]) => n)
          ? null
          : el('div', { class: 'small' }, `No letters found in ${terms.length === 1 ? 'the one Congress' : `any of the ${terms.length} Congresses`} served.`),
        el('div', { class: 'chips' }, ...terms.filter(([, n]) => n).map(([c, n]) =>
          el('a', { href: congressLink(c, `member=${encodeURIComponent(m.id)}`),
                    title: `${m.name} in the ${(INDEXES.get(c.number).congress || {}).ordinal} Congress` },
            `${(INDEXES.get(c.number).congress || {}).ordinal || c.number} · ${num(n)}`)))))) : null,
    el('h2', { class: 'sec' }, 'Letters'),
    status,
    ...groups.values());

  let total = 0, done = 0, failed = 0;
  await Promise.all(newest.map(async c => {
    const data = await loadSearch(c);
    if (run !== searchRun) return;
    done += 1;
    const box = groups.get(c.number);
    const idx = INDEXES.get(c.number);
    const k = idx.congress || {};
    if (!data || data.failed || !Array.isArray(data.rows)) {
      failed += 1;
      box.replaceChildren(el('p', { class: 'small' }, `${k.ordinal} Congress: search could not be loaded.`));
    } else {
      const names = new Map((idx.members || []).map(m => [m.id, m.name]));
      const hits = [];
      for (const [mIdx, rIdx, year, , subject, exact, topics] of data.rows) {
        const recipient = rIdx >= 0 ? data.recipients[rIdx] : '';
        if (subject.toLowerCase().includes(needle)
            || recipient.toLowerCase().includes(needle)
            || (topics || '').toLowerCase().includes(needle)) {
          hits.push([data.members[mIdx], recipient, year, subject, exact]);
          if (hits.length >= CAP) break;
        }
      }
      hits.sort((a, b) => (b[2] || 0) - (a[2] || 0) || (b[4] - a[4]));
      total += hits.length;
      if (!hits.length) {
        box.replaceChildren();
      } else {
        const all = `view=search&q=${encodeURIComponent(query.trim())}`;
        fill(box,
          el('h3', {},
            el('a', { class: 'nm', href: congressLink(c) }, `${k.ordinal} Congress`),
            el('span', { class: 'ct tab' }, `${num(hits.length)}${hits.length >= CAP ? '+' : ''} letters`)),
          el('table', { class: 'hits' }, el('tbody', {}, ...hits.slice(0, PER_CONGRESS).map(([id, to, year, subject, exact]) =>
            el('tr', {},
              el('td', { class: 'yr tab', title: exact ? null : 'Year first archived; the letter carries no date' }, year ? `${year}${exact ? '' : '*'}` : ''),
              el('td', { class: 'who' }, el('a', { href: congressLink(c, `member=${encodeURIComponent(id)}`) }, names.get(id) || id)),
              el('td', { class: 'to' }, marked(to, needle)),
              el('td', {}, marked(subject || '(no subject)', needle)))))),
          hits.length > PER_CONGRESS
            ? el('p', { class: 'more' }, el('a', { href: congressLink(c, all) },
              `All ${num(hits.length)} in the ${k.ordinal} Congress →`))
            : null);
      }
    }
    status.textContent = done < newest.length
      ? `${num(total)} letters so far; ${newest.length - done} Congresses still to search…`
      : `${num(total)} letters across ${newest.length - failed} Congresses.`
        + (failed ? ` ${failed} could not be searched.` : '')
        + (total ? '' : ' Nothing matched.');
  }));
}

// ------------------------------------------------------------- boot

function fromUrl() {
  const q = new URLSearchParams(location.search).get('q') || '';
  $('#q').value = q;
  runSearch(q);
}

async function boot() {
  const r = await fetch('hub.json', { cache: 'no-cache' });
  if (!r.ok) throw new Error(`hub.json: HTTP ${r.status}`);
  HUB = await r.json();
  renderList();
  await Promise.all(HUB.congresses.map(c => loadIndex(c).then(renderList)));

  $('#search').addEventListener('submit', e => {
    e.preventDefault();
    const q = $('#q').value.trim();
    history.pushState({}, '', q ? `?q=${encodeURIComponent(q)}` : location.pathname);
    runSearch(q);
  });
  $('#q').addEventListener('search', () => {   // the clear button
    if (!$('#q').value) { history.pushState({}, '', location.pathname); runSearch(''); }
  });
  window.addEventListener('popstate', fromUrl);
  fromUrl();
}

boot().catch(err => {
  $('#congresses').replaceChildren(el('p', { class: 'status' }, `Could not load: ${err.message || err}`));
});
