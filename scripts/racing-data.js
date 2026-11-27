(() => {
 'use strict';
 const international = new URLSearchParams(location.search).get('region') === 'international';
 const londonTime = new Intl.DateTimeFormat('en-GB', {hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London'});
 const londonDate = new Intl.DateTimeFormat('en-GB', {year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Europe/London'});
 let request, fetchedAt = 0;

 window.jcmInternational = international;
 if (international) {
  document.body.dataset.sport = 'international';
  document.title = 'JCM | International';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', '#0d3032');
  document.getElementById('date').replaceChildren();
 }

 async function readJson(path) {
  const response = await fetch(path, {cache: 'no-store'});
  if (!response.ok) throw new Error('Racing data is unavailable');
  return response.json();
 }

 function normalise(row, date) {
  const off = new Date(row.scheduled_off_dt);
  const parts = Object.fromEntries(londonDate.formatToParts(off).map(({type, value}) => [type, value]));
  if ([parts.year, parts.month, parts.day].join('-') !== date) throw new Error('International race date mismatch');
  return {
   ...row, race_date: date, off_time_uk: londonTime.format(off),
   lay_odds: row.lay_odds ?? null,
   result_status: row.result_status ?? 'PENDING',
   identified_challengers: row.identified_challengers ?? [],
  };
 }

 async function internationalDays() {
  if (request && Date.now() - fetchedAt < 5000) return request;
  fetchedAt = Date.now();
  request = readJson('data/international-racing.json').then(feed => {
   if (feed.schema_version !== 1 || !Array.isArray(feed.days)) throw new Error('Invalid international feed');
   return feed.days.map(day => ({
    date: day.date,
    picks: day.picks.map(row => normalise(row, day.date)),
    watchlist: day.watchlist.map(row => normalise(row, day.date)),
    research: (day.research ?? []).map(row => ({...normalise(row, day.date), researchOnly: true})),
   })).sort((a, b) => b.date.localeCompare(a.date));
  }).catch(error => {
   request = undefined;
   throw error;
  });
  return request;
 }

 window.jcmInternationalDays = internationalDays;
 window.jcmReadRacingData = async path => {
  if (!international) return readJson(path);
  const days = await internationalDays();
  if (path === 'data/watch-list.json') {
   return {schema_version: 1, liability_gbp: 500, commission_rate: .05,
    entries: days.flatMap(day => day.watchlist), days: days.map(day => day.date)};
  }
  if (path === 'data/rated-performance-sources.json') {
   return {schema_version: 1, sources: days.map(day => 'data/competition-research-' + day.date + '.json')};
  }
  if (path === 'data/bet-builder-days.json') return {days: days.filter(day => day.picks.length).map(day => day.date)};
  const match = /^data\/(competition-research|result-card-details|bet-builder)-(\d{4}-\d{2}-\d{2})\.json$/.exec(path);
  const day = days.find(item => item.date === match?.[2]);
  if (!day) throw new Error('International racing day is unavailable');
  if (match[1] === 'competition-research') return {
   schema_version: 1, date: day.date, mode: 'research_only_not_official_picks',
   high_competition: day.picks, competition_watchlist: [],
  };
  if (match[1] === 'result-card-details') return {
   schema_version: 1, date: day.date, details: day.picks.map(row => ({
    ...row, date: day.date, results_url: row.result_source_url,
   })),
  };
  const prices = day.picks.filter(row => Number.isFinite(row.lay_odds));
  const approvals = prices.map(row => row.price_approved_at || row.user_approved_at).filter(Boolean).sort();
  if (!prices.length || approvals.length !== prices.length) throw new Error('No approved international simulation');
  return {
   schema_version: 2, fictional_only: true, date: day.date,
   introduced_at: approvals[0], opening_balance_gbp: 0, commission_rate: .05,
   preserve_device_choices: true, rows: prices,
   published_simulations: {
    recorded_at: approvals.at(-1),
    race: {entries: prices.map(row => ({
     race_id: row.race_id, horse_id: row.horse_id, odds: row.lay_odds, liability_cents: 50000,
    }))},
   },
  };
 };
})();
