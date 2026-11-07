# Exploratory testing findings — http://localhost:8080

> Potential findings from one time-boxed exploratory session. Each is an unverified candidate: reproduce it before filing. Nothing here was confirmed against requirements.

## 1. Run summary

| | |
|---|---|
| URL | http://localhost:8080 |
| Mode | both (map built from: both) |
| Started | 2026-10-08T17:55:44.288Z |
| Duration | about 09:00 of 20 min budget |
| Result | OK |
| Pages mapped | 18 |
| Pages analyzed | 15 |
| Potential findings | 11 (critical 0, major 1, minor 4, trivial 6) |
| Admin scope | excluded — no admin credentials supplied |
| Guardrail blocks | 0 (see section 3) |

## 2. Coverage

| Page | URL | Status | Notes |
|---|---|---|---|
| P01 | / | analyzed | search run with a match, a no-match and markup-like text; 375 px check done |
| P02 | /login | analyzed | invalid-account submit only (qa-invalid-user@example.invalid) |
| P03 | /game/68d7b064bebf6fbfe2907118 | analyzed | |
| P04 | /game/68d7b064bebf6fbfe290710b | analyzed | |
| P05 | /game/68d7b064bebf6fbfe2907105 | analyzed | audit only |
| P06 | /game/68d7b064bebf6fbfe290710a | analyzed | audit only |
| P07 | /game/68d7b064bebf6fbfe2907117 | analyzed | audit only |
| P08 | /game/68d7b064bebf6fbfe290710e | analyzed | audit only |
| P09 | /game/68d7b064bebf6fbfe2907114 | analyzed | audit only |
| P10 | /game/68d7b064bebf6fbfe2907115 | analyzed | audit only |
| P11 | /game/68d7b064bebf6fbfe2907113 | analyzed | audit only |
| P12 | /game/68d7b064bebf6fbfe2907116 | analyzed | audit only |
| P13 | /game/6a9034e8e4d231a4f5e6a3d6 | analyzed | |
| P14 | /game/68d7b064bebf6fbfe2907109 | analyzed | console clean |
| P15 | /register | analyzed | invalid values only; valid submit not exercised |
| P16 | /game/:id | skipped | pattern, not navigable |
| P17 | /admin | excluded | no admin credentials supplied |
| P18 | /owner | excluded | no admin credentials supplied |

**Not covered at the deadline:** none.

## 3. Excluded scenarios

### 3a. Scope excluded

| Scope | Reason |
|---|---|
| Admin pages (P17, P18) | No admin credentials supplied. |

### 3b. Actions blocked by guardrails

| Reason | Page | What was blocked |
|---|---|---|
| — | — | — |

## 4. Potential findings

### EX-001 — Game detail page shows the creator's email address to anonymous visitors

| | |
|---|---|
| Page | P13 `/game/6a9034e8e4d231a4f5e6a3d6` |
| Severity guess | major |
| Category | content |
| Confidence | medium |

**Steps**
1. Without logging in, open `/game/6a9034e8e4d231a4f5e6a3d6` (Kirby's Adventure).
2. Look at the footer of the detail card.

**Expected:** A public page does not show a user's personal email address (oracle: convention / privacy).
**Actual:** The page shows `Created by:` followed by a full email address. Other game pages, for example P03, show `Created by: Unknown`.

**Why it is a problem:** Email addresses are personal data. Shown to anonymous visitors, they can be scraped for spam or phishing and may breach the privacy expectations (and, depending on jurisdiction, data-protection rules) of the user who created the game. The sibling pages render `Created by: Unknown`, so the application already treats the creator as something to hide or omit; this page contradicts that. Likely cause (not verified): the creator's email is rendered raw on games that have a linked user. Whether the exposure is intended is not known, which is why confidence is medium.

**Evidence**
- Snapshot: `.playwright-cli/page-2026-10-08T18-03-11-903Z.yml` line 56 — `generic: "Created by: <email address>"` (value withheld here)

### EX-002 — Every game cover image fails to load; all list cards show "No Image Available"

| | |
|---|---|
| Page | P01 `/`, and the detail pages P03–P14 |
| Severity guess | minor |
| Category | network |
| Confidence | high |

**Steps**
1. Open `/`.
2. Look at the 12 cards on page 1 of the game list.

**Expected:** Cover images load.
**Actual:** All 12 cards show "No Image Available". Every cover request to upload.wikimedia.org fails. Several different games share the same path prefix `/8/8a/`, which suggests the stored URLs may be wrong (low confidence on the cause). The search result card for "The Legend of Zelda" did show an image named "The Legend of Zelda".

**Why it is a problem:** The catalogue is image-led. With every cover missing, visitors cannot tell games apart at a glance and the page looks broken, so the main browsing experience is degraded for everyone. The requests go to a third-party host (upload.wikimedia.org) that the site does not control, and the browser blocks them as `ERR_BLOCKED_BY_ORB`, which usually means the stored URL returns something that is not an image (for example an HTML page). This breaks the platform oracle (assets that fail to load). Likely cause, not verified: stale or invalid image URLs in the seed data, or hotlinking being refused by the host.

**Evidence**
- Network: `[GET] https://upload.wikimedia.org/wikipedia/en/8/8a/Bubble_Bobble.jpg => [FAILED] net::ERR_BLOCKED_BY_ORB`
- Network: `[GET] https://upload.wikimedia.org/wikipedia/en/8/8a/Castlevania_cover.jpg => [FAILED] net::ERR_BLOCKED_BY_ORB`
- Network: `[GET] https://upload.wikimedia.org/wikipedia/en/2/27/Mega_Man_2_cover.jpg => [FAILED] net::ERR_BLOCKED_BY_ORB`

### EX-003 — Show/hide password buttons have no accessible name

| | |
|---|---|
| Page | P02 `/login`, P15 `/register` |
| Severity guess | minor |
| Category | accessibility |
| Confidence | high |

**Steps**
1. Open `/register`.
2. Click into the "Confirm Password" field and press Tab.

**Expected:** The focused control has a name, such as "Show password".
**Actual:** Focus lands on an icon-only button with an empty accessible name. There is one such button on `/login` and two on `/register`.

**Why it is a problem:** A screen-reader or voice-control user meets an unnamed button next to the password field. They cannot tell that it shows or hides the password, and with voice control they cannot say its name to activate it. This breaks the accessibility standard that every control has a name (WCAG 2.1 SC 4.1.2 Name, Role, Value). Impact is limited to assistive-technology users, but it sits on the sign-in and sign-up path.

**Evidence**
- Audit P02: `"buttonsWithoutName":["<button type=\"button\" class=\"absolute right-3 top-1/2 transform -translate-y-1/2"]`
- Snapshot: `.playwright-cli/page-2026-10-08T18-04-05-526Z.yml` line 45 — `button [active]` with no name

### EX-004 — Header button has no accessible name at mobile width

| | |
|---|---|
| Page | P01 `/` |
| Severity guess | minor |
| Category | accessibility |
| Confidence | high |

**Steps**
1. Open `/` and resize the viewport to 375×812.
2. Inspect the header buttons.

**Expected:** The header button (probably the menu toggle) has an accessible name.
**Actual:** The audit reports a header button with no name. It does not appear at 1280 px.

**Why it is a problem:** On a phone-sized screen the header button is probably the only way to open the navigation. Without an accessible name, a screen-reader or voice-control user on mobile cannot identify it or open the menu. This breaks WCAG 2.1 SC 4.1.2 Name, Role, Value. That the button is the menu toggle is inferred from its position and from its disappearing at 1280 px, not observed in use.

**Evidence**
- Audit at 375 px: `"buttonsWithoutName":["<button class=\"text-arcade-text hover:text-neon-pink transition-colors duration-"]`

### EX-005 — Game search box has no label (placeholder only)

| | |
|---|---|
| Page | P01 `/` |
| Severity guess | minor |
| Category | accessibility |
| Confidence | high |

**Steps**
1. Open `/`.
2. Inspect the textbox with placeholder "Search games...".

**Expected:** The input has a programmatic label.
**Actual:** The audit lists it as unlabelled; its only name comes from the placeholder.

**Why it is a problem:** The only text naming the search box is its placeholder, which vanishes when the user starts typing and is not a dependable accessible name in every assistive technology. Users who rely on screen readers or voice control may not be able to find or address the field, and sighted users lose the hint once they type. This breaks WCAG 2.1 SC 1.3.1 Info and Relationships and SC 3.3.2 Labels or Instructions. Impact is small because the page has one obvious input.

**Evidence**
- Audit P01: `"inputsWithoutLabel":["input[type=text]"]`

### EX-006 — Login and register pages have no h1

| | |
|---|---|
| Page | P02 `/login`, P15 `/register` |
| Severity guess | trivial |
| Category | accessibility |
| Confidence | high |

**Steps**
1. Open `/login`, then `/register`.

**Expected:** Each page has one h1.
**Actual:** `h1Count` is 0. The top heading is level 2: "LOGIN" and "OWNER REGISTRATION".

**Why it is a problem:** Screen-reader users navigate by headings and expect one level-1 heading that states the page's purpose; with none, they have no page-level anchor on the two pages that handle sign-in and sign-up. This is a best-practice and WCAG 2.1 SC 1.3.1 concern rather than a blocker, so impact is low.

**Evidence**
- Audit P02 and P15: `"h1Count":0`

### EX-007 — Heading levels are skipped on the home page and on game detail pages

| | |
|---|---|
| Page | P01, P03–P14 |
| Severity guess | trivial |
| Category | accessibility |
| Confidence | high |

**Steps**
1. Open `/`, or any `/game/<id>` page.

**Expected:** No skipped heading levels.
**Actual:** On `/`, the h1 is followed by h3 card titles. On detail pages, the h1 is followed by h3 "Platforms:" before the h2 "Description".

**Why it is a problem:** Skipped levels (h1 straight to h3) make the heading outline misleading, so users who jump through headings cannot tell which section a heading belongs to. It breaks the convention that heading levels nest without gaps (WCAG 2.1 SC 1.3.1, advisory). The effect is on assistive-technology users and is low.

**Evidence**
- Audit on each of these pages: `"headingLevelsSkipped":true`

### EX-008 — Every page has the same title

| | |
|---|---|
| Page | all analysed pages |
| Severity guess | trivial |
| Category | content |
| Confidence | high |

**Steps**
1. Open `/`, `/login`, `/register` and any game page, and compare the browser tab titles.

**Expected:** The title reflects the page, for example the game name.
**Actual:** Every page is titled `Retro Games Portal`.

**Why it is a problem:** A single-page app that never updates `document.title` gives every route the same name. Browser tabs, history, bookmarks and search-engine results all look identical, and a screen reader announces the same title on every navigation, so users cannot tell where they are or which tab is which. This breaks WCAG 2.1 SC 2.4.2 Page Titled and the convention that a title identifies the page. Likely cause, not verified: the title is set once in the HTML shell and no route sets its own.

**Evidence**
- `Page Title: Retro Games Portal` on all 15 pages

### EX-009 — The search query is not reflected in the URL

| | |
|---|---|
| Page | P01 `/` |
| Severity guess | trivial |
| Category | functional |
| Confidence | medium |

**Steps**
1. Open `/`.
2. Type `zelda` in "Search games...".

**Expected:** The query shows in the URL so results can be shared or bookmarked (oracle: convention).
**Actual:** The list filters to "The Legend of Zelda", but the URL stays `http://localhost:8080/`.

**Why it is a problem:** A search result cannot be shared, bookmarked or restored after a reload, and the Back button does not return to a previous search, because the query lives only in component state. Users lose their place whenever they leave the page. This breaks the web convention that a view worth sharing has its own URL. It is a usability gap, not a malfunction, so severity is trivial and confidence medium; the team may have decided against it.

**Evidence**
- Snapshot after the search: `Page URL: http://localhost:8080/`

### EX-010 — favicon.ico returns 404

| | |
|---|---|
| Page | P01 `/` |
| Severity guess | trivial |
| Category | console |
| Confidence | high |

**Steps**
1. Open `/` and read the console.

**Expected:** No 404s for site assets.
**Actual:** The browser requests `/favicon.ico` and gets a 404.

**Why it is a problem:** Every first page load logs an error and the browser shows a generic tab icon. The console noise makes real errors harder to spot during development and monitoring, and the missing icon weakens branding. This breaks the platform oracle (a 4xx for a requested asset). Impact is cosmetic.

**Evidence**
- Console: `[ERROR] Failed to load resource: the server responded with a status of 404 (Not Found) @ http://localhost:8080/favicon.ico:0`

### EX-011 — A rejected login logs a console error

| | |
|---|---|
| Page | P02 `/login` |
| Severity guess | trivial |
| Category | console |
| Confidence | low |

**Steps**
1. Open `/login`.
2. Enter `qa-invalid-user@example.invalid` and any password, then press Enter.

**Expected:** The rejection is shown without console noise.
**Actual:** The page correctly shows "Invalid email or password" in a status region and keeps both fields filled. The console also logs a 401 resource error.

**Why it is a problem:** A 401 on wrong credentials is correct server behaviour, and the page handled it well: it showed "Invalid email or password" and kept the fields filled. The browser logs the failed request automatically. It only matters to teams that treat any console error as a failure signal, or if the message leaks detail (it does not appear to). Honest reading: this is probably expected behaviour, noted for completeness, which is why confidence is low.

**Evidence**
- Console: `[ERROR] Failed to load resource: the server responded with a status of 401 (Unauthorized) @ http://localhost:8080/api/auth/login:0`
