const WEBHOOK_URL = 'https://n8n.niprobin.com/webhook/news';

const state = {
  articles: [],
  range: localGet('range') || '3months',
  view: localGet('view') || 'grid',
};

const $status = document.getElementById('status');
const $content = document.getElementById('content');

// --- Data -----------------------------------------------------------------

// Pull the article array out of whatever shape n8n returns
// (plain array, { data|articles|items|news: [...] }, or [{ json: {...} }]).
function extractItems(payload) {
  if (Array.isArray(payload)) {
    if (payload.length === 1 && !looksLikeArticle(payload[0])) return extractItems(payload[0]);
    return payload.map((i) => (i && i.json ? i.json : i));
  }
  if (payload && typeof payload === 'object') {
    for (const key of ['articles', 'items', 'news', 'data', 'results']) {
      if (Array.isArray(payload[key])) return extractItems(payload[key]);
    }
    if (looksLikeArticle(payload)) return [payload];
  }
  return [];
}

function looksLikeArticle(o) {
  return o && typeof o === 'object' && pick(o, ['title', 'headline', 'name']) != null;
}

function pick(o, keys) {
  for (const k of keys) if (o[k] != null && o[k] !== '') return o[k];
  return null;
}

function normalize(raw) {
  const dateRaw = pick(raw, ['date', 'pubDate', 'publishedAt', 'published_at', 'published', 'isoDate', 'created_at', 'createdAt']);
  const date = dateRaw ? new Date(dateRaw) : null;
  let image = pick(raw, ['image', 'imageUrl', 'image_url', 'urlToImage', 'thumbnail', 'cover']);
  if (image && typeof image === 'object') image = image.url || image.src || null;
  if (!image && raw.enclosure) image = raw.enclosure.url || null;
  let source = pick(raw, ['source', 'feed', 'publisher', 'site', 'creator', 'author']);
  if (source && typeof source === 'object') source = source.name || source.title || null;

  return {
    title: String(pick(raw, ['title', 'headline', 'name']) ?? 'Untitled'),
    url: pick(raw, ['url', 'link', 'href', 'guid']),
    description: stripHtml(pick(raw, ['description', 'summary', 'contentSnippet', 'snippet', 'excerpt', 'content']) || ''),
    image,
    source,
    date: date && !isNaN(date) ? date : null,
  };
}

function stripHtml(s) {
  const el = document.createElement('div');
  el.innerHTML = String(s);
  return el.textContent.trim();
}

async function load() {
  setStatus('Loading articles…');
  $content.innerHTML = '';
  try {
    const res = await fetch(WEBHOOK_URL, { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`Request failed (${res.status})`);
    const payload = await res.json();
    const items = extractItems(payload);
    if (!items.length) {
      const msg = payload && payload.message ? ` Webhook said: “${payload.message}”.` : '';
      throw new Error(`No articles found in the response.${msg}`);
    }
    state.articles = items.map(normalize).sort((a, b) => (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0));
    render();
  } catch (err) {
    setStatus(err.message, true);
  }
}

// --- Filtering & grouping ---------------------------------------------------

function rangeStart(range, now = new Date()) {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (range === 'week') {
    const offset = (d.getDay() + 6) % 7; // Monday = start of week
    d.setDate(d.getDate() - offset);
  } else if (range === 'month') {
    d.setDate(1);
  } else if (range === '3months') {
    d.setMonth(d.getMonth() - 3);
  }
  return d;
}

function groupByMonth(articles) {
  const groups = new Map();
  for (const a of articles) {
    const key = a.date ? `${a.date.getFullYear()}-${String(a.date.getMonth() + 1).padStart(2, '0')}` : 'undated';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(a);
  }
  return groups;
}

const monthFmt = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' });
const dayFmt = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' });

// --- Rendering --------------------------------------------------------------

function render() {
  syncButtons();
  const start = rangeStart(state.range);
  const visible = state.articles.filter((a) => a.date && a.date >= start);

  $content.innerHTML = '';
  if (!visible.length) {
    setStatus(`No articles in this period (${state.articles.length} total loaded).`);
    return;
  }
  setStatus(`${visible.length} article${visible.length === 1 ? '' : 's'}`);

  for (const [key, items] of groupByMonth(visible)) {
    const section = document.createElement('section');
    section.className = 'month';
    const label = key === 'undated' ? 'Undated' : monthFmt.format(items[0].date);
    section.innerHTML = `<h2>${escapeHtml(label)} <span class="count">${items.length}</span></h2>`;
    const wrap = document.createElement('div');
    wrap.className = state.view;
    items.forEach((a) => wrap.appendChild(card(a)));
    section.appendChild(wrap);
    $content.appendChild(section);
  }
}

function card(a) {
  const el = document.createElement(a.url ? 'a' : 'article');
  el.className = 'card';
  if (a.url) {
    el.href = a.url;
    el.target = '_blank';
    el.rel = 'noopener noreferrer';
  }
  const meta = [a.source, a.date && dayFmt.format(a.date)].filter(Boolean).map(escapeHtml).join(' · ');
  el.innerHTML = `
    ${a.image ? `<img src="${escapeHtml(a.image)}" alt="" loading="lazy" referrerpolicy="no-referrer" />` : ''}
    <div class="body">
      ${meta ? `<div class="meta">${meta}</div>` : ''}
      <h3>${escapeHtml(a.title)}</h3>
      ${a.description ? `<p>${escapeHtml(a.description)}</p>` : ''}
    </div>`;
  const img = el.querySelector('img');
  if (img) img.addEventListener('error', () => img.remove());
  return el;
}

function syncButtons() {
  document.querySelectorAll('#range button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.range === state.range));
  document.querySelectorAll('#view button').forEach((b) => b.setAttribute('aria-pressed', b.dataset.view === state.view));
}

function setStatus(msg, isError = false) {
  $status.textContent = msg;
  $status.classList.toggle('error', isError);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function localGet(k) {
  try { return localStorage.getItem(k); } catch { return null; }
}
function localSet(k, v) {
  try { localStorage.setItem(k, v); } catch {}
}

// --- Events -----------------------------------------------------------------

document.getElementById('range').addEventListener('click', (e) => {
  const r = e.target.closest('button')?.dataset.range;
  if (!r) return;
  state.range = r;
  localSet('range', r);
  render();
});
document.getElementById('view').addEventListener('click', (e) => {
  const v = e.target.closest('button')?.dataset.view;
  if (!v) return;
  state.view = v;
  localSet('view', v);
  render();
});
document.getElementById('refresh').addEventListener('click', load);

syncButtons();
load();
