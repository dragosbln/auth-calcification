# Detection Playbook

How the mechanical pass turns a vendor profile into findings. **Everything here is vendor-agnostic.** Each rule says which profile field to use; the profile supplies the concrete identifiers. Never hardcode a vendor name in this file.

## The one rule that makes this not-shallow

A raw text match is a *candidate*, not a finding. Grepping for a vendor type or `localStorage` and emitting a checklist is exactly the failure mode this whole skill exists to avoid. So every rule below is two steps:

1. **Locate** — use the profile's identifiers to find candidate locations (ripgrep/file reads).
2. **Confirm** — open each candidate and read the surrounding code to decide whether it actually means what the signal claims. A vendor type *inside the boundary/adapter module* is correct and expected; the same type in an app-layer signature is a leak. The confirm step is where you tell those apart.

Record every confirmed finding with **file:line** and a one-line reason. Record what you **could not analyze** (unparseable files, dynamic imports, generated code) as coverage gaps — a clean section must mean "looked and found nothing," never "didn't look."

## Step 0 — Detect vendors and establish the boundary module

1. Read the target's `package.json` (and lockfile if needed). For each profile in `vendors/`, check whether its **Identification → Packages** appear. Load every matching profile. Multiple vendors can be present; run the pass per vendor.
2. If a dependency looks like an auth provider but matches **no** profile, record a coverage gap ("vendor X detected, no profile available") and continue with what you can.
3. Identify the candidate **boundary module(s)** — files that look like the intended auth seam (e.g. `lib/auth`, `auth/`, an `AuthPort`/`AuthAdapter`, a `createApiClient`). You need this because most "is it a leak" decisions hinge on *inside the boundary vs outside it*. If there is no identifiable boundary module, that is itself the headline boundary finding.

### Multi-vendor and partial-boundary codebases

When multiple auth vendors are detected (e.g., a codebase mid-migration from Auth0 to Cognito, or using different providers for different surfaces), assess each vendor's surface independently. **Do not collapse to a single overall verdict** ("the system is bounded" OR "the system is calcified"). Instead:

- Report boundary status **per vendor** where it differs. Example: "Cognito side: boundary PRESENT. Auth0 side: boundary ABSENT."
- In the axes findings, split per vendor where the evidence differs (e.g., "Cognito storage: custom adapter; Auth0 storage: inherited default").
- The Coverage section must list all vendors detected and which were assessed (vs. coverage gaps).

A codebase mid-migration is neither "fully bounded" nor "fully calcified" — it's in transition, and that reality must be reported honestly. A single collapsed verdict would mislead.

## Boundary signals (methodology: "The boundary is the enabler")

These assess the structure that determines cost on every axis. Assess the boundary first; its quality feeds cost on Axes 1–4.

### B1 — Anti-corruption layer (do vendor types leak?)
- **Profile field:** Vendor types (leak candidates).
- **Locate:** search app code for each listed type.
- **Confirm:** a match counts as a leak only if it appears in **application-layer** code (component, page, route handler, service, hook) as a parameter type, return type, exported type, or a caught/thrown error — i.e. the vendor's shape crossing into callers. Matches *inside* the boundary/adapter module are correct; don't flag them.
- **Finding:** "vendor type `X` crosses the boundary in N app-layer locations" + the locations. The reverse (no vendor types outside the adapter) is a positive signal toward migration-readiness.

### B2 — Injected vs imported
- **Profile field:** Import specifiers; (presence of an `AuthPort`-style interface).
- **Locate:** find app-layer modules importing auth functions directly from the vendor's import specifiers, vs an injected port (e.g. `createApiClient(auth)`).
- **Confirm:** read how auth is obtained at the call site. Direct `import { x } from "<vendor>"` then used inline = hard-wired. An interface/port received as a parameter = injected. Note whether any `AuthPort`-style contract exists at all.
- **Finding:** "auth accessed via direct vendor import in N call sites; no injected port" or "auth injected via `<Port>` — bounded."

### B3 — Contract-tested
- **Profile field:** Vendor types + import specifiers (to classify tests).
- **Locate:** find test files touching auth.
- **Confirm:** classify each — does it assert against a **boundary contract** (a `Principal`/`AuthPort` shape, a `runAuthContractTests`-style suite), or does it **mock the vendor** and assert on the vendor's shape? The latter passes today and dies on migration.
- **Finding:** "no contract suite for the auth boundary; N tests mock the vendor directly" or "contract suite present — strong migration-readiness signal."

### B4 — Absorbs the client/server split
- **Profile field:** import specifiers (client vs server entry points, e.g. SSR adapter packages).
- **Locate:** find app code that branches on execution context (client vs server) to obtain auth.
- **Confirm:** is there `if (typeof window…)`-style branching or duplicated client/server auth logic in app code, vs a single port with context-specific adapters behind it?
- **Finding:** "app code branches on execution context to get auth in N places" or "single port, context-specific adapters — bounded."

### Boundaries with internal gaps

A boundary may be structurally PRESENT (domain types exist, vendor types confined to an adapter, an `AuthPort` interface exists) but **incomplete** on one or more of the four signals above. Common gaps in an otherwise-present boundary:

- **No contract suite** (B3) — the boundary exists but isn't tested independently of the vendor
- **No policy layer** (Axis 4) — the boundary maps vendor claims to a domain `Principal`, but authorization decisions in app code still read `Principal` fields directly instead of going through a policy function
- **No single-flight refresh wrapper** (Axis 2) — owned 401/refresh path exists, but N concurrent 401s would trigger N refresh calls
- **Look-alike storage** (Axis 1) — appears to use a custom adapter but actually passes a built-in selector to the storage seam

When you find a present boundary with gaps, **report the gaps as items to complete**, not as evidence the boundary doesn't exist. Frame these as migration-readiness findings: "you're ~80% toward a fully bounded system; what's left is [add contract suite / add policy layer / etc.]."

The distinction matters for prioritization: fixing gaps in a present boundary is usually cheaper and lower-risk than introducing a boundary from scratch.

## The four change axes

For each axis, the pass produces findings + evidence; **likelihood and cost are not scored here** — they're asked in the interview (see `SKILL.md`).

### Axis 1 — Token storage
- **Profile fields:** Token storage seam (default / custom API / look-alikes).
- **Locate:** search for the **Custom storage API** call and for the look-alike selectors.
- **Confirm:** is storage actually configured to a **custom** adapter, or left at the **default**, or only set to a **built-in selector** (which is NOT custom — see the profile's look-alike note; flagging a selector as a custom adapter is a serious accuracy error)?
- **Finding:** "token storage is the vendor default (`<default>`); no custom storage adapter" / "custom storage adapter present at file:line — swappable" / "uses built-in selector `<x>`, which is not a custom adapter."

### Axis 2 — Refresh and owned runtime behaviors
- **Profile fields:** Refresh; Other owned behaviors.
- **Locate:** search for the refresh call(s) and the owned-behavior entry points.
- **Confirm:** is refresh **inherited** (bare refresh call used across app code with no 401-interceptor, no single-flight dedup, no explicit failure path), or **owned** (a 401-retry path with single-flight and an `onSessionExpired`-style failure route)? Apply the same inherited-vs-owned read to sign-out propagation, multi-tab sync, silent re-auth — but respect the profile's notes on which behaviors that vendor doesn't automate (don't invent a gap the vendor never filled).
- **Finding:** "refresh inherited from vendor magic; no owned handling" / "owned refresh with single-flight + failure path at file:line."

### Axis 3 — Identity provider
- **Profile field:** Provider-specific feature surface.
- **Locate:** search for each listed vendor-specific feature.
- **Confirm:** is the usage **scattered across app code** or **localized to the adapter**? Backend/admin SDK usage in a frontend app is worth a note; the same in a backend service may be expected — read the context.
- **Finding:** "provider-specific features (`groups`, `custom attributes`, …) used in N app-layer locations — coupling spread beyond the adapter" / "vendor-specific usage localized to the adapter."

### Axis 4 — Authorization (and token type)
- **Profile fields:** Claim and role surface; Token type.
- **Locate (claims/roles):** search for the claim access shapes, including namespaced-claim patterns; search for hard-coded role/group strings.
- **Confirm (claims/roles):** are authorization decisions made by reading vendor claim shapes **inline at call sites**, or against a domain `Principal`/policy layer? Inline reads spread across components/handlers are the calcification.
- **Locate + confirm (token type):** find what populates the outbound `Authorization` header — is it the **ID token** or the **access token**? Note a missing `audience`/access-token path where the profile says that signals ID-token misuse.
- **Finding:** "authorization reads vendor claims inline in N locations; no domain `Principal`/policy layer" + "API calls authorized with the ID token" (each with evidence).

## Output of the pass

A structured list of findings (boundary + four axes), each with evidence and a one-line reason, plus a coverage record (what was analyzed, what was skipped and why). Hand this to the interview phase. **Do not** assign priorities or likelihood/cost here.
