# Fork integration: upstream v5.0.2 and explicit GPT-6 selection

## Source boundary

Upstream: `miuuyy/codex-chatgpt-web`, pinned `184b1d69b764982f9a34dce127d5f4d826afa9d8` (v5.0.2).
Fork starting point: `7d2344de5dffef16f77e5d2c841be4eafe19531a`.
This is a history-preserving merge, not a reset or replacement of the fork.

Preserved fork behavior: exact visible connector-title matching, CRLF handling, duplicate rejection,
bounded connector hydration waits, keyboard activation for the hidden macOS maintenance viewport,
stable slider-based Pro capability detection, and the curated High/Extra High/Pro catalog.
Upstream manual Zero Risk, runtime, environment recovery, and interrupt changes remain intact.

## Model selection

- `chatgpt-web/pro` retains the legacy generic Pro slider route. A Pro slot is not proof of GPT-6.
- `chatgpt-web/gpt-6` is a separate **GPT-6 Astra** route, with a separate internal adapter identity.
  It matches complete visible model titles (`GPT-6`, `GPT-6 Astra`, `GPT-6 Pro`, `GPT-6 Astra Pro`),
  rejects disabled/ambiguous rows, clicks an enabled model row, and reopens the menu to verify its
  semantic checked state before returning. It never silently substitutes Sol or generic Pro.
- Native Luna/Terra rows and Web Luna/Think rows are hidden from the local picker. Explicit legacy
  routing and their protocol metadata are retained; unrelated native Sol/GPT-6 rows are unchanged.
- The GPT-6 route is conservatively offered only after the existing Pro capability probe succeeds.
  This does not imply account rollout access: the named browser row is verified on every selection.
- The fixed `ultra`/`max` values are bridge protocol values, not a claim that GPT-6 has a five-position
  effort slider. Browser model-family selection is independent of the legacy slider.
- GPT-6 reuses the existing conservative Pro browser budgets, not advertised model/API context limits.
  Experimental multipart stages stay on GPT-6 rather than switching to a cheaper Sol model.

## Validation boundary and local rollout

Unit tests cover routing/provider registration, selection state transitions, delayed hydration,
reordered rows, no-op clicks, disabled/ambiguous/missing models, catalog idempotence, and existing
Mac compatibility contracts. These tests do **not** verify a live authenticated account or a signed
macOS application installation. Account-dependent browser validation is still required.

For a source installation, fully quit the launcher, update this fork, and run `bun run app`.
Use **Install Models / Repair Codex Setup**, fully restart Codex (not only its window), and keep the
launcher running. Select **ChatGPT Web — GPT-6 Astra** in a fresh task. Confirm the launcher browser
actually shows the named GPT-6/Astra model and that a harmless local read-only tool call returns.
The trace checkpoint `gpt6-model-selected` records verified UI selection, not server-side model
attestation. A self-reported model name in generated text is not verification.

For a packaged installation, pulling source does not update the installed application. Build/install
this fork's package or run this fork from source; the upstream installer would omit fork-only changes.
If the account exposes only a generic Pro slot, the explicit GPT-6 route fails rather than guessing.
The upstream Zero Risk mode permits manual selection, but likewise cannot attest the server's model.
