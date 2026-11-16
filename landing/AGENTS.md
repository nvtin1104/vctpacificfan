# Project Rules - landing (vctpacificfan)

## 1. Tech Stack & Tooling
- **Framework:** Astro 7 (static site generation), Tailwind CSS v4, TypeScript.
- **Package Manager:** Always use `pnpm` (never `npm` or `yarn`).
- **Deployment Target:** Cloudflare Pages (`pnpm deploy:cf`).

## 2. Relational JSON Database (`src/data/`)
All data collections are validated by `src/content.config.ts` and tested by `scripts/data.test.mjs`:
- **Global entities:**
  - `src/data/teams.json`: Team identity (`id`, `name`, `tag`, `region`, `country`, `colors`, `socials`, `logo`).
  - `src/data/players.json`: Global player identity (`id`, `handle`, `name`, `avatar`, `country` ISO alpha-2, `role`, `socials`).
- **Season-scoped entities (`src/data/seasons/<year>/`):**
  - `rosters.json`: One entry per team per season with `id: "<team>-<year>"`.
    - `roster[].player` must reference a valid `id` in `src/data/players.json`.
    - `roster[].role`: `"Duelist" | "Initiator" | "Controller" | "Sentinel" | "Flex" | null`.
    - `roster[].status` / `staff[].status`: `"official" | "reported"`.
    - `staff[].position`: `"head-coach" | "coach" | "analyst"` (do not use `"assistant-coach"`).
  - `tournaments.json`, `matches.json`, `statistics.json`, `season.json`, `rules.json`: Keep all foreign keys (`team`, `from`, `tournament`, `nextMatch`, etc.) valid and acyclic.
- **CLI Query Helper:** Use `pnpm db:query` (`node scripts/db.mjs`) to inspect teams, rosters, missing data gaps, and tournaments before bulk edits.

## 3. Localization & Typography
- Every localized object must include all four languages: `vi`, `en`, `ko`, `ja`.
- All UI dictionaries in `src/data/i18n/{vi,en,ko,ja}.json` must share identical keys and `{placeholder}` variables.
- **No em-dashes (`—`):** Always use a standard hyphen (`-`) instead of `—` in all UI components, i18n strings, and data files.

## 4. Assets & Liquipedia Sync
- **Team Logos:** Use `node scripts/sync-liquipedia-teams.mjs --team <id>` to download logos into `public/images/teams/<id>.png` and update `src/data/teams.json`.
  - In `src/components/ui/TeamBadge.astro`, render synced team logos cleanly without a bordered card wrapper (`border`/`bg-surface-2`/`p-1` is only for fallback monograms).
- **Player Avatars:** Save as `400x400` JPEG (`fit: "cover"`, `position: "top"`) in `public/images/players/<player-id>.jpg` and reference via `/images/players/<player-id>.jpg` in `src/data/players.json`.
- **Liquipedia Updates:**
  - When updating a team from Liquipedia, sync team socials (`website`, `x`, `youtube`, `liquipedia`), active roster (`official`, `igl`, `sub`), coaches/staff, player real names/countries/avatars/links, and recent tournament `history`.
  - Preserve existing `reported` rostermania entries alongside `official` entries unless explicitly replaced or confirmed.
  - Update `source` and `asOf` (`YYYY-MM-DD`) on modified roster entries.

## 5. Verification
Before finishing any data, schema, or code change, run and ensure all three pass:
```powershell
pnpm test
pnpm build
pnpm test:seo
```
