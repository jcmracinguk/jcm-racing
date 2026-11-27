'use strict';

const dateSelect = document.getElementById('international-date');
const statusLine = document.getElementById('international-status');
const dateFormat = new Intl.DateTimeFormat('en-GB', {dateStyle: 'long', timeZone: 'Europe/London'});
const timeFormat = new Intl.DateTimeFormat('en-GB', {hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London'});
const money = new Intl.NumberFormat('en-GB', {style: 'currency', currency: 'GBP', signDisplay: 'exceptZero'});
const resultLabels = {PENDING: 'Pending', NR: 'Void', WIN: 'Lay successful', LOSS: 'Lay failed'};

function element(tag, content, className) {
 const node = document.createElement(tag);
 node.textContent = content;
 if (className) node.className = className;
 return node;
}

function appendLink(container, label, href) {
 if (typeof href !== 'string' || !href.startsWith('https://')) return;
 const link = element('a', label);
 link.href = href;
 container.append(link);
}

function showGroup(id, entries, emptyMessage) {
 const container = document.getElementById(id);
 container.replaceChildren();
 if (!entries.length) container.append(element('p', emptyMessage, 'international-empty'));

 for (const entry of [...entries].sort((a, b) => a.scheduled_off_dt.localeCompare(b.scheduled_off_dt))) {
  const card = element('article', '', 'international-entry');
  const time = timeFormat.format(new Date(entry.scheduled_off_dt));
  card.append(element('h3', entry.horse));
  card.append(element('p', [time, entry.course, entry.country].join(' · '), 'international-meta'));

  if (id === 'international-research') {
   card.append(element('p', 'Awaiting a verified Exchange Lay price'));
  } else {
   const price = Number.isFinite(entry.lay_odds) ? 'Lay ' + entry.lay_odds.toFixed(2) : 'Unpriced simulation';
   const result = resultLabels[entry.result_status] || 'Pending';
   const profit = Number.isFinite(entry.booked_profit_gbp) ? money.format(entry.booked_profit_gbp) : '';
   card.append(element('p', [price, result, profit].filter(Boolean).join(' · ')));
  }

  if (entry.reason) card.append(element('p', entry.reason));
  const links = element('div', '', 'international-links');
  appendLink(links, 'Racecard', entry.racecard_url);
  appendLink(links, 'Form result', entry.form_url);
  appendLink(links, 'Official result', entry.result_source_url);
  card.append(links);
  container.append(card);
 }
}

async function loadInternational() {
 try {
  const response = await fetch('data/international-racing.json', {cache: 'no-store'});
  if (!response.ok) throw new Error('Feed unavailable');
  const {schema_version, days} = await response.json();
  if (schema_version !== 1 || !Array.isArray(days)) throw new Error('Invalid feed');
  const ordered = [...days].sort((a, b) => b.date.localeCompare(a.date));
  if (!ordered.length) {
   statusLine.textContent = 'No international race days published yet.';
   return;
  }
  for (const day of ordered) dateSelect.add(new Option(dateFormat.format(new Date(day.date + 'T12:00:00Z')), day.date));
  dateSelect.hidden = false;
  document.querySelector('[for="international-date"]').hidden = false;
  const showDay = () => {
   const day = ordered.find(record => record.date === dateSelect.value);
   showGroup('international-picks', day.picks, 'No approved Picks for this date.');
   showGroup('international-watchlist', day.watchlist, 'No approved Watchlist entries for this date.');
   showGroup('international-research', day.research, '');
   document.getElementById('international-research-section').hidden = !day.research.length;
  };
  dateSelect.addEventListener('change', showDay);
  showDay();
  statusLine.hidden = true;
  document.getElementById('international-groups').hidden = false;
 } catch {
  statusLine.textContent = 'International race data is unavailable. Reload to try again.';
 }
}

loadInternational();
