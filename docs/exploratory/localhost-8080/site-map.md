# Site map — http://localhost:8080

- base_url: http://localhost:8080
- mode: both (used: both)
- source: C:\PersonalProjects\retro-video-games-portal
- date: 2026-10-08
- pages: 18
- code-only routes: 1 (P16)
- live-only routes: 12 (P03, P04, P05, P06, P07, P08, P09, P10, P11, P12, P13, P14)
- truncated: no

## Pages

| id | url (normalized) | title | source | requires | links_to | forms | notes |
|---|---|---|---|---|---|---|---|
| P01 | http://localhost:8080/ | Retro Games Portal | both | none | P02, P03, P04, P05, P06, P07, P08, P09, P10, P11, P12, P13, P14 | — | 1 text input outside any form (no form element); SPA (React Router) |
| P02 | http://localhost:8080/login | Retro Games Portal | both | none | P01, P02, P15 | login(email,password) | login page |
| P03 | http://localhost:8080/game/68d7b064bebf6fbfe2907118 | Retro Games Portal | live | none | P01, P02 | — | instance of P16 (Bubble Bobble) |
| P04 | http://localhost:8080/game/68d7b064bebf6fbfe290710b | Retro Games Portal | live | none | P01, P02 | — | instance of P16 (Castlevania) |
| P05 | http://localhost:8080/game/68d7b064bebf6fbfe2907105 | Retro Games Portal | live | none | P01, P02 | — | instance of P16 (Chip 'n Dale Rescue Rangers) |
| P06 | http://localhost:8080/game/68d7b064bebf6fbfe290710a | Retro Games Portal | live | none | P01, P02 | — | instance of P16 (Contra) |
| P07 | http://localhost:8080/game/68d7b064bebf6fbfe2907117 | Retro Games Portal | live | none | P01, P02 | — | instance of P16 (Dig Dug) |
| P08 | http://localhost:8080/game/68d7b064bebf6fbfe290710e | Retro Games Portal | live | none | P01, P02 | — | instance of P16 (Donkey Kong) |
| P09 | http://localhost:8080/game/68d7b064bebf6fbfe2907114 | Retro Games Portal | live | none | P01, P02 | — | instance of P16 (Duck Hunt) |
| P10 | http://localhost:8080/game/68d7b064bebf6fbfe2907115 | Retro Games Portal | live | none | P01, P02 | — | instance of P16 (Excitebike) |
| P11 | http://localhost:8080/game/68d7b064bebf6fbfe2907113 | Retro Games Portal | live | none | P01, P02 | — | instance of P16 (Final Fantasy) |
| P12 | http://localhost:8080/game/68d7b064bebf6fbfe2907116 | Retro Games Portal | live | none | P01, P02 | — | instance of P16 (Galaga) |
| P13 | http://localhost:8080/game/6a9034e8e4d231a4f5e6a3d6 | Retro Games Portal | live | none | P01, P02 | — | instance of P16 (Kirby's Adventure) |
| P14 | http://localhost:8080/game/68d7b064bebf6fbfe2907109 | Retro Games Portal | live | none | P01, P02 | — | instance of P16 (Mega Man 2) |
| P15 | http://localhost:8080/register | Retro Games Portal | both | none | P01, P02 | register(email,password,confirmPassword) | linked only from login |
| P16 | http://localhost:8080/game/:id | — | code | none | — | — | pattern, not navigable |
| P17 | http://localhost:8080/admin | Retro Games Portal | both | admin | — | — | redirects to P02; guard ProtectedRoute requiredRole="admin"; not linked from any crawled page |
| P18 | http://localhost:8080/owner | Retro Games Portal | both | admin | — | — | redirects to P02; guard ProtectedRoute requiredRole="owner" (role owner, not admin; closest value); not linked from any crawled page |

## External links

| url | found_on |
|---|---|
| — | — |

## Finding candidates

| id | page | note |
|---|---|---|
| — | — | — |
