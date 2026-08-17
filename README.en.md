<div align="center">

# Sorry, I'm a Cop

### 对唔住，我系差人

A local-first, AI-driven interactive narrative RPG set in Hong Kong from 1980 to 1996.

[Play online](https://simc.pages.dev/) · [简体中文](README.md) · **v2.0.4**

</div>

## A Hong Kong that keeps living

Begin as a police officer, a triad member, or an ordinary civilian. Cases, characters, relationships, news, institutions, and city pressures persist in structured local state. The AI interprets actions and writes the narrative; the local runtime preserves facts, validates writeback, settles checks, and carries established events into later turns.

This is not a fixed quest tree or a game that reduces Hong Kong life to police procedure. Players may investigate, work, build relationships, manage assets, enter city events, or walk away while other people and organisations continue to act.

## Current release

The v2.0.4 public source snapshot includes:

- **Three origins and persistent identities** — Police, triad, and civilian starts have different openings, authority, work schedules, and social ties without erasing prior life when identity changes.
- **Long-save world state** — Character archives, NPC memory, networks and close bonds, cases, matters, news, assets, finances, weather, experience, reputation, and organisation evolution persist locally.
- **Local checks and writeback safeguards** — Checks, progression, case ownership, relationship evidence, and long narrative arcs are validated locally so a malformed model field does not casually destroy the turn.
- **Official narrative DLC: Urban Legends** — Select it for a new game or safely attach it to a compatible Hong Kong 1988 save. Long-running stories retain a unique identity and support pause, resume, and continuation.
- **AVG story presentation** — Narration, dialogue, portraits, scenes, turn replay, and switching back to the original prose. Saves continue normally without the optional resource pack.
- **Custom content and Creative Workshop** — Custom characters, events, and content projects, plus public preset browsing, validation, and import paths.
- **Multiple model and image providers** — Narrative, repair, memory, embeddings, background evolution, and image generation can use separate compatible service profiles.
- **Desktop and mobile layouts** — Major panels, long lists, dialogs, opening forms, and settings use responsive layouts and bounded scrolling.

The complete player-facing changelog is available from the game's home screen.

## Play online

Open [https://simc.pages.dev/](https://simc.pages.dev/). On first use, configure a model service of your choice in Settings; no shared API key is bundled with the project.

Saves, API profiles, and runtime state remain in the current browser's local database by default. Export a backup before changing devices, browsers, or clearing site data.

## Run locally

Requires Node.js `^20.19.0` or `>=22.12.0` and npm:

```powershell
git clone https://github.com/RedCliffScribe/sorry-im-a-cop.git
cd sorry-im-a-cop
npm ci
npm run dev
```

Production build:

```powershell
npm run build
npm run preview
```

## AVG artwork pack

AVG presentation uses a separate resource pack so large artwork is not bundled into the web source repository. Download it from the [SourceForge release directory](https://sourceforge.net/projects/sorry-im-a-cop-v2/files/hk1988-avg-resource-pack/1.2.0/) and import it from Settings under “AVG presentation resources”.

This repository does not include the AVG pack, candidate images, production assets, or original art project files. The small set of pre-existing built-in interface and runtime assets is retained only so the source can build and is covered by the content licence below.

## Public repository boundary

This repository is a release-oriented source snapshot. It intentionally excludes:

- internal planning, implementation, acceptance, and development-process documents;
- API keys, exported API profiles, player saves, and raw diagnostics;
- raw model responses, temporary test output, `dist`, and `output`;
- external artwork packs, rejected candidates, and art-production directories.

## Verification

```powershell
npm run test:run -- --maxWorkers=2
npm run lint
npm run build
```

Real-provider acceptance scripts are never run by the default suite and contain no credentials.

## Local data, APIs, and privacy

- Model requests go directly from the browser to the third-party service selected by the player; the developer does not operate an AI proxy for them.
- Exported API settings may contain plaintext keys and should remain on the local device or in a trusted private backup.
- Optional operational analytics record only limited anonymous metrics and do not store raw IP addresses, API keys, story text, player input, saves, prompts, or model response bodies.
- Local development sends no analytics by default. Production presence statistics use low-frequency, consolidated activity updates.

## Content notice

The project uses public historical and biographical material to establish its period setting. Dynamic events, dialogue, relationships, and story developments are generated from player choices, the current save, and the third-party AI service selected by the player. They are fictional content belonging only to that save and do not represent the real experiences, views, or character of any real person.

Corrections and rights notices: **kale014@gmail.com**

## Licences

© 2026 RedCliffScribe.

- **Software code** — Open source under [`AGPL-3.0-only`](LICENSE).
- **Original content assets** — Original artwork, narrative content, and other non-code works that RedCliffScribe is authorised to license are provided under [`CC BY-NC-SA 4.0`](LICENSE-ASSETS.md).

The code may be used, modified, and operated under the AGPL. The complete game, when it includes content assets covered by CC BY-NC-SA 4.0, may not be used commercially without separate permission. Commercial licensing enquiries: **kale014@gmail.com**.
