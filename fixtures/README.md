# Fixtures

Synthetic test apps the skill audits. They are also the article's worked examples.

Build these per **`../BUILD-PLAN.md` → Phase E**. Keep each tiny (a handful of files); they only need enough code to make detectors fire or stay silent. **Never copy real or proprietary code.**

- `calcified-cognito/` — the "before"; should trip nearly every detector.
- `bounded-cognito/` — the "after"; should come back near-clean with high migration-readiness.
- `bounded-auth0/` — the same bounded app with an Auth0 adapter swapped in; proves portability.
- `calcified-auth0/` — optional 4th, only if Auth0 detectors look undertested after the test loop.
