# Why We Stopped Writing Projects From Scratch — And Started Generating Them

*How a code generator for Nx/NestJS/React went from a fragile regex-stripper to an engine that not only scaffolds new projects but upgrades existing ones — and what that proved to us over 7 weeks and 245 PRs.*

## The hypothesis

Every new project at a company starts the same way: auth, storage, a database, transport between services, CI, i18n, a design system. Different projects pick different providers — Supabase here, Firebase there, plain Postgres somewhere else — but the *shape* of the infrastructure is almost always identical.

The default path is to copy the previous project and manually strip out what's not needed. Truly bold strategy — reuse the code, keep none of the guarantees. We went down that path, got burned, and ended up building something else instead: a **declarative generator with a blueprint engine** that assembles a project from typed modules, instead of carving away the unused parts of a maximal template.

This is the story of why "copy and strip" is a trap, and what replaces it.

## Part 1. How subtractive generation breaks

The first version of the generator (`create-icore`, v0.7.2) worked the intuitive way: the template shipped **every** provider at once (Supabase, Firebase, MongoDB, Postgres — for auth, storage, and db alike), and generation **regex-stripped** whatever the user hadn't chosen.

Sounds reasonable. It is, in fact, not reasonable. In practice it produced a whole class of bugs that surfaced not at generation time, but *weeks later*, once the project already had a life of its own — because bugs, like bad news, prefer to travel slowly:

- **Orphaned integration tests.** A test for a removed provider wasn't deleted along with it — it kept importing a `@icore/*` library that no longer existed, and the build went red.
- **Orphaned env vars.** The storage strip step removed the `firebase:` line from `REQUIRED_ENV` but left `supabase:` / `cloudinary:` / `mongodb:` dangling next to it.
- **Orphaned SDK dependencies.** The strip script only touched `@icore/*` workspace packages in the root `package.json` — raw SDKs (`firebase-admin`, `@supabase/supabase-js`) stayed as unused dependencies nobody cleaned up.
- **UI drift.** The strip didn't fully cover sidebar navigation — internally nicknamed the "StickyNote bug."
- And crucially: all of this was wrapped in a `catch {}` that silently swallowed strip-step errors, so the generator *looked* successful — green checkmark, proud little exit code 0 — while the build only went red for the end user, downstream, far away, someone else's problem.

The root cause, as stated plainly in the design doc: *"subtractive regex surgery is brittle to template refactors"* — any refactor of the template silently breaks the strip logic, because strip is tied to literal text, not structure. And the CI smoke matrix was hand-picked rather than exhaustive, so a chunk of these bugs simply weren't visible until production.

**The conclusion that cost us several exhausting iterations:** stripping the unused parts out of a maximal template is a structurally fragile approach. Every new feature added to the template is one more place the strip script can forget to remove something. We'd love to say we saw this coming. We did not.

To make this concrete: here's the shape of the audit gate that eventually replaced "hope the strip script got it right." It reads the project's own `blueprint.json` — a small provenance file the generator writes recording exactly which providers were chosen — and derives which SDKs are *forbidden*, not which ones happen to still be lying around:

```ts
// tools/create-icore/src/manifest/audit.ts
const PROVIDER_SDKS: Record<string, string[]> = {
  supabase: ['@supabase/supabase-js'],
  cloudinary: ['cloudinary'],
  mongodb: ['mongoose'],
  firebase: ['firebase-admin', '@icore/firebase-admin'],
};

/** Forbidden raw SDKs derived from the blueprint: a provider's SDK is forbidden
 *  iff that provider appears in none of auth/db/upload. */
function forbiddenFromBlueprint(bp: Blueprint): string[] {
  const chosen = new Set(
    [bp.authProvider, bp.dbProvider, bp.upload].filter((p): p is string => Boolean(p)),
  );
  const forbidden: string[] = [];
  for (const [provider, sdks] of Object.entries(PROVIDER_SDKS)) {
    if (!chosen.has(provider)) forbidden.push(...sdks);
  }
  return forbidden;
}
```

Notice what this does *not* do: it doesn't try to remember what strip step ran, or trust that a `catch {}` block would have complained. It recomputes the forbidden set from scratch, from the one source of truth (`blueprint.json`), and fails the build if a forbidden SDK shows up anywhere. The old approach trusted a script's memory of what it deleted; this one just doesn't trust anyone's memory, including its own.

## Part 2. The additive blueprint engine

The fix sounds simple but flips the whole model: **never add what wasn't chosen**, instead of **add everything, then remove what's unwanted**.

Technically — a manifest (~900 lines in `tools/create-icore/src/manifest/`) declares 4 kinds of composable units: provider / feature / ui / transport. Each unit declares:
- which lib directories it pulls in,
- which dependencies it adds to `package.json`,
- which `tsconfig` paths it adds,
- which env block it needs,
- how it wires into the NestJS `DynamicModule`.

If a unit isn't selected, the engine simply never touches the files tied to it. The entire "forgot to strip X" bug class becomes structurally impossible: X never existed in the output to begin with.

The shape of the pipeline, end to end — note there is no step anywhere labeled "remove":

```
   CLI prompts                    MANIFEST (static data)
  (user picks:                   auth / storage / db /
   auth=firebase,           ┌──▶  transport / ui / feature
   storage=cloudinary,      │     units, keyed by choice
   transport=nats)          │
        │                   │
        ▼                   │
  CreateIcoreOptions ────────┘
        │
        ▼
  wire-auth.ts / wire-storage.ts / wire-db.ts / wire-client.ts / wire-features.ts
        │            (one lookup per axis: MANIFEST[axis][chosen])
        ▼
  writeProvider()  ──▶  writes ONLY:
        │                 • the chosen lib dir's files
        │                 • its deps into package.json
        │                 • its tsconfig path
        │                 • its .env block
        │                 • its NestJS DynamicModule wiring
        ▼
  writeBlueprintJson()  ──▶  blueprint.json  (provenance: what was
        │                     this generated with, and at what
        │                     generatorVersion?)
        ▼
  audit.ts  ──▶  re-derives the forbidden set FROM blueprint.json
        │         and fails the build if any forbidden SDK,
        │         import, or dep is found anywhere in the tree
        ▼
  scaffold-smoke (every PR) / scaffold-smoke-matrix (nightly)
        ──▶  real install + typecheck + build (+ boot, nightly)
             of the ACTUAL generated output, not the generator's
             own unit tests
```

Every arrow above is additive or verificatory. Nothing in this pipeline ever runs "generate everything, then delete." The unused Supabase/MongoDB/Postgres auth libraries for a `firebase`-selected project don't get deleted after being written — they were never written.

Here's what one auth unit actually looks like in the manifest — this is real source, not a simplified stand-in:

```ts
// tools/create-icore/src/manifest/index.ts
export const MANIFEST = {
  auth: {
    supabase: {
      libDirs: ['libs/auth-strategies/supabase'],
      deps: { '@supabase/supabase-js': '^2.106.2' },
      tsPaths: { '@icore/auth-supabase': ['libs/auth-strategies/supabase/src/index.ts'] },
      nestModule: {
        importFrom: '@icore/auth-supabase',
        symbol: 'SupabaseAuthModule',
        into: 'auth',
      },
      appTests: [
        'apps/microservices/auth/src/app/__tests__/auth.controller.supabase.integration.unit.test.ts',
      ],
    },
    // firebase, mongodb, postgres follow the same shape
  },
  // storage, db follow the same shape
};
```

Every fact the old strip script had to remember to clean up — the lib dir, the SDK dependency, the tsconfig path, the test file, the NestJS module wiring — is right here, in one place, per provider. Picking `firebase` for auth means the engine reads exactly one entry out of this object and writes exactly what it says. It cannot "forget" to also write the Supabase lib dir, because nothing ever iterates "write everything, then reconsider."

The actual file-writing step for a chosen axis is almost embarrassingly small once the manifest carries the complexity instead of the code:

```ts
// tools/create-icore/src/manifest/wire-auth.ts
const AUTH: AxisWiring = {
  section: MANIFEST.auth as Record<string, Unit>,
  providerFile: 'apps/microservices/auth/src/app/auth.provider.ts',
  exportConst: 'AuthProviderModule',
  msPackageJson: 'apps/microservices/auth/package.json',
  envPath: 'apps/microservices/auth/.env',
};

export const writeAuthProvider = (targetDir: string, provider: AuthBackend): Promise<void> =>
  writeProvider(targetDir, AUTH, provider);
```

`writeProvider` is generic — it's the same function for auth, storage, and db, parameterized by which axis it's wiring. That genericity is only possible because the manifest, not the wiring code, is where the provider-specific knowledge lives.

One important detail — the migration to the new engine was **not one big-bang PR**. It was 9 sequential phases, each its own PR, one provider layer at a time (auth → storage → db → features → UI), with the last strip-pattern hole (`auth=none`) closed in a separate PR almost a month after the migration started. Infrastructure changes at this scale are safer rolled out in layers than in one jump — that's something we took away as a practice, not just as a fact about this particular refactor.

On top of that sits an **audit gate**: a script that on every PR, and nightly, checks generated combinations for (a) no imports of nonexistent libs, (b) no "raw" SDK dependency where none was chosen, (c) an actual build. This isn't a test of the generator "on paper" — it's a test against the *real generated output*.

## Part 3. Generation alone isn't enough. You need a way back

Here's the part that's easy to miss in a "generation beats copy-paste" conversation: the generator solves the problem for *new* projects. It does not solve the problem for projects that **already exist** — generated yesterday, a month ago, six months ago — by the time the engine has moved on.

We saw this firsthand: a project generated by this same create-icore went on to live independently and got hand-patched — someone manually upgraded Nx to 23.0.1 and fixed the removal of the `webpack-cli --node-env` flag across three services, by hand. Heroic. The problem: the generator itself was still on Nx 22.7.6 and would *keep* reproducing the same bug for every future user — and not in 3 services but in **5** (the person patching by hand missed two, because manually re-deriving what the generator should have known is, it turns out, a great way to miss things). The same project also hand-wrote a Postgres branch for `.env` generation that create-icore didn't have yet — meaning the bug was closed locally, but not in the generator, so anyone generating a Postgres variant tomorrow would hit it fresh.

That's the key lesson: **if a fix only lives in the clone, not in the generator, you're just reinventing "copy and patch by hand," one abstraction level up.** The value of generation is only fully realized once the loop "find a bug → fix it in the generator → roll the fix forward into every existing project" is closed.

That's what led to `create-icore migrate` — a CLI that **upgrades already-generated projects**, not just creates new ones. Architecturally it's modeled on `nx migrate`'s shape: sequential steps, git checkpoints at each step, manual confirmation before continuing. With one important difference — no migration state file at all: progress is derived directly from `git log` via commit markers (`migrate: <id>`). A deliberate choice: *a state file can drift out of sync with reality; the git log itself can't.*

Here's the whole "state machine," in full, because it's short enough to just read:

```ts
// tools/create-icore/src/migrate/state.ts

/**
 * An entry counts as applied iff `projectDir`'s git history contains a
 * commit whose subject is EXACTLY `migrate: <id>`. Deliberately not
 * implemented via `git log --grep` — verified experimentally that no
 * combination of `--fixed-strings`/`^...$` gives exact-match semantics
 * (fixed-strings treats anchors as literal characters, so the pattern
 * then never matches; without fixed-strings, id substrings of a longer
 * real id false-positive). Exactness is enforced here instead.
 */
export async function isApplied(id: string, projectDir: string): Promise<boolean> {
  const { stdout } = await execFileAsync('git', ['log', '--format=%s'], { cwd: projectDir });
  const marker = `migrate: ${id}`;
  return stdout.split('\n').some((line) => line === marker);
}
```

No JSON file tracking "migration 7 of 12 applied." No lockfile that can end up committed on one branch and stale on another. The comment is the best part — someone actually tried `git log --grep` first, hit `--fixed-strings` vs anchor semantics being mutually exclusive, and rather than reaching for a workaround flag, just filtered the plain commit list in JS. Boring, exact, and it can't desync from the repository it's describing, because it *is* a read of that repository.

Filtering *which* migrations apply is equally unglamorous — plain `semver` range math against the project's own recorded axis choices, no clever framework required:

```ts
// tools/create-icore/src/migrate/plan.ts
export function computePlan(
  registry: RegistryFile,
  currentVersion: string,
  targetVersion: string,
  projectAxes: Record<string, string>,
): RegistryEntry[] {
  return registry.entries
    .filter(
      (entry) =>
        semver.gt(entry.version, currentVersion) && semver.lte(entry.version, targetVersion),
    )
    .filter((entry) =>
      entry.affectedAxes.every((axis) => {
        const [axisName, unitId] = axis.split(':');
        return projectAxes[axisName] === unitId;
      }),
    )
    .sort((a, b) => semver.compare(a.version, b.version));
}
```

A project that picked Postgres never even sees a migration step scoped to `db:mongodb` — `affectedAxes` filters it out before the user is asked to look at anything. This is the same "never touch what wasn't chosen" principle from the blueprint engine, applied a second time, one layer up: to upgrades instead of to initial generation.

Laid out as a loop, `migrate` is a repeated three-step cycle with the project's own git history as the only ledger:

```
  existing project's blueprint.json
    { generatorVersion: "0.9.2", authProvider: "postgres", ... }
                    │
                    ▼
  bundled migration registry (per-entry: version, affectedAxes, kind)
                    │
                    ▼
  computePlan(registry, "0.9.2", "--to", projectAxes)
    → drops entries ≤ 0.9.2         (already current)
    → drops entries for axes the project didn't pick
    → sorts what's left ascending
                    │
                    ▼
        ┌───────────┴───────────┐
        ▼                       ▼
   kind: "codemod"        kind: "ai-prompt"
   apply automatically    print diff + context, PAUSE,
   git commit             wait for human/agent edit,
   "migrate: <id>"        THEN commit "migrate: <id>"
        │                       │
        └───────────┬───────────┘
                    ▼
      next run's isApplied(id) greps THIS commit subject
      in `git log` — no state file, no separate ledger,
      no way for "what's done" to drift from what git says
      actually happened
                    │
                    ▼
        repeat until plan is empty, i.e. current == target
```

Compare that to the "from scratch, then hand-patch" story from crawler-nx: someone upgraded Nx by hand, fixed 3 of 5 affected services, and that fix now lives nowhere a future `migrate` run could ever find it. The loop above only works because every fix eventually becomes a registry entry — the discipline `migrate-cli` exists to enforce is exactly "don't let a fix live only in someone's terminal history."

Steps come in two kinds:
- **codemod** — a mechanical edit, applied and committed automatically;
- **ai-prompt** — an edit that needs judgment: the engine prints the diff and context, pauses, waits for the user (with their own coding agent, or by hand) to make the change, and resumes via the same commit-marker convention.

The first version of the migration engine (PR #249) deliberately shipped **with zero real migration steps** — pure mechanism, no content. A CLI whose entire job is to migrate you to nowhere, on schedule. That matches the project's general discipline: ship a working, tested scaffold first, fill in content after — not "both at once and hope it works."

At final review before merge (PR #250), two blocking issues turned up — a small reminder that even a disciplined process doesn't guarantee zero mistakes, only *catches* them before production instead of after:
1. a missing changeset (without it, the release pipeline silently skips the version bump — the CLI equivalent of forgetting to hit "publish");
2. `--to=latest` crashed (`semver.lte(x, 'latest')` threw a `TypeError`) — invisible in development precisely because the test registry shipped zero real steps, so nobody had exercised `--to=latest` against real content. Testing a migration tool against an empty registry is a bit like road-testing a car with no engine: technically it doesn't crash.

Test count for `create-icore` at merge time: **238 tests across 27 files**, all green (re-verified live while preparing this piece — the number hasn't moved).

## Part 4. What this delivers, in numbers

Some scale context so the comparison is fair:

- **Project age:** ~7 weeks (first commit May 28, latest one used in this analysis July 16).
- **Team:** 2 people + a CI bot. Not a department, not a company, not a "platform team" with a roadmap deck.
- **Commits:** 832. **Merged PRs:** 245.
- **Provider axes:** 4 auth strategies (Supabase / Firebase / MongoDB / Postgres) × 4 storage strategies × 4 db strategies × 6 transports (tcp/redis/nats/mqtt/rmq/kafka) × 3 UI frameworks (shadcn/antd/mui) — over 1,000 combinations before even counting on/off feature toggles (notes/payment/jobs).
- **Composition logic:** ~900 lines of manifest in `tools/create-icore/src/manifest/` drive a template snapshot of **605 files / 6.2 MB**.
- **CI today:** every PR runs 8 real combinations through typecheck+build ("Layer A"); the nightly/manual run is 15 jobs (3 package managers × 5 combos), each a real dependency install, build, and service **boot**, covering the boot path for all 4 broker transports and a real Vite build for all 3 UI frameworks.

```
  LAYER A — every single PR (pipeline.yml, job: scaffold-smoke)
  ┌────────────────┬──────────────────────────────────────────────────┐
  │ supabase-full   │ auth=supabase  db=supabase  upload=supabase      │
  │ firebase-minimal│ auth=firebase  db=firebase  upload=firebase      │
  │ cloudinary-nats │ auth=supabase  db=firebase  upload=cloudinary    │
  │ no-upload       │ auth=firebase  db=supabase  upload=none          │
  │ mongodb-full    │ auth=mongodb   db=mongodb   upload=mongodb       │
  │ mongodb-mixed   │ auth=mongodb   db=firebase  upload=cloudinary    │
  │ postgres-direct │ auth=supabase  db=postgres  upload=supabase      │
  │ postgres-auth   │ auth=postgres  db=postgres  upload=supabase      │
  └────────────────┴──────────────────────────────────────────────────┘
        generate → typecheck → build           (fast: gates every PR)

  LAYER B — nightly + manual dispatch (scaffold-smoke-matrix.yml)
  ┌───────────────┬─────────────────────────────────────────────┐
  │  npm  × 5 combos │ mqtt / rmq / nats / kafka transport boot,  │
  │  yarn × 5 combos │ shadcn / antd / mui real Vite build,       │
  │  pnpm × 5 combos │ real dependency install, real service boot │
  └───────────────┴─────────────────────────────────────────────┘
        = 15 jobs, generate → install → build → BOOT   (slow: exhaustive)
```

Layer A is deliberately narrow and fast — it's the thing that gates merging, so it stays under the patience budget of "waiting on a PR." Layer B is deliberately slow and wide — it's the thing that would catch a package-manager-specific lockfile problem or a broker that fails to boot under `pnpm` but not `npm`, at 3am, before anyone's PR depends on finding out the hard way. Neither layer replaces the other; a bug that only reproduces under `yarn` + `kafka` would sail through Layer A every time.
- **Contract tests:** `runAuthContract` and `runStorageContract` — a single behavioral spec that 5 concrete implementations each pass (4 providers + an in-memory fake). Building that same level of behavioral guarantee by hand for every from-scratch project is separate, unfunded work that, realistically, 9 out of 10 real projects never do — it's always "next sprint," which is management-speak for "never."

Each concrete strategy just calls into the same shared suite and declares its quirks as data, not as duplicated test code:

```ts
// libs/shared/src/strategies/__tests__/auth.contract.unit.test.ts
export function runAuthContract(
  name: string,
  factory: () => AuthStrategy,
  helpers?: AuthContractHelpers,
): void {
  describe(`AuthStrategy contract: ${name}`, () => {
    let strategy: AuthStrategy;
    beforeEach(() => {
      strategy = factory();
    });
    // ...login, magic-link, OAuth, revoke — same assertions for every provider
  });
}
```

```ts
// libs/auth-strategies/firebase/src/lib/__tests__/firebase-auth.contract.unit.test.ts
runAuthContract('FirebaseAuthStrategy', () => new FirebaseAuthStrategy(config), {
  // revoke() is fully implemented — Firebase has no per-session revoke
  // primitive, so it's uid-wide: revoking one session ends every session
  // for that user.
  revokeIsUserWide: true,
  getMagicLinkToken: (strategy, email) => {
    /* pull the oobCode out of the mocked Identity Toolkit */
  },
});
```

The `helpers` object is the whole point: Firebase genuinely can't revoke a single session the way Supabase can — its SDK only exposes a uid-wide `revokeRefreshTokens`, so revoking one session ends *every* session for that user. Instead of skipping the test or writing a Firebase-only test file that quietly drifts from the Supabase one, the contract makes the *difference itself* a typed, declared fact (`revokeIsUserWide: true`) and still runs the same "does revoke actually revoke" assertions against both — just with the opposite expectation for the side-effect scope. A from-scratch integration would need someone to remember this asymmetry exists, every time, forever. Here it's one boolean.

Worth being honest about the limits here: contract tests verify *behavioral compatibility* between providers, not the security of any given deployment. A real vulnerability — the auth microservice's TCP port accepted `auth.setRole` calls with no sender check, letting any process on the network grant itself admin, bypassing the gateway entirely — was found manually, by diffing against another generated project, not caught by the contract-test suite. Nothing says "defense in depth" quite like any process on the LAN being able to `curl` itself into admin. But the fact that closing this vulnerability meant shipping *one opt-in HMAC guard at a single wiring point*, rather than a patch that has to be repeated in every independently-grown project, is exactly the payoff this whole approach was built for.

## Part 5. What to take away if you're not building a monorepo generator

Not every team has 7 weeks and a reason to build a blueprint engine. But the pattern scales down:

1. **The subtractive approach ("maximal template minus stripping") breaks predictably** — at any scale, not just in an Nx monorepo. If you copy a "fat" boilerplate and then hand-strip what you don't need, you've already taken on debt that won't show up right away.
2. **Generation without an upgrade path is generation only for day one of a project's life.** Without a way to roll a fix from the generator forward into existing projects, you slowly turn into N different codebases that all started as the same code — congratulations, you've reinvented forking, just slower and with more shame.
3. **"Mechanism first, content later" discipline** — migrate-cli shipped with zero migration steps — is how you avoid drowning in combinatorics at the start. The mechanism gets tested independently of content; content gets added incrementally on top of a proven scaffold.
4. **Infrastructure refactors roll out in layers**, not one PR — the 9-phase migration to the blueprint engine wasn't bureaucracy, it was a way to keep every step reviewable and independently revertable.
5. **An audit gate against real generated output is not optional.** A test of the generator itself only tells you "the generator didn't crash." A test against the *result* of generation is the only way to catch bugs like "orphaned import" — the kind no one writes a unit test for by hand.

## Bottom line

We didn't start out convinced generation was the right path. We started with copy-paste, got burned, built a regex stripper, got burned by that too — turns out "burned twice" is our design process — and only after two failures arrived at an additive blueprint engine with an audit gate and a migration path back into projects already living in the wild.

The savings aren't that the generator writes code faster than a human. The savings are that **a bug found once gets fixed once** — in the manifest, not in every clone separately. Over 7 weeks and 245 PRs, that turned from a hypothesis into a measurable fact.
