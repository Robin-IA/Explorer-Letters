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
    // A card, not one big link, so the download and the pictures sit beside
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
        c.download
          ? el('a', { href: c.download, download: '' }, 'Download data')
          : el('span', { class: 'soon', title: 'The data file for this Congress is not built yet' },
            'Download data · coming soon')));
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

// ------------------------------------------------------------- by topic
//
// The Letters from Congress vocabulary (vocabulary/, build_vocabulary.py) as
// a tree: topics, organizations, members, and the recipients nobody has
// reviewed yet, each level alphabetical. A term opens its letters through the
// search, which matches topics, recipients and member names.

let TREE = null;

function treeNode(n, needle, depth) {
  const kids = (n.children || []).map(c => treeNode(c, needle, depth + 1)).filter(Boolean);
  const hit = needle && n.label.toLowerCase().includes(needle);
  if (needle && !hit && !kids.length) return null;
  const unrev = n.status === 'candidate';
  if (n.kind === 'category') {
    // Distinct terms anywhere below: a term nested under another counts, and a
    // member listed under both Senators and Representatives counts once.
    const ids = new Set();
    (function walk(x) { for (const c of x.children || []) { if (c.kind !== 'category') ids.add(c.id); walk(c); } })(n);
    const terms = ids.size;
    const open = depth === 0 || Boolean(needle);
    return el('li', {}, el('details', { open },
      el('summary', {}, el('span', { class: 'cat' }, marked(n.label, needle)),
        el('span', { class: 'n' }, `${num(terms)} ${terms === 1 ? 'term' : 'terms'}`)),
      n.label === 'Not yet reviewed' ? el('span', { class: 'hint' },
        'Recipients as the letters’ file names give them. Not yet checked: some are fragments, some the same name written two ways.') : null,
      el('ul', {}, ...kids)));
  }
  const link = el('a', { href: `?q=${encodeURIComponent(n.label)}`, class: unrev ? 'unrev' : null,
                         title: `Letters for ${n.label}` }, marked(n.label, needle));
  const line = [link,
    n.letters ? el('span', { class: 'n' }, `${num(n.letters)} letters`) : null];
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
  const tree = el('ul', {}, ...TREE.map(n => treeNode(n, needle, 0)).filter(Boolean));
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
    el('h2', { class: 'sec' }, 'By topic'),
    el('p', { class: 'secnote' },
      'The Letters from Congress vocabulary: what the letters are about, the organizations and people they were written to, ',
      'and the members who wrote them. Alphabetical at every level; select a term to see its letters.'),
    el('div', { class: 'tools' }, box,
      el('button', { type: 'button', onclick: () => out.querySelectorAll('.tree details').forEach(d => { d.open = true; }) }, 'Open all'),
      el('button', { type: 'button', onclick: () => out.querySelectorAll('.tree details').forEach((d, i) => { d.open = false; }) }, 'Close all')),
    el('div', { class: 'tree' }, tree.children.length ? tree : el('p', { class: 'status' }, 'Nothing matches.'))));
}

// ------------------------------------------------------------- boot

function fromUrl() {
  const p = new URLSearchParams(location.search);
  const q = p.get('q') || '';
  $('#q').value = q;
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
