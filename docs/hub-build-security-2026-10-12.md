# Hub typecheck and dependency maintenance

Baseline: `bd31560f2d58e6bb9159624ae3c772a885d6b9a3`.

## Proven failures

`npm ci --ignore-scripts` completed, but `npm run lint` reported 178 TypeScript
diagnostics. The root Vite compiler configuration implicitly included unrelated
Deno Edge Functions, rollback bundles and separately installed Playwright suites.
The Vite build nevertheless succeeded; these outcomes are not interchangeable.

The root lockfile dependency audit reported 16 vulnerable dependency nodes:
2 critical, 8 high, 3 moderate, 3 low. This is dependency evidence, not proof that
every vulnerability is exploitable in a deployed static Reception AI frontend.

## Repairs and verification

The root compiler now explicitly checks `src` and `vite.config.ts`. Deno functions
and browser acceptance tests keep their separate workflows. Their checks must not
be replaced by this Vite typecheck. A compiler-boundary regression checks that
the actual application sources remain included.

`npm audit fix --package-lock-only --ignore-scripts` updates dependencies within
the existing version ranges. No major upgrade, force option or application rewrite
was used. The package manifest is unchanged. The lockfile is committed.

After a fresh locked installation: Vite typecheck passes; production build passes;
111 Node tests pass (Reception baseline, widget, compiler boundary and existing
LuxWash sales/Stripe tests). The remaining dependency advisories are recorded in
the final audit rather than hidden by a clean-build claim.

## Limits

The separate appointment-safety fix is PR #39; this branch starts independently
from main and does not contain that fix. Merge both only after review and run
the combined suite. No deployment or migration was executed.

The root creative app still injects a configured Gemini key into the browser via
Vite `define`; do not put a privileged shared production key there. A protected
server-side AI gateway and per-user authorization/quota tests remain required
before offering that root app as commercial SaaS.
