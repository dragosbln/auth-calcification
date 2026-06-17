# Vendor Profile Schema

A **vendor profile** is one markdown file in `../vendors/` that carries every provider-specific fact the audit needs. The orchestration (`../../SKILL.md`) and the detection playbook (`detection-playbook.md`) are deliberately vendor-agnostic: they read these fields and **never name a specific provider**. 

That separation is the whole point. **Adding support for a new identity provider means writing one new profile file in `vendors/` that follows this schema — and changing nothing else.** If you ever find yourself wanting to edit `SKILL.md` or the playbook to handle a specific vendor, stop: that knowledge belongs in a profile.

## Rules

- Use the exact section headings below, in this order. The playbook locates information by heading.
- If a field genuinely doesn't apply to a vendor, write `None` followed by a one-line reason. An explicit "not applicable, because…" is information; a missing section looks like an oversight.
- Identifiers (package names, type names, function names, claim keys) must be exact and copy-pasteable — they get turned directly into search patterns. Wrap them in backticks.
- Record what you verified the profile against (see Verification). Vendor SDKs drift; a profile is only as trustworthy as its last check.

## Required sections

### `# <Vendor name>`
Title line — the human name (e.g. `# Amazon Cognito (AWS Amplify v6)`).

### Identification
How the audit detects that this vendor is in use in a target codebase.
- **Packages** — npm package names that signal this vendor, including framework integrations. Used to match this profile against the target's `package.json` and imports.
- **Import specifiers** — the module paths application code imports from.

### Vendor types (leak candidates)
The vendor's own types whose appearance in *application-layer* signatures, return types, or caught errors indicates a leaky boundary. (Methodology: *the boundary is the enabler → anti-corruption layer*.)

### Token storage seam
- **Default storage** — where tokens live if nothing is configured.
- **Custom storage API** — the exact API that swaps storage out. Its presence is the swappability signal. (Methodology: *Axis 1 — Token storage*.)
- **Look-alikes that are NOT custom storage** — built-in persistence *selectors* that must not be mistaken for a real custom storage adapter. (This is the generalized Firebase trap.)

### Refresh and owned-behavior entry points
- **Refresh** — the vendor function(s) that perform token refresh. Bare use with no surrounding ownership is the inherited-magic signal. (Methodology: *Axis 2*.)
- **Other owned behaviors** — entry points for sign-out propagation, multi-tab session sync, silent re-auth, if the vendor exposes them.

### Claim and role surface
- **Claim access shapes** — how vendor claims and roles get read, including provider-namespaced claim patterns. Inline reads at call sites are the coupling signal. (Methodology: *Axis 4 — claim/role coupling*.)
- **Role / permission location** — where roles/permissions actually live for this vendor.

### Provider-specific feature surface
Vendor-only capabilities (groups, organizations/tenancy, admin/management APIs, custom attributes) whose scattered use across app code raises switching cost. (Methodology: *Axis 3 — Identity provider*.)

### Token type
- **ID vs access token** — which call yields which token, and how the access token is obtained for API authorization. (Methodology: *Axis 4 — token-type sub-concern*.)

### Sign-in / sign-out surface
The vendor's auth entry points (login, logout, sign-up). Context for the auditor; not itself a finding.

### Vendor notes and traps
Version caveats, easy-to-misread APIs, and anything the auditor must be careful about for this vendor specifically. This is where hard-won "don't confuse X with Y" knowledge lives.

### Verification
- **Last verified against** — SDK package(s), version(s), and date checked. When in doubt during a build, re-verify against current official docs and update this line.
