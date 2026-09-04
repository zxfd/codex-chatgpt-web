# Upstream v5.0.2 + latest fork GPT-6 integration

The integrated source is based on upstream `184b1d69b764982f9a34dce127d5f4d826afa9d8`
(v5.0.2), and fork main `c2de3fa39bf30ce86e4d42caba57fce838df51a6` (PR #1).
PR #1 landed while upstream integration was being prepared. Its stable route and model-family
selection are retained; the earlier proposed duplicate GPT-6 selector was removed.

## Behavior

- `chatgpt-web/pro` remains **ChatGPT Web — GPT-6 Pro**, routed to the internal Astra identity.
  This is not an official API model parameter. No silent fallback to generic Sol Pro is allowed.
- Named Astra/Sol family selection precedes effort selection. Menu and slider locators are
  reacquired after the family switch. Named model radio rows cannot be used as effort positions.
  Selected family is verified again after reasoning selection.
- The existing Mac connector fixes remain: exact visible titles, CRLF handling, duplicate
  rejection, bounded hydration waits, keyboard activation in the hidden maintenance viewport,
  and slider-only Pro capability detection.
- Native Luna/Terra aliases and Web Luna/Think are hidden from the local picker. Their old routes
  and protocol metadata remain for compatibility. Repeated catalog refresh stays idempotent.
- Upstream v5 manual Zero Risk, runtime recovery, cancellation and other changes are preserved.
  Manual providers never expose automatic Astra; Astra multipart staging never switches to Sol.
- GPT-6 uses the existing conservative Pro browser budgets, not the advertised API context size.

## Local verification boundary

CI covers typechecking, dependency audits, unit tests, renderer/runtime builds and runtime smoke.
It does not log in to the user's Mac browser or prove the service-side model identity. The named
browser row must be enabled for this account; accounts with only generic Pro fail rather than guess.
The route is offered using the existing Pro capability probe, which is not proof of GPT-6 rollout.

For a source installation, fully quit the launcher, update this fork and run `bun run app`.
Use **Install Models / Repair Codex Setup**, fully quit/reopen Codex, keep the launcher running,
and choose **ChatGPT Web — GPT-6 Pro** in a fresh task. Confirm the browser's named Astra/GPT-6
selection and complete one harmless read-only local tool call. A model's self-reported name is
not verification. Pulling source does not update an installed packaged Mac app; rebuild this fork
or run from source rather than replacing it with an upstream binary that lacks the fork patches.
