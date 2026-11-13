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

const YEAR = d => (d || '').slice(0, 4);

// One picture of a real letter: its first page, linking to the letter on the
// Wayback Machine. The alt text says whose letter and to whom, because the
// picture is the letter and should be described as one.
function shot(c, s, caption) {
  const alt = `First page of a letter from ${s.member}${s.to ? ` to ${s.to}` : ''}`
    + `${YEAR(s.date) ? `, ${YEAR(s.date)}` : ''}`;
  return el('a', { href: s.url, title: `${alt}. Opens the letter on the Wayback Machine.` },
    el('img', { src: `${base(c)}${s.thumb}?v=${stampOf(c.number)}`, alt, loading: 'lazy',
                width: 170, height: 220 }),
    caption ? el('span', {}, `${s.member}${YEAR(s.date) ? ` · ${YEAR(s.date)}` : ''}`) : null);
}

function renderList() {
  const loaded = [...HUB.congresses].sort((a, b) => b.number - a.number)
    .map(c => [c, INDEXES.get(c.number)]);
  const ok = loaded.filter(([, i]) => i && !i.failed);
  const max = Math.max(1, ...ok.map(([, i]) => i.letters || 0));

  fill($('#congresses'), loaded.map(([c, idx]) => {
    if (!idx) return el('div', { class: 'congress missing' }, el('div', { class: 'nm' }, c.label || `${c.number}th`), el('div', { class: 'dt' }, 'Loading…'));
    if (idx.failed) {
      return el('div', { class: 'congress missing' },
        el('div', { class: 'nm' }, c.label || `Congress ${c.number}`),
        el('div', { class: 'dt' }, `Could not load (${idx.failed})`));
    }
    const k = idx.congress || {};
    // A card, not one big link, so the About link and the pictures sit beside
    // the explorer link rather than inside it.
    return el('div', { class: 'congress' },
      el('a', { class: 'nm', href: congressLink(c) }, `${k.ordinal || c.number} Congress`),
      el('div', { class: 'dt' }, k.dates || ''),
      el('div', { class: 'ct tab' }, el('b', {}, num(idx.letters)), ' letters · ',
        num(idx.members_with_letters), ' of ', num(idx.members_total), ' members'),
      el('div', { class: 'bar' }, el('i', { style: `width:${Math.max(2, (idx.letters / max) * 100)}%` })),
      (c.samples || []).length
        ? el('div', { class: 'shots' }, ...(c.samples || []).map(s => shot(c, s, false)))
        : null,
      el('div', { class: 'acts' },
        el('a', { href: congressLink(c) }, 'Open the explorer'),
        // The data download is on the explorer's About page now.
        el('a', { href: congressLink(c, 'view=about') }, 'About and data')));
  }));

  // Letters by Congress, oldest to newest, so the growth reads left to right.
  const chrono = [...ok].sort((a, b) => a[0].number - b[0].number);
  fill($('#chart'),
    el('div', { class: 'bars', role: 'list' }, ...chrono.map(([c, i]) => {
      const k = i.congress || {};
      return el('a', { href: congressLink(c), role: 'listitem',
                       'aria-label': `${k.ordinal} Congress, ${k.dates || ''}: ${num(i.letters)} letters` },
        el('span', { class: 'v' }, num(i.letters)),
        // 85% at most, leaving room above the tallest bar for its number.
        el('i', { style: `height:${Math.max(1.5, (i.letters / max) * 85)}%` }));
    })),
    el('div', { class: 'axis', 'aria-hidden': 'true' }, ...chrono.map(([c, i]) => {
      const k = i.congress || {};
      return el('span', {}, k.ordinal || c.number, el('small', {}, (k.start || '').slice(0, 4)));
    })));

  // The opening pictures: one letter from each of the four newest Congresses,
  // by four different members.
  const used = new Set();
  const picks = [];
  for (const [c, i] of loaded) {
    if (!i || i.failed || picks.length >= 4) continue;
    const s = (c.samples || []).find(x => !used.has(x.member_id));
    if (s) { used.add(s.member_id); picks.push([c, s]); }
  }
  fill($('#pages'), picks.map(([c, s]) => shot(c, s, true)));

  if (ok.length) {
    const letters = ok.reduce((s, [, i]) => s + (i.letters || 0), 0);
    const people = new Set();
    for (const [, i] of ok) for (const m of i.members || []) if (m.letters) people.add(m.id);
    const years = ok.map(([, i]) => i.congress || {}).filter(k => k.start);
    const first = years.length ? Math.min(...years.map(k => +k.start.slice(0, 4))) : '';
    const last = years.length ? Math.max(...ok.map(([, i]) => (i.span || [])[1] || 0)) : '';
    fill($('#stats'),
      el('div', { class: 'stat' }, el('b', {}, num(letters)), el('span', {}, 'letters')),
      el('div', { class: 'stat' }, el('b', {}, num(people.size)), el('span', {}, 'members who wrote them')),
      el('div', { class: 'stat' }, el('b', {}, String(ok.length)), el('span', {}, `Congresses, ${first}–${last}`)));
    $('#totals').textContent = `${num(letters)} letters from ${num(people.size)} members, `
      + `across ${ok.length} Congresses${first ? `, ${first}–${last}` : ''}.`
      + (ok.length < HUB.congresses.length ? ` ${HUB.congresses.length - ok.length} could not be loaded.` : '');
  }
}

// ----------------------------------------------------------- the search

// A letter's Wayback address. search.json gives each letter's place in its
// member's file (payload/member/<id>.json), which holds its URL key and
// capture time; columns come from the explorer's index.json. One fetch per
// member per Congress, shared by every row that needs it.
const MEMBER_FILES = new Map();
function letterUrl(c, id, rowIdx) {
  const idx = INDEXES.get(c.number) || {};
  const key = `${c.number}/${id}`;
  if (!MEMBER_FILES.has(key)) {
    MEMBER_FILES.set(key, fetch(`${base(c)}${idx.data_base || 'payload/member/'}${encodeURIComponent(id)}.json?v=${stampOf(c.number)}`)
      .then(r => (r.ok ? r.json() : null)).catch(() => null));
  }
  return MEMBER_FILES.get(key).then(rows => {
    const row = rows && rows[rowIdx];
    const cols = idx.columns || [];
    const k = row && row[cols.indexOf('key')];
    const ts = row && row[cols.indexOf('timestamp')];
    return k && /^\d{14}$/.test(ts || '') ? `https://web.archive.org/web/${ts}id_/${k}` : null;
  });
}

let searchRun = 0;

// A vocabulary term's letters, exactly: a topic by its tag, a member by who
// wrote the letter, an organization or person by every name the letters use
// for it as recipient ("Navy" and "Secnav" for the Department of the Navy;
// "Wheeler" only in the years that were Wheeler at that office).
function termMatcher(node) {
  if (node.kind === 'topic') {
    return (row) => (row.topics || '').split(/[;,]/).some(t => t.trim() === node.label);
  }
  if (node.kind === 'member') {
    // The letters a member wrote, and those reviews say were addressed to
    // them ("Grassley", "Boehner and Pelosi"): node.names holds only those
    // reviewed recipient names (build_vocabulary.py).
    const id = node.id.slice(2);
    const to = new Set((node.names || []).map(n => n.toLowerCase()));
    return (row) => row.member === id
      || (to.size > 0 && to.has((row.recipient || '').toLowerCase()));
  }
  // A committee: the letters on its stationery, which carry its name as a
  // tag (committees.py), as well as the letters addressed to it.
  const tagged = node.tag
    ? (row) => (row.topics || '').split(/[;,]/).some(t => t.trim() === node.tag)
    : () => false;
  const plain = new Set();
  const dated = [];
  for (const n of node.names || [node.label]) {
    const m = n.match(/^(.*)@(\d{4})-(\d{4})$/);
    if (m) dated.push([m[1].toLowerCase(), m[2], m[3]]); else plain.add(n.toLowerCase());
  }
  return (row) => {
    if (tagged(row)) return true;
    const r = (row.recipient || '').toLowerCase();
    if (!r) return false;
    if (plain.has(r)) return true;
    const y = String(row.year || '');
    return dated.some(([nm, lo, hi]) => nm === r && y >= lo && y <= hi);
  };
}

function findNode(nodes, id) {
  for (const n of nodes || []) {
    if (n.id === id) return n;
    const hit = findNode(n.children, id);
    if (hit) return hit;
  }
  return null;
}

// ------------------------------------------------------------- full text
// Every explorer carries a Pagefind index of its letters' own text
// (build/build_search.py). The home page loads the newest Congress's and
// merges in the others, so one search ranks letters across all of them.
// A Congress whose index is missing is left out and the status says so.
let fullTextLoad = null;
function fullTextIndex() {
  return (fullTextLoad ??= (async () => {
    const byNumber = new Map(HUB.congresses.map(c => [c.number, c]));
    // hub.json says which explorers have an index (build_hub.py).
    const present = [...HUB.congresses].filter(c => c.search).sort((a, b) => b.number - a.number);
    if (!present.length) return null;
    // Absolute addresses: Pagefind otherwise looks for its files beside this
    // page rather than beside the explorer the index belongs to.
    const at = c => new URL(`${c.path}pagefind/`, location.href).href;
    const pf = await import(`${at(present[0])}pagefind.js`);
    await pf.options({ basePath: at(present[0]) });
    for (const c of present.slice(1)) await pf.mergeIndex(at(c));
    return { pf, byNumber, present: present.length };
  })().catch(() => null));
}

// Pagefind escapes the letter's text and wraps matches in <mark>; built as
// nodes, never inserted as markup, so nothing in a letter can become markup.
const decodeEntities = s => s.replace(/&(lt|gt|quot|#39|#x27|amp);/g,
  m => ({ '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&#x27;': "'", '&amp;': '&' })[m]);
function excerptNodes(html) {
  const out = [];
  let on = false;
  for (const piece of String(html || '').split(/(<mark>|<\/mark>)/)) {
    if (piece === '<mark>') { on = true; continue; }
    if (piece === '</mark>') { on = false; continue; }
    if (piece) out.push(on ? el('mark', {}, decodeEntities(piece)) : decodeEntities(piece));
  }
  return out;
}

function fullTextSection(query, run) {
  const status = el('p', { class: 'status', role: 'status' }, 'Searching the text of the letters…');
  const list = el('ol', { class: 'fulltext-list' });
  const more = el('button', { class: 'more-btn', type: 'button' });
  const section = el('section', { class: 'fulltext-sec', 'aria-labelledby': 'ft-h' },
    el('h2', { class: 'sec', id: 'ft-h' }, 'In the letters’ own words'), status, list);
  (async () => {
    const ix = await fullTextIndex();
    if (run !== searchRun) return;
    if (!ix) { status.textContent = 'Full-text search is not available yet.'; return; }
    const res = await ix.pf.search(query.trim());
    if (run !== searchRun) return;
    const total = res.results.length;
    const missing = HUB.congresses.length - ix.present;
    status.textContent = (total
      ? `${num(total)} letters contain “${query.trim()}”, across ${ix.present} Congresses.`
      : `No letter’s text contains “${query.trim()}”.`)
      + ' About two thirds of letters have readable text; scans are read by OCR.'
      + (missing ? ` ${missing} Congresses are not searchable by text yet.` : '');
    let next = 0;
    const page = async () => {
      const batch = await Promise.all(res.results.slice(next, next + 20).map(r => r.data()));
      next += batch.length;
      list.append(...batch.map(d => {
        const m = d.meta || {};
        const c = ix.byNumber.get(Number(m.congress));
        const ids = (m.member_ids || '').split(';').filter(Boolean);
        const names = (m.members || '').split('; ');
        const who = ids.map((id, i) => c
          ? el('a', { href: congressLink(c, `member=${encodeURIComponent(id)}`) }, names[i] || id)
          : (names[i] || id));
        return el('li', { class: 'fulltext' },
          el('a', { class: 'ft-title', href: d.url, target: '_blank', rel: 'noopener' }, m.title || 'Letter'),
          el('span', { class: 'ft-meta' },
            c ? el('a', { href: congressLink(c) }, `${(INDEXES.get(c.number)?.congress || {}).ordinal || c.number} Congress`) : null,
            c ? ' · ' : null,
            ...who.flatMap((a, i) => (i ? [', ', a] : [a])),
            m.recipient ? ` to ${m.recipient}` : '',
            m.date ? ` · ${m.date}` : '',
            m.source === 'ocr'
              ? el('span', { class: 'ocr', title: 'Read by OCR from a scanned page; the excerpt may contain misreadings' }, 'OCR')
              : null),
          el('p', { class: 'ft-excerpt' }, ...excerptNodes(d.excerpt)));
      }));
      if (next < total) { more.textContent = `Show more — ${num(total - next)} more`; if (!more.isConnected) section.append(more); }
      else more.remove();
    };
    more.addEventListener('click', page);
    if (total) await page();
  })().catch(() => { status.textContent = 'Full-text search is unavailable right now.'; });
  return section;
}

async function runSearch(query, term) {
  const run = ++searchRun;
  const needle = term ? '' : (query || '').trim().toLowerCase();
  const match = term ? termMatcher(term) : null;
  const out = $('#results');
  $('#list').hidden = !!(needle || term);
  if (!needle && !term) { out.replaceChildren(); return; }

  const newest = [...HUB.congresses].sort((a, b) => b.number - a.number)
    .filter(c => { const i = INDEXES.get(c.number); return i && !i.failed; });

  // Members first: everything they need is already in the indexes.
  const people = new Map();
  for (const c of (term ? [] : newest)) {
    for (const m of INDEXES.get(c.number).members || []) {
      if (!m.name.toLowerCase().includes(needle)) continue;
      const p = people.get(m.id) || { m, terms: [] };
      p.terms.push([c, m.letters || 0]);
      people.set(m.id, p);
    }
  }
  const peopleList = [...people.values()]
    .sort((a, b) => b.terms.reduce((s, t) => s + t[1], 0) - a.terms.reduce((s, t) => s + t[1], 0));

  const status = el('p', { class: 'status', role: 'status' }, `Searching ${newest.length} Congresses…`);
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
    el('h2', { class: 'sec' }, term ? `Letters: ${term.label}` : 'Letters'),
    term ? el('p', { class: 'secnote' }, el('a', { href: '?view=topics' }, '← Congress Member or Topic'),
      term.kind === 'member'
        ? ((term.names || []).length
          ? ` · the letters they wrote, and those addressed to them as ${term.names.join(', ')}`
          : ' · the letters they wrote')
        : term.tag ? ' · the letters written on its stationery, and those addressed to it'
        : (term.names || []).length > 1 ? ` · also written as ${term.names.filter(n => n !== term.label).map(n => n.replace(/@(\d{4})-(\d{4})$/, ' ($1–$2)')).join(', ')}` : '',
      ...seeAlso(term, ' · See also: ')) : null,
    status,
    ...groups.values(),
    term ? null : fullTextSection(query, run));

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
      // The members whose own name matches, so a search for a member finds
      // the letters they wrote, not only letters that mention them.
      const writers = new Set();
      data.members.forEach((id, i) => {
        if ((names.get(id) || '').toLowerCase().includes(needle)) writers.add(i);
      });
      for (const [mIdx, rIdx, year, rowIdx, subject, exact, topics] of data.rows) {
        const recipient = rIdx >= 0 ? data.recipients[rIdx] : '';
        if (match ? match({ member: data.members[mIdx], recipient, year, topics })
            : (writers.has(mIdx)
            || subject.toLowerCase().includes(needle)
            || recipient.toLowerCase().includes(needle)
            || (topics || '').toLowerCase().includes(needle))) {
          hits.push([data.members[mIdx], recipient, year, subject, exact, rowIdx]);
          if (hits.length >= CAP) break;
        }
      }
      hits.sort((a, b) => (b[2] || 0) - (a[2] || 0) || (b[4] - a[4]));
      total += hits.length;
      if (!hits.length) {
        box.replaceChildren();
      } else {
        const all = `view=search&q=${encodeURIComponent(query.trim())}`;
        const row = ([id, to, year, subject, exact, rowIdx]) => {
          // The subject opens the letter itself. Until the member's file has
          // given its Wayback address, it opens the member's page instead.
          const open = el('a', { href: congressLink(c, `member=${encodeURIComponent(id)}`),
                                 target: '_blank', rel: 'noopener' },
            marked(subject || 'Open the letter', needle));
          letterUrl(c, id, rowIdx).then(url => {
            if (url) { open.href = url; open.title = 'Opens the letter on the Wayback Machine'; }
          });
          return el('tr', {},
            el('td', { class: 'yr tab', title: exact ? null : 'Year first archived; the letter carries no date' }, year ? `${year}${exact ? '' : '*'}` : ''),
            el('td', { class: 'who' }, el('a', { href: congressLink(c, `member=${encodeURIComponent(id)}`) }, names.get(id) || id)),
            el('td', { class: 'to' }, marked(to, needle)),
            el('td', {}, open));
        };
        const tbody = el('tbody', {}, ...hits.slice(0, PER_CONGRESS).map(row));
        // A term's letters can't be handed to the explorer's own search, so
        // the rest open here; a word search links to the explorer, as before.
        const more = hits.length <= PER_CONGRESS ? null : term
          ? el('button', { class: 'more-btn', type: 'button', onclick: e => {
            tbody.append(...hits.slice(PER_CONGRESS).map(row)); e.target.remove();
          } }, `Show all ${num(hits.length)}`)
          : el('p', { class: 'more' }, el('a', { href: congressLink(c, all) },
            `All ${num(hits.length)} in the ${k.ordinal} Congress →`));
        fill(box,
          el('h3', {},
            el('a', { class: 'nm', href: congressLink(c) }, `${k.ordinal} Congress`),
            el('span', { class: 'ct tab' }, `${num(hits.length)}${hits.length >= CAP ? '+' : ''} letters`)),
          el('table', { class: 'hits' }, tbody),
          more);
      }
    }
    status.textContent = done < newest.length
      ? `${num(total)} letters so far; ${newest.length - done} Congresses still to search…`
      : `${num(total)} letters across ${newest.length - failed} Congresses.`
        + (failed ? ` ${failed} could not be searched.` : '')
        + (total ? '' : ' Nothing matched.');
  }));
}

// ------------------------------------------------------------- by topic
//
// The Letters from Congress vocabulary (vocabulary/, build_vocabulary.py) as
// a tree: topics, organizations, members, and the recipients nobody has
// reviewed yet, each level alphabetical. A term opens its letters through the
// search, which matches topics, recipients and member names.

let TREE = null;

// A term's related terms (vocabulary/related.csv), as links: "See also:
// Citigroup" on Citibank, and the reverse.
function seeAlso(node, lead) {
  const see = node.see || [];
  if (!see.length) return [];
  return [lead, ...see.flatMap((s, i) => [i ? ', ' : '',
    el('a', { href: `?term=${encodeURIComponent(s.id)}` }, s.label)])];
}
const MEMBERS_SECTION = 'C-congress-members';

function treeNode(n, needle, depth) {
  const kids = (n.children || []).map(c => treeNode(c, needle, depth + 1)).filter(Boolean);
  const hit = needle && n.label.toLowerCase().includes(needle);
  if (needle && !hit && !kids.length) return null;
  const unrev = n.status === 'candidate';
  if (n.kind === 'category') {
    // No count of terms beside a category (EXPLORERS.md, 2026-11-13).
    // Top-level sections start open, except Congress Members: it comes
    // first and stays collapsed, being 1,600 names long. A search opens all.
    const open = (depth === 0 && n.id !== MEMBERS_SECTION) || Boolean(needle);
    return el('li', {}, el('details', { open },
      el('summary', {}, el('span', { class: 'cat' }, marked(n.label, needle))),
      n.id === MEMBERS_SECTION ? el('span', { class: 'hint' },
        'Members with letters. ', el('a', { href: '?view=by-member' },
          'Every member of Congress, letters or not, with years served, party and state →')) : null,
      n.label === 'Committees' ? el('span', { class: 'hint' },
        'Letters written on a committee’s stationery, read from the letterhead, and letters addressed to the committee.') : null,
      n.label === 'Not yet reviewed' ? el('span', { class: 'hint' },
        'Recipients as the letters’ file names give them. Not yet checked: some are fragments, some the same name written two ways.') : null,
      el('ul', {}, ...kids)));
  }
  const link = el('a', { href: `?term=${encodeURIComponent(n.id)}`, class: unrev ? 'unrev' : null,
                         title: `Letters for ${n.label}` }, marked(n.label, needle));
  const line = [link,
    n.letters ? el('span', { class: 'n' }, `${num(n.letters)} letters`
      + (n.kind === 'member' && n.to ? ` · ${num(n.to)} to them` : '')) : null,
    (n.see || []).length ? el('span', { class: 'n' }, ...seeAlso(n, 'See also: ')) : null];
  if (kids.length) {
    return el('li', {}, el('details', { open: Boolean(needle) },
      el('summary', {}, ...line), el('ul', {}, ...kids)));
  }
  return el('li', {}, ...line);
}

async function showTopics(filter) {
  $('#list').hidden = true;
  const out = $('#results');
  if (!TREE) {
    fill(out, el('p', { class: 'status' }, 'Loading the vocabulary…'));
    try {
      const r = await fetch(`vocabulary-tree.json?v=${HUB.built}`);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      TREE = await r.json();
    } catch (err) {
      fill(out, el('p', { class: 'status' }, `Could not load the vocabulary: ${err.message || err}`));
      return;
    }
  }
  const needle = (filter || '').trim().toLowerCase();
  // Congress Members comes first, collapsed (EXPLORERS.md, 2026-11-13);
  // the rest keep the vocabulary's order: Committees, Government officials,
  // Topics, Companies and organizations, Foreign and international, and
  // Not yet reviewed.
  const ordered = [...TREE.filter(n => n.id === MEMBERS_SECTION),
                   ...TREE.filter(n => n.id !== MEMBERS_SECTION)];
  const tree = el('ul', {}, ...ordered.map(n => treeNode(n, needle, 0)).filter(Boolean));
  const box = el('input', { type: 'search', value: filter || '', placeholder: 'Find a topic, an agency, a member…',
                            'aria-label': 'Find a term' });
  box.addEventListener('input', () => {
    clearTimeout(window.__vt);
    window.__vt = setTimeout(() => {
      const q = box.value;
      history.replaceState({}, '', `?view=topics${q ? `&find=${encodeURIComponent(q)}` : ''}`);
      showTopics(q).then(() => { const b = $('.vocab input'); b.focus(); b.setSelectionRange(b.value.length, b.value.length); });
    }, 200);
  });
  fill(out, el('section', { class: 'vocab' },
    el('h2', { class: 'sec' }, 'Congress Member or Topic'),
    el('p', { class: 'secnote' },
      'The Letters from Congress vocabulary: the members who wrote the letters, the committees they wrote for, ',
      'the officials, organizations and people they wrote to, and what the letters are about. ',
      'Alphabetical at every level; select a term to see its letters. ',
      el('a', { href: '?view=by-member' }, 'Members of Congress'),
      ' lists every member, including those with no letters found.'),
    el('div', { class: 'tools' }, box,
      el('button', { type: 'button', onclick: () => out.querySelectorAll('.tree details').forEach(d => { d.open = true; }) }, 'Open all'),
      el('button', { type: 'button', onclick: () => out.querySelectorAll('.tree details').forEach((d, i) => { d.open = false; }) }, 'Close all')),
    el('div', { class: 'tree' }, tree.children.length ? tree : el('p', { class: 'status' }, 'Nothing matches.'))));
}

// ------------------------------------------------------------ by member
//
// Every member of every Congress the explorers cover, letters or not, one row
// per person, gathered from the explorers' index.json files. A member with no
// letters is listed too: each explorer's member page links their website as
// archived during that Congress, which shows it was looked at (#79).
//
// ?view=by-member, not ?view=members: on the Internet Archive Canada address,
// ?view=members is an old 119th-explorer link and is forwarded there
// (publish_iac.sh). ?person= likewise, not ?member=.

function everyMember() {
  const byId = new Map();
  const oldest = [...HUB.congresses].sort((a, b) => a.number - b.number);
  for (const c of oldest) {
    const idx = INDEXES.get(c.number);
    if (!idx || idx.failed) continue;
    for (const m of idx.members || []) {
      const p = byId.get(m.id) || { id: m.id, terms: [], parties: [], states: [], chambers: [],
                                     since: m.since, letters: 0 };
      p.name = m.name; p.last = m.last;       // the newest Congress's spelling
      p.terms.push([c, m.letters || 0]);
      p.letters += m.letters || 0;
      if (m.since && (!p.since || m.since < p.since)) p.since = m.since;
      // Service ends where the newest Congress says it does: its "until", or
      // the date the member left during it; neither means still serving.
      p.until = m.until || (m.left ? +m.left.slice(0, 4) : null);
      for (const [list, v] of [[p.parties, m.party], [p.states, m.state],
                               [p.chambers, m.chamber === 'sen' ? 'Senate' : 'House']]) {
        if (v && !list.includes(v)) list.push(v);
      }
      byId.set(m.id, p);
    }
  }
  return [...byId.values()];
}

const yearsServed = p => (p.since ? `${p.since}–${p.until || 'present'}` : '');

// A party switch arrives as "Democrat → Republican (2004-08-09)", and the
// Congresses before it say just "Democrat". Show the path once, without the
// dates, and drop any party already inside a longer path.
function partyLine(parties) {
  const plain = parties.map(x => x.replace(/\s*\(\d{4}-\d{2}-\d{2}\)/g, '').trim()).filter(Boolean);
  const steps = s => s.split(/\s*→\s*/);
  const keep = plain.filter((x, i) => plain.indexOf(x) === i
    && !plain.some(y => y !== x && steps(y).length > steps(x).length
      && steps(x).every(s => steps(y).includes(s))));
  return keep.join(', ');
}

function showPerson(id) {
  const p = everyMember().find(x => x.id === id);
  const out = $('#results');
  if (!p) { fill(out, el('p', { class: 'status' }, 'No member with that ID in these Congresses.')); return; }
  const back = el('a', { href: '?view=by-member' }, '← By member');
  fill(out, el('section', { class: 'members-sec' },
    el('p', { class: 'secnote' }, back),
    el('div', { class: 'person' },
      el('h2', { class: 'nm' }, p.name),
      el('div', { class: 'meta' }, [p.chambers.join(', '), yearsServed(p), partyLine(p.parties),
        p.states.join(', '), `${num(p.letters)} ${p.letters === 1 ? 'letter' : 'letters'}`]
        .filter(Boolean).join(' · ')),
      el('p', { class: 'small' }, p.letters
        ? 'Each Congress they served in. Select one to see their letters there.'
        : 'No letters found in any Congress they served in. Select one to see their website as the Wayback Machine archived it then.'),
      el('div', { class: 'chips' }, ...[...p.terms].reverse().map(([c, n]) =>
        el('a', { href: congressLink(c, `member=${encodeURIComponent(p.id)}`),
                  title: `${p.name} in the ${(INDEXES.get(c.number).congress || {}).ordinal} Congress` },
          `${(INDEXES.get(c.number).congress || {}).ordinal || c.number} · ${num(n)}`))))));
}

function showMembers(find, sort) {
  $('#list').hidden = true;
  const out = $('#results');
  const all = everyMember();
  const needle = (find || '').trim().toLowerCase();
  const rows = all.filter(p => !needle || p.name.toLowerCase().includes(needle)
    || p.states.some(s => s.toLowerCase() === needle));
  if (sort === 'letters') rows.sort((a, b) => b.letters - a.letters || a.last.localeCompare(b.last));
  else if (sort === 'state') rows.sort((a, b) => a.states[0].localeCompare(b.states[0]) || a.last.localeCompare(b.last));
  else rows.sort((a, b) => a.last.localeCompare(b.last) || a.name.localeCompare(b.name));
  const withLetters = all.filter(p => p.letters).length;

  const url = (f, s) => `?view=by-member${f ? `&find=${encodeURIComponent(f)}` : ''}${s && s !== 'name' ? `&sort=${s}` : ''}`;
  const box = el('input', { type: 'search', value: find || '', placeholder: 'Find a member, or a state (CA)…',
                            'aria-label': 'Find a member' });
  const order = el('select', { 'aria-label': 'Sort by' },
    ...[['name', 'By surname'], ['letters', 'Most letters'], ['state', 'By state']].map(([v, t]) =>
      el('option', { value: v, selected: (sort || 'name') === v }, t)));
  const redo = () => {
    history.replaceState({}, '', url(box.value, order.value));
    showMembers(box.value, order.value);
    const b = $('.members-sec input'); b.focus(); b.setSelectionRange(b.value.length, b.value.length);
  };
  box.addEventListener('input', () => { clearTimeout(window.__mt); window.__mt = setTimeout(redo, 200); });
  order.addEventListener('change', () => { history.replaceState({}, '', url(box.value, order.value)); showMembers(box.value, order.value); });

  fill(out, el('section', { class: 'members-sec' },
    el('h2', { class: 'sec' }, 'By member'),
    el('p', { class: 'secnote' },
      `Every member of Congress in these explorers: ${num(all.length)} people, `
      + `${num(withLetters)} with letters found and ${num(all.length - withLetters)} without. `
      + 'A member with no letters still links to their website as the Wayback Machine archived it, '
      + 'so you can see what was there.'),
    el('div', { class: 'tools' }, box, order),
    el('p', { class: 'status', role: 'status' }, `${num(rows.length)} of ${num(all.length)} members`),
    rows.length
      ? el('table', { class: 'members' },
        el('thead', {}, el('tr', {},
          el('th', { scope: 'col' }, 'Member'), el('th', { scope: 'col' }, 'Years served'),
          el('th', { scope: 'col' }, 'Party'), el('th', { scope: 'col' }, 'State'),
          el('th', { scope: 'col', class: 'n' }, 'Letters'))),
        el('tbody', {}, ...rows.map(p => el('tr', {},
          el('td', { class: 'who' }, el('a', { href: `?view=by-member&person=${encodeURIComponent(p.id)}` },
            marked(p.name, needle)), el('span', { class: 'ch' }, p.chambers.join(', '))),
          el('td', { class: 'tab' }, yearsServed(p)),
          el('td', {}, partyLine(p.parties)),
          el('td', {}, p.states.join(', ')),
          el('td', { class: `n tab${p.letters ? '' : ' none'}` }, num(p.letters))))))
      : el('p', { class: 'status' }, 'No member matches.')));
}

// ------------------------------------------------------------- about
//
// ?view=about: what the whole collection is, how it was built and what it
// misses. Each explorer's own About page keeps that Congress's figures and its
// data download; this one adds them up from the same index.json files.

function showAbout() {
  const out = $('#results');
  const ok = [...HUB.congresses].sort((a, b) => a.number - b.number)
    .map(c => [c, INDEXES.get(c.number)]).filter(([, i]) => i && !i.failed);
  const letters = ok.reduce((s, [, i]) => s + (i.letters || 0), 0);
  const wrote = everyMember().filter(p => p.letters).length;
  const first = ok[0] && (ok[0][1].congress || {});
  const last = ok.length && (ok[ok.length - 1][1].congress || {});
  const built = ok.map(([, i]) => i.built).filter(Boolean).sort().pop();
  fill(out, el('section', { class: 'about' },
    el('h2', { class: 'sec' }, 'About Letters from Congress'),

    el('p', {}, `Letters that members of Congress published on their own websites — to
      government agencies, companies, the President and each other — as the Wayback
      Machine archived them: ${num(letters)} letters from ${num(wrote)} members, from the
      ${first.ordinal || ''} Congress to the ${last.ordinal || ''}. Each Congress has its
      own explorer; this page searches across them all, by `,
      el('a', { href: '?view=topics' }, 'topic'), ' and by ',
      el('a', { href: '?view=by-member' }, 'member'), '.'),

    el('h3', {}, 'Why the archive matters'),
    el('p', {}, `When a member of Congress leaves office, their website may not remain.
      The Wayback Machine archived these sites, so for many of these letters the archive
      is the only copy left.`),

    el('h3', {}, 'What’s missing'),
    el('p', {}, `Only letters the Wayback Machine archived and we have found so far. Older
      Congresses have fewer.`),

    el('h3', {}, 'Each Congress, and its data'),
    el('table', { class: 'members' }, el('thead', {}, el('tr', {},
        el('th', { scope: 'col' }, 'Congress'), el('th', { scope: 'col', class: 'n' }, 'Letters'),
        el('th', { scope: 'col' }, 'About and data'))),
      el('tbody', {}, ...[...ok].reverse().map(([c, i]) => {
        const k = i.congress || {};
        return el('tr', {},
          el('td', {}, el('a', { href: congressLink(c) }, `${k.ordinal || c.number} Congress`),
            k.dates ? el('span', { class: 'ch' }, ` ${k.dates}`) : null),
          el('td', { class: 'n tab' }, num(i.letters)),
          el('td', {}, el('a', { href: congressLink(c, 'view=about') },
            `About the ${k.ordinal || c.number} Congress`)));
      }))),

    el('p', {}, 'Built at the Internet Archive from the Wayback Machine’s archive of ',
      `congressional websites, for Democracy’s Library.${built ? ` Updated ${built}.` : ''}`)));
}

// ------------------------------------------------------------- boot

function fromUrl() {
  const p = new URLSearchParams(location.search);
  const q = p.get('q') || '';
  $('#q').value = q;
  if (p.get('term')) {
    $('#q').value = '';
    const go = () => {
      const node = findNode(TREE, p.get('term'));
      if (node) runSearch('', node);
      else fill($('#results'), el('p', { class: 'status' }, 'That term is not in the vocabulary.'));
    };
    if (TREE) go();
    else fetch(`vocabulary-tree.json?v=${HUB.built}`).then(r => r.json()).then(t => { TREE = t; go(); });
    return;
  }
  if (p.get('view') === 'by-member' && !q) {
    searchRun++;
    if (p.get('person')) showPerson(p.get('person'));
    else showMembers(p.get('find') || '', p.get('sort') || 'name');
    $('#results').scrollIntoView({ block: 'start' });
    return;
  }
  if (p.get('view') === 'about' && !q) {
    searchRun++;
    showAbout();
    $('#results').scrollIntoView({ block: 'start' });
    return;
  }
  if (p.get('view') === 'topics' && !q) {
    searchRun++;
    showTopics(p.get('find') || '').then(() => {
      const v = $('.vocab');
      if (v && !p.get('find')) v.scrollIntoView({ block: 'start' });
    });
    return;
  }
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
