# BTTS v1 freeze before final evaluation

5 November 2026, Europe/London. No screening thresholds or league scope changed
after reviewing development/validation run 42071140151.

- Frozen implementation commit: e3698abfd81366b277d36b6d5efc6146d56cc96d.
- Configuration SHA256: d2bb9ade1ef18aeb3f357a351b7325df9f317658d7de26592df804baaeaf82f6.
- Model file SHA256: 8ee361c87d75e841dfe21e7baa68b7f16f82ae200c077c55ef96f64838908924.
- Audit file SHA256: 6c915ed5bc9f7fb585fba44caedfb3b4f1c4cc5c40b9292c2e56ff840f25f497.

Final evaluation: Premier League AND Championship 2025/26, regular-season league
matches only. The new runner imports the exact pinned implementation and verifies
these hashes before provider access. It does not rewrite the model/configuration.
Both input audits must pass before measuring either league. No performance-based
league dropping, no prices/profit claims, no forward selections or new schedules.

Development/validation evidence already observed:

| League | 2023/24 development | 2024/25 validation |
|---|---:|---:|
| Premier League | 34/53 BTTS YES | 34/52 BTTS YES |
| Championship | 40/69 BTTS YES | 6/15 BTTS YES |

The final manual workflow checks for a prior successful final run and refuses
repeat attempts. It needs only read access to Actions metadata. It makes one
GitHub metadata GET and two paced football-data.org GET requests. No raw provider
records, artifacts or fixture identities are saved. First successful report is
the final historical evaluation; do not rerun or tune against it. Failed data or
network checks are not a completed evaluation. Record and investigate failures.

After this evaluation, changing thresholds or retaining only one league is a new
results-informed choice requiring fresh forward evidence. Historical corrected
results cannot reproduce every original observation/correction timestamp. Both
league results and their sample sizes must remain visible, including failures.
