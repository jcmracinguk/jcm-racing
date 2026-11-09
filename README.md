# jcm-racing
JCM Information

## Pick publication requirement

Every new pick must retain its timestamped pre-race reasoning and counterargument and include a verified clickable racecard. The shared card must provide results and video access; if the exact result page is not verified or the race is pending, use an explicitly labelled date-results link, never invent an exact race URL. Run `python3 scripts/validate_data.py` and browser regressions before publishing. Keep full research outcome counts separate from narrower historical financial snapshots when a price is missing. Do not replace an original pre-race assessment with hindsight.

## Current visible run from 6 November 2026

Each fictional strategy starts at £0 and has an unlimited simulated overdraft. Carry all gains and losses forward, including negative totals. There are no deposits, top-ups, withdrawals or balance caps. Earlier outcome records remain intact, outside this priced trial.

Results contain exactly three data columns per strategy: starting tally (£0), current tally and variance against the retained £10,000 comparison benchmark. Percentage = cumulative net profit/loss / £10,000 × 100; it is not a return on zero capital. Keep Results free of explanatory paragraphs and wrap text for mobile. Keep the last fully settled daily tally visible until all selected races have finished and every outcome and price is available; then publish the daily snapshot and graph point. Never infer missing outcomes.

The current run starts at £0 on Friday 6 November 2026. Only dated files from that day onward appear in the active manifests, date selector, result totals and carried balances. Earlier dated files and the prior manifests in `data/archive/pre-2026-11-06-run-indexes.json` remain immutable history. Preserve device choices within the active run. Published racing simulations use £500 liability per race, frozen approved prices and 5% commission. Run `node tests/bankroll.cjs` and `node tests/current-run.cjs`.

## Racing and football views

The switch beside the logo connects `index.html` (navy racing) and `football.html` (dark-green BTTS). Both share `scripts/jcm-shell.css` and `scripts/sport-switch.css`. Football loads only `football-results-days.json` and its dated football records; it must never read racing balances or write racing storage. Saturday 7 November's five BTTS YES selections were frozen unpriced: display scores and accuracy, with no assumed stake or profit. New football prices cannot be added retrospectively. No football schedule or paid service is enabled.
