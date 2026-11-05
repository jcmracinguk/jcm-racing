# JCM Football BTTS: trial protocol v1

Recorded 5 November 2026. Personal research only; zero spending; no real bets.
This protocol defines a proposed trial. No matches have been selected and no
football section or scheduled football collection is enabled.

## Scope and data boundary

English Premier League and Championship REGULAR_SEASON league matches only.
Exclude cups and promotion play-offs. Include only settled REGULAR duration
scores: 90 minutes plus stoppage time, excluding extra time and penalties.
football-data.org is the candidate source. Its free account was tested from
GitHub on 5 November: current 2026/27 and 2023/24–2025/26 returned data in both
leagues. This establishes access for these seasons only, not completeness.

The separate manual quality audit checks the expected double round-robin fixture
matrix (20 teams/380 fixtures; 24 teams/552 fixtures), unique match IDs, exactly
one fixture per ordered home/away pair, league and season identity, recognised
stages, timezone-aware dates, status and usable scores. It reports stage counts
and unresolved games; it does not silently deduplicate or infer results.
Unknown stages or structural issues block use pending investigation. A PASS
means internal consistency; it is not independent verification against official
records. No raw API responses or team/match identities enter public logs or files.
Original racing files, app totals, frozen prices, Bet Builder, collectors and
scheduled tasks must never be changed by football code.

## Fixed screening rule: btts-v1

This is an uncalibrated evidence screen, not a probability model. Thresholds are
chosen before seeing backtest performance and have no claim of being optimal.

At the pre-match cutoff, use only completed regular-season results from that
same league and season. Require 10 completed league matches for each team,
at least 5 home games for the home team and 5 away games for the away team,
and at least 50 completed league matches. No cross-division or prior-season
records are pooled. Insufficient samples produce no candidate.

Compute the league BTTS baseline L, home scoring baseline H and away scoring
baseline A from the allowed earlier matches. For each team calculate:

- Season overall BTTS count/rate and last-six overall BTTS count/rate.
- Relevant venue split: home team's home and away team's away BTTS, scoring,
  conceding, clean-sheet and failure-to-score counts/rates, and goals for/against
  per game. Always display the denominator and actual integer counts.
- Opponent context: median earlier opponents' pre-match points per game and
  their scoring/conceding rates, reconstructed before those earlier games.
  Report how many opponents had at least five prior matches. Missing opponent
  context is labelled unknown, never assigned invented strength.

For a split count x from n games, shrink its rate toward its appropriate league
baseline b using (x + 8*b)/(n + 8). Eight is a fixed prior sample weight.
Use L for BTTS; H for home scoring/away conceding; A for away scoring/home
conceding. Do not average bookmaker implied probabilities into these statistics.

A fixture qualifies only if ALL conditions hold:

1. Mean of the two shrunken venue BTTS rates is at least L + 0.05.
2. Both shrunken team scoring rates are at least 0.70.
3. Both shrunken team conceding rates are at least 0.65.

Rank qualifying fixtures by condition 1's mean, then by fixture ID for ties.
There is no daily minimum, no recovery logic and no accumulators. Recent form,
opponent context and verified team news explain the evidence and limitations;
they do not silently alter the fixed thresholds. Do not use head-to-head as a
selection gate. No xG is included because a permitted free source is unverified.

AI explains the screen and gives a counterargument. It does not invent rates,
simulations, confidence percentages or calibrated probabilities. Verified injury,
suspension or likely-line-up information needs a public source URL and observation
time; absent information is unknown. Official confirmed line-ups are labelled
separately from likely line-ups. Historical tests exclude news that lacks a genuine
pre-match archive. Any discretionary news-based screen must be separately
versioned and cannot be represented as the same historical mechanical test.

## Chronological historical test

Once the quality audit passes, implement and verify the rule before measuring
its historical performance. Keep all historical outputs separate from forward
records. Do not look at performance to optimise these v1 thresholds.

2023/24 is for implementation checks; report its results as development only.
2024/25 is validation. 2025/26 is the locked final holdout, evaluated once after
implementation and validation checks are complete. If rule changes are made
after inspecting a season, that season becomes development data; it cannot remain
an untouched holdout. Freeze code/configuration hashes before opening the holdout.

For each fixture use a cutoff at 00:00 Europe/London on its actual playing date.
Use only earlier-date matches. This conservative rule avoids needing historical
final-whistle timestamps and prevents same-day result leakage. Rebuild league
baselines, opponent strengths and every team statistic at each cutoff. Never use
end-of-season tables, the target score, or future matches as input. Postponements
use the actual eventual playing date if reliably recorded; uncertain dates are
excluded with a reason. Fetching historical results now cannot prove exactly when
each correction was available then: label the test a chronological reconstruction,
not a replay of an archived live feed. No historical betting return is claimed
without actual archived BTTS YES prices observed before the relevant kick-off.

Report screened/eligible/qualified/excluded counts and reasons, successes,
failures, pending/void outcomes, BTTS hit rate with a 95% Wilson interval,
per-league totals and the BTTS rate of all eligible fixtures as a baseline.
Compare with a simple frozen benchmark: predict YES for every eligible fixture.
Do not turn rank scores into probability calibration claims.

## Forward paper trial, after separate approval

Review after 50 settled frozen selections or 12 weeks, whichever occurs first;
report the actual sample and do not force enough picks to reach 50. Screen Friday
through Sunday league fixtures using a Friday 12:00 Europe/London cutoff. Every
candidate must kick off after that cutoff. Include only results completed before
the cutoff; games started less than six hours earlier are excluded unless a
reliable completion timestamp proves availability. Late fixture changes remain
visible. No retrospective selections or late-entry matches.

The mechanical candidate list includes every qualifying fixture. The user approves
which candidates enter the paper trial, and these approved selections are frozen
before kick-off. Report candidates separately from approved selections so human
selection does not masquerade as a test of every screen qualifier.

Freeze fixture ID, league/season/stage, teams, kickoff and cutoff, observed input
timestamps, source provenance, feature counts and denominators, rule version and
code/configuration hashes, reasoning/counterargument, approval and freeze time.
No editing a frozen assessment in place. Append corrections with reason and time.
Do not delete failures. Separate football selections, results, historical tests,
priced/unpriced samples and performance from every racing record.

Default report is prediction accuracy. If actual BTTS YES decimal odds are
verified before kickoff, freeze provider, market label, price, observation time,
stake (always simulated GBP10), bookmaker/exchange basis, commission and void
rules. Match-winner/over-2.5 prices are never substitutes. No opening or funding a
betting account is needed. Missing prices stay unpriced and have no P/L.

Bookmaker win net = 10*(odds-1); loss = -10; confirmed void = 0. Exchange win net
= 10*(odds-1)*(1-commission), for the single isolated YES market only; exchange
market netting assumptions must be recorded. Gross return includes returned stake
and is not profit. Report priced sample size, total stake, returns, net P/L,
yield = net P/L / settled non-void stakes, maximum drawdown and commission.
Show all approved selections, including unpriced ones, alongside priced totals.
High accuracy alone does not establish value or profit.

Settle only verified full-time normal-time outcomes. Postponed, abandoned,
cancelled, awarded or disputed matches retain explicit statuses and stay pending
until their outcome and, where priced, provider settlement rules are established.
No assumed loss or automatic void. Record result source, verification time and
any correction. A rescheduled match is not silently treated as an unchanged
selection; apply the frozen rules and retain its full history.

## Operations and cost

The audit is manual only: standard GitHub-hosted Ubuntu in the existing public
repository, read-only token, no paid installs, no artifacts/caches or data writes,
at most eight paced GET requests, and a five-minute timeout. The API token is
available only to the network step and never printed. Authentication, rate-limit,
network or schema failure stops collection. Summaries contain aggregate diagnostics.

Automation, new storage, publication and any new account setup are later decisions.
Do not enable schedules or publish a football section without explicit approval.
Raw data must remain private; confirm storage/retention and derived-output rights
before retaining it. Verify the account's current billing controls before any
private-repository jobs; do not consume or reconfigure racing collectors.

Code can calculate statistics, produce candidates and check results. ChatGPT
reviews evidence and writes explanations in conversation. GitHub scripts do not
include continuous free AI inference. A successful manual audit does not mean an
automated prediction or result service exists. Neither work laptop nor existing
family racing collector is part of this design.
