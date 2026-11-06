# Sporting Life UTC identity repair - 6 November 2026

Run 42181231990 failed in historical reconciliation after rejecting 13 races dated 21-24 October. The embedded Sporting Life race_summary time is UTC; off_time_uk is Europe/London. All 13 fetched source times matched the stored scheduled_off_dt converted to UTC, and their current result positions/statuses matched the saved outcomes.

The parser now requires a timezone-aware stored schedule, consistency with the stored UK date/clock, exact equality to the source UTC instant, and the existing course, URL/race-reference, selected-horse and weighed-in checks. There is no either-clock acceptance or one-hour tolerance. No selections, frozen prices, outcomes, workflows or credentials are changed.

Validation: four new tests reproduced the original fault and missing schedule checks before the fix. All 11 parser tests pass after the fix; compileall passes; the existing live Silver Hill network probe passes. Read-only checks of all 13 previously rejected races pass and preserve their saved position/status. Non-numeric finish handling remains conservative/manual. Full post-merge scheduled reconciliation remains unverified until run.

Morning research has a separate existing fix in private PR44 at 585bb23de4162017ed1bd766133c218bf96d3d9d; its 226 offline tests were rerun successfully. Reuse it rather than duplicate it. Both repairs require approval before merge under the current project rules. No real bets.
