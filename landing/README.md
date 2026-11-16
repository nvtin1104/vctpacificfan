# VCT Pacific Fan Hub 2027

Trang fan **không chính thức** cho VCT Pacific 2027: lịch thi đấu, nhánh đấu Triple-Elimination, đội hình, thống kê và giải thích thể thức 2027. Site tĩnh đa trang (Astro SSG), 4 ngôn ngữ (`vi`, `en`, `ko`, `ja`), dữ liệu là JSON quan hệ quản lý bằng Git, deploy lên Cloudflare Pages tại `https://vctpacificfan.likecactus.com`.

> Không liên kết với Riot Games. Không dùng logo, art hay font của Riot/VCT/đội tuyển — logo đội là monogram tag + màu.

## Chạy local

```bash
pnpm install
pnpm dev          # http://localhost:4323
pnpm test         # kiểm tra dữ liệu, i18n, layout nhánh đấu
pnpm build        # astro check + build ra dist/
pnpm test:seo     # sau build: canonical, hreflang, JSON-LD, OG, sitemap, link nội bộ
```

Từ thư mục gốc repo: `pnpm dev:vct` / `pnpm build:vct`.

## Cấu trúc

```
src/
  content.config.ts        # schema zod + reference() cho mọi collection
  data/
    teams.json             # danh tính đội (tên, tag, màu, socials) — dùng chung mọi mùa
    seasons/
      2027/                # mỗi mùa giải là một thư mục đặt tên theo năm
        season.json        # year, current, explainer, asOf, map pool, mức hỗ trợ, nguồn
        tournaments.json   # các giải của mùa, 3 tầng; `kind`: kickoff | cup | masters | champions | kickoff-qualifier | regional | wild-card | lcq
        rosters.json       # mỗi đội một mục `<team>-<year>`: status, partnerSince, roster, staff, capsule, source, asOf
        matches.json       # mọi trận: teams (team | placeholder), skirmish, veto, maps (null khi chưa đấu)
        brackets.json      # sections → rounds → matches + progression (winner/loser → trận/vé/bị loại)
        statistics.json    # thống kê theo giải, cấu trúc như Liquipedia (có thể bỏ trống)
    i18n/{vi,en,ko,ja}.json  # `{year}` trong chuỗi tự điền theo mùa của trang
  i18n/index.ts            # useT(lang, { year }), loc(), localePath(), format ngày/tiền
  lib/
    season-loader.ts       # loader đọc mọi seasons/<year>/<file>.json, gắn `season`, theo dõi khi dev
    data.ts                # SEASONS, CURRENT_SEASON, tournamentsOf(year), teamsOf(year), rosterOf(), sectionPath()…
    bracket-layout.ts  seo.ts  jsonld.ts
  components/              # layout/ (Header, SeasonSwitcher, MatchTicker = dải giải đấu), ui/, tournament/, schedule/, match/
  pages/
    index.astro            # chọn ngôn ngữ (x-default)
    [lang]/index.astro     # trang chủ — luôn là mùa hiện tại
    [lang]/[season]/       # tournaments, schedule, teams, statistics, rules (theo từng năm)
    [lang]/tournaments/[slug]  [lang]/matches/[matchId]  [lang]/teams/[teamSlug]   # chi tiết, không đổi URL
    og/[...slug].png.ts    # ảnh OG 1200×630 cho site, từng trận, giải, đội (satori + resvg)
public/ _headers  _redirects
scripts/ data.test.mjs  bracket-layout.test.mjs  seo.test.mjs  season-redirects.mjs
```

## URL theo mùa giải

| Trang | URL |
| --- | --- |
| Giải đấu, lịch, đội, thống kê, thể thức | `/vi/2027/tournaments/`, `/vi/2027/schedule/`, `/vi/2027/teams/`, `/vi/2027/statistics/`, `/vi/2027/rules/` |
| Chi tiết giải / trận / đội | `/vi/tournaments/<slug>/`, `/vi/matches/<id>/`, `/vi/teams/<slug>/` (slug giải và id trận đã chứa năm) |
| Link ngắn | `/vi/schedule`, `/vi/teams`… → mùa hiện tại (302, sinh lúc build vào `dist/_redirects`) |

Menu, footer và dải giải đấu dưới header luôn theo mùa của trang đang xem; nút chọn năm trên header chuyển sang cùng mục ở mùa khác. Trang đội hiển thị mùa mới nhất, có tab cho các mùa trước.

## Thêm mùa giải mới (vd 2028)

1. Tạo `src/data/seasons/2028/` với `season.json` (`"year": 2028`), `tournaments.json`, `rosters.json`, `matches.json`, `brackets.json` (file nào chưa có dữ liệu có thể bỏ qua).
2. Id phải duy nhất giữa các mùa: dùng slug có năm (`vct-pacific-2028-kickoff`, `ko28-u1-1`, roster `t1-2028`).
3. Khi mùa mới bắt đầu: đổi `"current": true` sang `2028/season.json` (bỏ ở 2027). Trang chủ, link ngắn và redirect tự chuyển sang 2028.
4. Trang Thể thức chỉ sinh cho mùa có `"explainer": true` (nội dung ở i18n `rules.*`); mùa không có sẽ dẫn tới bản gần nhất.
5. `pnpm test` kiểm tra: đúng một mùa `current`, năm thư mục khớp `season.json`, trận/nhánh nằm cùng mùa với giải, roster đúng dạng `<team>-<year>`, Partner của mùa có mặt ở Kickoff.

## Cập nhật dữ liệu

Mọi thay đổi là sửa JSON trong `src/data/seasons/<year>/` → `pnpm test` → commit/push → Cloudflare Pages tự build.

- **Giờ thi đấu**: điền `startTime` (ISO có offset, vd `2027-01-11T17:00:00+07:00`). Trang lịch tự gom theo ngày, dải trên cùng tự hiện các trận sắp tới.
- **Bốc thăm / hạt giống**: điền `teams[i].team` (id đội) cho các trận vòng 1–2 nhánh trên.
- **Kết quả**: đặt `status: "completed"`, `winner` (0/1), `score` của 2 đội; thêm `skirmish`, `veto`, `maps` (KAST trong `maps[].players` là phần trăm, vd `72`). Điền đội vào trận kế tiếp theo `brackets.json → progression`.
- **Trận đang đá**: `status: "live"` (site tĩnh — cần build lại để cập nhật tỉ số).
- **Thống kê**: `statistics.json` — `pickRate`, `winRate`, `atkWinRate`, `defWinRate`, `kast` là tỉ lệ 0–1.
- **Roster**: sửa `rosters.json` của mùa đó, đổi `status` từ `reported` sang `official` khi đội công bố; cập nhật `asOf`.
- **Chuỗi nội dung** có dạng `{ "vi", "en", "ko", "ja" }` — test bắt buộc đủ 4 ngôn ngữ. Chuỗi giao diện ở `src/data/i18n/*.json`, cả 4 file phải cùng key và cùng placeholder (`{n}`, `{year}`…).
- Thông tin chưa được Riot xác nhận để `confirmed: false` / `datesConfirmed: false` → UI hiện nhãn "Dự kiến".

## Cloudflare Pages

| Thiết lập | Giá trị |
| --- | --- |
| Root directory | `landing` |
| Build command | `pnpm build` |
| Output directory | `dist` |
| Env | `NODE_VERSION=24`, `SITE_URL=https://vctpacificfan.likecactus.com` |
| Custom domain | `vctpacificfan.likecactus.com` |

Hoặc deploy thủ công: `pnpm deploy:cf` (build + test SEO + `wrangler pages deploy`, project `vctpacificfan`).

Tối ưu đi kèm:
- `public/_headers`: `/_astro/*` (JS/CSS/font có hash) cache 1 năm `immutable`; HTML `must-revalidate`; `/og/*` cache 1 ngày; header bảo mật cơ bản.
- `public/_redirects`: `/vi-VN/…`, `/en-US/…`, `/ko-KR/…`, `/ja-JP/…` → mã ngắn; trang chi tiết thiếu ngôn ngữ → `/vi/…`. Lúc build, `scripts/season-redirects.mjs` nối thêm link ngắn theo mùa hiện tại (`/vi/schedule` → `/vi/2027/schedule/`) và URL cũ `/vi/rules-2027` → `/vi/2027/rules/`.
- Chuyển trang dùng View Transitions giữa các trang (CSS `@view-transition`): header và dải giải đấu đứng yên, vạch chọn trượt sang giải mới; `prefetch` khi rê chuột để mở trang gần như tức thì.
- Mọi URL nội bộ có dấu `/` cuối (`trailingSlash: 'always'`) để khớp định tuyến thư mục của Pages, không tốn một lần redirect.
- `sitemap-index.xml` có `xhtml:link` hreflang cho 4 ngôn ngữ; mỗi trang có canonical, hreflang + `x-default`, OpenGraph, JSON-LD (`SportsEvent`, `SportsTeam`, `BreadcrumbList`).
