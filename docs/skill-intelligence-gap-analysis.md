# Skill Intelligence — Gap Analysis

> **Status: all 8 prioritized items implemented (2026-08-17).** See §9 for what
> changed per item. The findings below are kept as originally written so the
> reasoning stays auditable — each fixed item is marked ✅ inline.
>
> **One action still required:** migration `0031_cv_github_api_verified.sql`
> must be applied to the live database (dashboard SQL editor or CLI). Until it
> is, the GitHub-verification CV sync writes to a column that doesn't exist yet.

"Skill Intelligence" is the `/skill` page's own title (`frontend/src/app/(dashboard)/skill/page.tsx:209`): a four-tab feature — My Skills, Skill Catalog, Assessments, Forecast — backed by the master `skills` catalog, `user_skills`, `skill_assessments`, and GitHub verification tables and services. This document covers the three tabs and backend layers not already covered by the forecasting docs: `docs/skill-forecasting-review-report.md`, `docs/skill-forecasting-improvement-plan.md`, and `docs/skill-forecasting-model-comparison.md` already cover the Forecast tab and Module A in depth and aren't re-litigated here.

Checked 2026-08-17, full-file reads of the frontend page, its services and types, and every backend service/controller/route/validation file in the skill and GitHub verification paths. Every claim below cites a file and line; where something is genuinely ambiguous (not confirmed by reading the code), it's marked as such rather than asserted.

## 1. GitHub verification — trust and correctness

This is the most consequential cluster of findings: the verification flow is real and functional (it makes genuine GitHub API calls and writes real data), but it has structural trust and correctness problems.

### 1.1 A client can self-assert verification (security gap)

`PATCH /skills/user/:skillId`'s validation schema (`backend/src/validations/skill.validation.ts:9-14`) allows `github_verified: z.boolean().optional()` and `confidence_score: z.number().min(0).max(1).optional()` on the same endpoint and permission (`skills:write`) as user-editable fields like `proficiency_level`. There's no field-level separation between "trusted, verification-derived" and "user-editable" data. A raw HTTP call — not the official frontend, which never sends these fields (`frontend/src/services/skill.service.ts:14-15`) — can `PATCH` `{ "github_verified": true, "confidence_score": 1 }` onto any of the caller's own `user_skills` rows and it will be accepted without any cross-check against actual GitHub data.

**Fix.** Split `updateUserSkillSchema` into a user-editable schema (`proficiency_level`, `proficiency_label`) and a separate internal-only update path used exclusively by `githubService.verifySkills()`, never exposed to the public router. The simplest version: strip `github_verified`/`confidence_score` out of the client-facing schema entirely, and have the GitHub verification service call a dedicated internal function (or the Supabase client directly) rather than sharing the public `updateUserSkill` code path.

### 1.2 Disconnecting GitHub leaves stale verification badges

`handleDisconnectGitHub` (`frontend/src/app/(dashboard)/skill/page.tsx:88-96`) only clears `githubStatus`; it never touches `userSkills`. `githubService.disconnect()` (`backend/src/services/github.service.ts:86-88`) only deletes the `user_github_tokens` row. No code path anywhere resets `github_verified`/`confidence_score` back down. The result: a skill verified once shows "✓ GitHub" (`skill/page.tsx:293-295`) forever, even after the user disconnects — the badge stops meaning what it claims to mean the moment it's shown after a disconnect.

This is one symptom of a broader property: **verification is one-way and additive only.** Nothing in `verifySkills()` (`github.service.ts:139-227`) ever lowers a confidence score or resets `github_verified` to `false` — not on disconnect, not if the user deletes the repos that justified the original match, not on re-verification finding a lower score than before (each run only ever pushes updates for matches with `confidence > 0`; a skill that no longer matches simply isn't touched, keeping its old, now-stale, value).

**Fix.** On disconnect, reset `github_verified = false, confidence_score = null` for every `user_skills` row belonging to that user. On every re-verification run, treat it as authoritative for that run — explicitly reset non-matching skills' verification state, not just add to matching ones.

### 1.3 Two uncoordinated writers to the same column

`cvs.github_verified_skills` has two independent writers:
- `githubService.verifySkills()` writes real GitHub-derived language-confidence data to it for every CV belonging to the user (`github.service.ts:218-224`).
- `cv.service.ts`'s `analyzeCV` writes `result.github_verified` from Module C's CV analysis — which can itself be a **static hardcoded mock** (`MOCK_CV_ANALYSIS.github_verified`, `backend/src/services/cv.service.ts:23-27`, three fixed skills with canned confidence scores) when the Python service is unreachable, silently substituted with only a server-side console warning (`backend/src/services/python.service.ts:34-38`) — into the same column (`cv.service.ts:319`).

Whichever ran most recently wins, with no reconciliation and no indication to the end user which source (real GitHub data, real Module C output, or static mock) actually produced what they're looking at.

**Fix.** Separate the columns (e.g. `github_verified_skills` for the GitHub-derived source, `cv_analysis_verified_skills` for Module C's), or add a `source` field to whatever's stored so a reader can tell which pipeline produced it. At minimum, `analyzeCV` should not overwrite `cvs.github_verified_skills` with mock data without tagging it as such.

### 1.4 Structural verification ceiling

`LANG_TO_SKILL` (`github.service.ts:8-25`) is a hardcoded 16-entry map from GitHub-detected repo languages to skill names. Verification confidence is purely **language byte-share across the user's public repos** (`langBytes`/`totalBytes`, `github.service.ts:157-190`) — nothing about commit recency, activity, or code quality. Any skill that isn't one of those 16 languages — every framework (React, Django), every tool (Docker, Jest), every competency (System Design, Cybersecurity), and **all 12 Soft Skills added in this session's migration 0030** — can never be verified through this mechanism. This isn't a bug in the Soft Skills work; it's a pre-existing structural limit of a language-only verification approach that the new catalog entries simply fall outside of, same as most of the existing technical catalog already does.

**Fix (scope-dependent).** If broader verification matters, it needs signal beyond `GET /repos/{repo}/languages` — e.g. dependency-manifest parsing (`package.json`, `requirements.txt`) for frameworks/libraries, or accept that competencies and soft skills are structurally outside what a code-hosting API can verify and should use a different trust signal (assessments, endorsements) instead of a "verified" badge implying the same kind of evidence.

### 1.5 Other verification-flow risks (lower severity, still real)

- **Only public repos are scanned** (`per_page:100, sort:updated, visibility:public`, `github.service.ts` repo-fetch call) despite the OAuth scope requesting `repo` (`github.service.ts:28-42`, scope `"read:user repo"`), which would also grant private-repo access. Private work is silently excluded from a user's own verification.
- **N+1 GitHub API calls**: the first 30 repos each get an individual language-breakdown request (`github.service.ts:157`, comment acknowledges the 30-repo cap is rate-limit mitigation) — and this fetch-and-aggregate logic is duplicated almost verbatim in `listRepoData()` (`github.service.ts:90-137`), used separately by `cv.service.ts` for CV project verification. Two independent call sites re-fetch the same data rather than sharing one cached result.
- **N+1 writes**: every matched skill gets its own `.update(...).eq("id", us.id)` call (`github.service.ts:200-205`), fired in parallel via `Promise.all` rather than one batched upsert.
- **In-memory OAuth state map** (`oauthStateMap`, `backend/src/controllers/github.controller.ts:10`) maps `state → userId` in process memory with a 10-minute `setTimeout` expiry. This does not survive a process restart and isn't shared across instances — in any deployment with more than one backend instance, or that redeploys/restarts during the ~10-minute OAuth window, the callback can land on a different instance than the one that issued `state` and always fail with `?github=error`. Needs a shared store (Redis, or the DB) if this ever runs beyond a single long-lived process.
- **`user_github_tokens.access_token` is stored as plaintext `text`** (`backend/supabase/migrations/0018_github_oauth.sql:7`) with no encryption-at-rest layer visible in the application code.
- **RLS enabled, zero policies** on `user_github_tokens` (`0018_github_oauth.sql:29` — only `enable row level security`, no `create policy`). Currently harmless since the backend exclusively uses the RLS-bypassing service-role client (`backend/src/config/supabase.ts:12-13`), but means the table would be inaccessible to any future direct client-side Supabase access, likely unintentionally.

## 2. API contract confusion

- **`:skillId` means two different things on sibling routes of the same router.** In `PATCH`/`DELETE /skills/user/:skillId` (`backend/src/routes/skill.routes.ts:28-33`), it's the `user_skills.id` row id (`skill.service.ts:78-79, 91-92`). In `POST /skills/user/:skillId/assess` (`skill.routes.ts:38-40`), the same path segment is actually the **master `skills.id`** (`skill.service.ts:109-117`, inserted as `skill_assessments.skill_id`, FK'd to `skills(id)`). The current frontend gets this right (it passes `userSkill.id` to one and `userSkill.skill_id` to the other), but the route naming itself invites the exact bug it happens to avoid today. **Fix:** rename one of the two — e.g. `PATCH/DELETE /skills/user/:userSkillId` vs. `POST /skills/:skillId/assess` — so the parameter name documents which id it expects.
- **`deleteUserSkill` silently "succeeds" on a no-op.** `.delete().eq("id", userSkillId).eq("user_id", userId)` with no `.select()`/count check (`skill.service.ts:87-95`) — Supabase returns `{ error: null, data: null }` whether it deleted one row or zero (wrong owner, already deleted, nonexistent id), and the code unconditionally reports success. **Fix:** add `.select()` and check the returned row count; return 404 when nothing matched.
- **Assessment/profile-membership isn't backend-enforced.** `logAssessment` (`skill.service.ts:109-117`) only requires a valid master `skills.id` via FK — nothing checks the user actually has that skill in `user_skills` first. The frontend enforces this by only listing tracked skills in the dropdown (`skill/page.tsx:508-512`), but a direct API call can log an assessment for any catalog skill regardless of whether it's tracked. **Fix:** join against `user_skills` (or require a `user_skills.id` instead of a bare `skills.id`) before inserting.
- **Inconsistent error-status mapping for structurally identical failures.** `addUserSkill` maps every non-unique-violation DB error to `400` (`skill.service.ts:69`); `getUserSkills`/`listMasterSkills`/`getAssessments` map their equally-generic DB errors to `500` (`skill.service.ts:47, 57, 105`). No stated rule for when a Postgrest error is a client error vs. a server error. **Fix:** pick one convention (Postgrest/DB errors are generally `500` unless mapped to a specific known code like the unique-violation case already handled) and apply it uniformly.
- **`proficiency_level` and `proficiency_label` have no cross-field consistency check**, at either the Zod layer (`skill.validation.ts:3-7`) or the DB layer (`backend/supabase/migrations/0010_skills.sql:15-16` — independent constraints, no relationship between them). A client can submit `proficiency_level: 5, proficiency_label: "Beginner"`. Separately, the only frontend caller only ever produces levels 1–3 (`PROF_LABELS.indexOf(...) + 1`, `skill/page.tsx:116, 130`, a 3-entry array), so levels 4–5 are schema-legal but unreachable and unlabeled through the actual product.

## 3. Master catalog & taxonomy — schema without consumers

The master skill catalog has **read-only** API coverage: `GET /skills` → `listMasterSkills()` (`skill.service.ts:41-49`) is the only operation. There is no create/update/delete endpoint anywhere in the backend — the catalog is populated exclusively by SQL migrations (`0010_skills.sql`, `0025_expand_skills_catalog.sql`, `0029_skills_type_taxonomy.sql`, `0030_soft_skills_catalog.sql`). Any future catalog change is a migration-and-deploy, not an admin action.

**Confirmed, not assumed:** this session's `type` column (Technology/Tool/Competency, migration 0029) and the Soft Skills catalog (migration 0030) are **schema-only** right now:
- `listMasterSkills()`'s select list is `"id, name, category, description"` (`skill.service.ts:44`) — `type` isn't selected, so `GET /skills` never returns it regardless of what's in the database.
- A full grep of both `frontend/src` and `backend/src` for `type` in a skills context, and for the literal strings `'technology'`/`'tool'`/`'competency'`/`"Soft Skills"`, found zero hits outside the migration SQL files themselves. No controller, service, validation schema, or frontend component reads or filters by it.
- The frontend `Skill` type (`frontend/src/types/index.ts`) has no `type` field either, so even if the backend started returning it, nothing on the frontend expects it yet.
- Soft Skills rows will still appear in the Skill Catalog tab automatically (categories are derived generically from whatever's in `masterSkills`, `skill/page.tsx:205`), and users can add/assess them through the existing generic flows — they just get no special treatment: they silently never match GitHub verification's 16-language map (not because of any soft-skill-specific exclusion, just because nothing in that map matches them), and produce no forecast data (already explicitly documented as an intentional, acknowledged gap in the migration's own comment, not an oversight).

**What surfacing this would take:** add `type` to `listMasterSkills`'s select and the frontend `Skill` interface, then build an actual consumer — the most natural one being a Technology/Tool/Competency filter or grouping toggle on the Skill Catalog tab (§6), and/or visually distinguishing Soft Skills there.

## 4. My Skills tab

- **Stale GitHub badge** — see §1.2.
- **No confirmation before destructive actions.** Both "Disconnect" (`skill/page.tsx:255`) and the skill-removal "×" button (`skill/page.tsx:278`) fire immediately on click, no confirmation step.
- **Custom Add Skill modal doesn't reuse the shared `PiqModal` primitive** (`frontend/src/components/piq/primitives.tsx:183-261`), which already provides Escape-to-close, click-outside-to-close, and consistent animation/sizing. The hand-rolled modal (`skill/page.tsx:302-335`) has none of that.
- **Empty `<optgroup>`s in the Add Skill dropdown.** Category options (`skill/page.tsx:310-316`) are built from *all* `masterSkills`, not from `available` (skills not yet added) — once every skill in a category has been added, that category still renders as an empty group header in the dropdown.
- **`verifySkills` gives no per-skill detail** — only an aggregate count in the toast (`"${updated} skill(s) verified via GitHub"`, `skill/page.tsx:102-103`); the user can't tell which skills changed without comparing badges by eye.
- **Dead fields**: `UserSkill.confidence_score` (`frontend/src/types/index.ts:47`) and `Skill.description` (`types/index.ts:38`) are both fetched but never rendered anywhere on this page (confirmed via full-repo grep) — data the backend already computes/stores with no UI surface.

## 5. Skill Catalog tab

- **No empty state** — unlike My Skills (`skill/page.tsx:267-268`) and Assessments (`skill/page.tsx:551-552`), an empty `masterSkills` list here just renders nothing.
- **No search, filter, or pagination.** Everything renders at once, grouped only by category — fine at the current catalog size (~140 skills across two migrations), but doesn't scale gracefully.
- **Clicking "+" navigates the user away from the tab they're on.** It sets state and calls `setTab("My Skills")` (`skill/page.tsx:596-597`) to reuse My Skills' modal, rather than handling the add inline — a surprising context switch mid-browse.

## 6. Assessments tab

- **Assessable-skill scope is frontend-only**, not backend-enforced — see §2.
- **`getAssessments(skillId?)` supports a per-skill filter** (`skill.service.ts:20-21` on the frontend, `skill.service.ts:97-107` on the backend) **but it's never called with an argument** (`skill/page.tsx:50`) — the whole history is always fetched unfiltered. The filtering capability exists on both ends and is simply unused.
- **No pagination** over the assessment history table — all rows render regardless of length.
- **No edit or delete** for a previously logged assessment; `skillService` exposes no such method at all (confirmed: only `listMaster`, `getUserSkills`, `addUserSkill`, `updateUserSkill`, `deleteUserSkill`, `getAssessments`, `logAssessment`, `runForecast` exist). This may be an intentional "append-only log" design, but nothing in the UI states that's the intent.
- **Unguarded date formatting** — `new Date(a.assessed_at).toLocaleDateString()` (`skill/page.tsx:571`) has no fallback for a malformed/missing timestamp; would render "Invalid Date" rather than something graceful.
- **Only tab using a raw HTML `<table>`** (`skill/page.tsx:554-576`) rather than the card/grid pattern the other tabs use — not wrong, just structurally inconsistent.

## 7. Cross-cutting

- **Page-level load errors are collapsed into one generic failure.** The initial `Promise.all` of four independent requests (user skills, master skills, assessments, GitHub status — `skill/page.tsx:43-64`) shares one `catch`, showing a single "Failed to load skills" toast (`skill/page.tsx:57-58`) with no indication of which call failed and no per-resource retry — one flaky endpoint blanks out unrelated, working data.
- **RLS policies on `user_skills` and `user_github_tokens` are effectively dead code at runtime.** The backend exclusively uses the service-role client (`supabaseAdmin`, `backend/src/config/supabase.ts:12-13`), which bypasses RLS entirely — per-row ownership is enforced only by explicit `.eq("user_id", userId)` filters in the service layer. No instance of a missing filter was found, but there's no defense-in-depth backstop if one is ever introduced.
- **Header stat-card icons are broken for 3 of 4 cards.** `icon="github"`, `"chart"`, and `"list"` (`skill/page.tsx:212-217`) aren't defined keys in the icon `PATHS` map (`frontend/src/components/piq/icon.tsx:3-38`); `Icon`'s fallback (`icon.tsx:64`, `PATHS[n] || PATHS.info`) silently renders the generic info icon for all three instead.
- **`EarlyWarning.interpretation`** (`types/index.ts:85`) is fetched but never rendered in the Forecast tab's early-warnings block (`skill/page.tsx:399-414`) — the same "dead field" pattern seen elsewhere on this page, noted here for completeness though the Forecast tab itself isn't otherwise in scope.

## 8. Prioritized recommendations

Ordered by actual impact, not by section order above.

1. **Fix the GitHub verification self-assertion gap (§1.1)** — this is the one item that's a real security boundary issue, not just a UX rough edge. Split the update schema before anything else here.
2. **Fix stale verification state on disconnect (§1.2)** and make re-verification authoritative (reset non-matches), so "✓ GitHub" only ever means what it currently claims.
3. **Resolve the two-writers-to-one-column ambiguity (§1.3)** — separate the columns or tag the source, so mock CV-analysis data can never silently masquerade as real GitHub verification.
4. **Fix the `:skillId` route ambiguity and `deleteUserSkill`'s silent no-op (§2)** — both are the kind of thing that turns into a real bug the moment a second client integration is built against this API.
5. **Enforce assessment/profile-membership server-side (§2)** — closes the gap between what the frontend assumes and what the API actually allows.
6. **Fix the three broken stat-card icons (§7)** — a one-line-per-icon fix (add the missing keys to `PATHS`) for a bug visible on every page load.
7. **Decide and act on the `type`/Soft Skills taxonomy (§3)** — either surface it (select `type`, add a Catalog filter) or explicitly note in project docs that it's intentionally schema-only for now. Right now it's neither — it's just unused.
8. **UX polish pass (§4–6)** — confirmation dialogs on destructive actions, reusing `PiqModal`, empty states, per-resource error handling (§7), pagination/search on Catalog and Assessments. None of these are urgent individually, but they're the same shape of fix and could reasonably be done together.

## 9. Implementation record (2026-08-17)

All 8 items above were implemented. Verified with a real `tsc --noEmit` on both
`backend/` and `frontend/` (exit 0) plus ESLint on the changed frontend files —
note that this required installing dependencies first, as neither project had
`node_modules` present.

| # | Item | What changed |
|---|---|---|
| 1 | Self-assertion gap | `github_verified`/`confidence_score` removed from `updateUserSkillSchema`. Nothing internal broke: `verifySkills` already wrote those fields straight to the DB, never through this schema. |
| 2 | Stale verification | New `githubService.clearVerification(userId)`; `disconnect()` now calls it, and `verifySkills()` computes the full desired state first, then clears and re-applies **back to back** so a mid-run failure can't leave a user wiped. Frontend mirrors the reset locally. |
| 3 | Two writers | Migration `0031` adds `cvs.github_api_verified_skills`. `githubService` writes only the new column; `cvService` writes only the original. `analyzeCV` now **refuses to persist mock data at all** (detected by `result === MOCK_CV_ANALYSIS`, valid because `callPython` returns the fallback by reference). CV page prefers the GitHub-API column, falls back to Module C's. |
| 4 | Route/delete bugs | `PATCH`/`DELETE` params renamed to `:userSkillId` (URL shape unchanged, so no client change). `deleteUserSkill` and `updateUserSkill` now use `.select()` + row-count checks and return a real 404 instead of reporting success on a no-op. |
| 5 | Assessment scope | `logAssessment` verifies the skill is in the caller's `user_skills` before inserting. |
| 6 | Broken icons | `github`, `chart`, `list` paths added to the icon `PATHS` map. |
| 7 | Taxonomy | `type` added to `listMasterSkills`'s select and the frontend `Skill` type, with a real consumer: a Technology/Tool/Competency filter on the Skill Catalog tab. |
| 8 | UX pass | New `ConfirmDialog` (built on `PiqModal`) gating GitHub disconnect and skill removal; Add-Skill modal moved to `PiqModal` and lifted to page level so Skill Catalog no longer force-switches tabs; empty-`<optgroup>` fix; `Promise.allSettled` per-resource load errors; catalog search + empty state; assessments pagination + invalid-date guard; previously-dead `confidence_score`, `description`, and `interpretation` fields now surfaced. |

Error-status mapping in `skill.service.ts` was also normalized: DB/Postgrest
failures now consistently return 500, with the deliberate exceptions being the
existing `23505` → 409 ("Skill already added") and the new 404s above.

**Not addressed** (out of scope for this pass, still open from §1.4–1.5): the
16-language verification ceiling, public-repos-only scanning, the N+1 GitHub API
call pattern, in-memory OAuth state, and plaintext token storage.
