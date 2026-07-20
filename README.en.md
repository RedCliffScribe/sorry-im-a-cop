<div align="center">

# Sorry, I'm a Cop

### 对唔住，我系差人

A local-first, AI-driven interactive narrative RPG set in Hong Kong from 1980 to 1996.

[简体中文](README.md) · **v1.0.0** · Simplified Chinese launch release

</div>

![The fixed night-harbour home screen of Sorry, I'm a Cop](docs/media/home.png)

## Enter a Hong Kong that keeps living

Begin as a police officer, a triad member, or an ordinary civilian. Cases do not have to freeze when the player looks away. Important characters can act off-screen, institutions and societies accumulate pressure and change their plans, and newspapers bring the consequences of past events back into public view. Identity is not a permanent class card either: a civilian may enter the police or a society, while an undercover officer or member lives through the public identity that the city can see.

The project does not reduce life in Hong Kong to a police procedure simulator or a fixed quest tree. The LLM interprets actions, writes the narrative, and proposes developments. The local runtime preserves facts, validates structured writeback, retrieves memories, and ensures that later turns inherit what actually happened.

## Core experience

- **Three origins and evolving identities** — Police, triad, and civilian starts receive different projections. Identity transitions preserve family, work, relationships, and unresolved pressures. Undercover routes use the public identity to select the main interface while keeping the real identity in canonical state.
- **A persistent world, not a one-turn chat** — Characters, places, assets, cases, relationships, news, city tracks, and organisation states enter the save through validated structured writeback. Narrative prose cannot silently overwrite persistent state.
- **NPCs that remember selectively** — Recent interactions, compressed durable character memory, and vector retrieval work together. Important NPCs can continue acting beyond the player's immediate scene and retain experiences that have lasting behavioural value.
- **Cases and off-screen evolution** — Cases assigned to non-player investigators advance according to the handler, current situation, time window, and possible failure. City conditions, active institutions, businesses, and societies evolve at a deliberate pace rather than jumping every turn.
- **Local-first long-save architecture** — IndexedDB stores saves, rollback snapshots, and larger payloads. The game supports manual and automatic saves, ZIP import/export, rerolls, and editing a previous action before regenerating the timeline.
- **Independent model routes** — Main narrative, writeback repair, memory summarisation, embeddings, NPC simulation, background evolution, and auxiliary generation may use separate API profiles and models.
- **Desktop and mobile layouts** — Map, combat, assets, finances, dynamics, cases, news, character archive, network, fate, reputation, police, triad, institution, and memory panels reflow for the device. The home screen always keeps its night-harbour presentation; opening, settings, game, and feature panels may use either the dark or bright theme.

## Game interface

| Dark · Night Harbour Archive | Bright · Daylight Archive |
| --- | --- |
| ![Dark game interface](docs/media/game-dark.png) | ![Bright game interface](docs/media/game-light.png) |

### City Pulse

![City Pulse showing important NPC activity, city evolution, and archived history](docs/media/city-pulse.png)

City Pulse brings current matters, rumours, important NPC activity, city tracks, and archived outcomes into one view. It is a projection of narrative state, not a second simulation game detached from the story.

## Run locally

Install a current Node.js LTS release and npm, then run:

```powershell
npm ci
npm run dev
```

Vite will print the local URL. On first launch, open the onboarding guide from the home screen and configure:

1. the main narrative API and model;
2. required support routes such as writeback repair, memory summarisation, and embeddings;
3. optional NPC simulation, background evolution, and auxiliary generation;
4. narrative perspective, text presentation, and interface theme.

The project supports OpenAI-compatible endpoints and includes configuration paths for OpenAI, Anthropic, Gemini, DeepSeek, OpenRouter, SiliconFlow, Ollama, and custom providers. Model availability, billing, content policy, and data handling are governed by the third-party service selected by the player.

### Build and verify

```powershell
npm run lint
npm run test:run
npm run test:e2e
npm run build
```

Long-running tests that use real APIs or multi-turn identity routes are exposed as separate commands and are never triggered by the default test suite.

## Local data, APIs, and privacy

- API profiles, keys, saves, generated story, and runtime state stay in the player's browser or device by default.
- Model requests go directly from the browser to the third-party service chosen by the player. The developer does not operate an AI proxy for those requests.
- Exported API settings may contain plaintext keys. Treat them as private migration or backup files; never commit them to Git or share them publicly.
- Optional Cloudflare Pages Functions + D1 analytics collect only limited anonymous operational metrics, such as online presence, sessions, language, device class, app version, and coarse IP-derived region. They do not store raw IP addresses, API keys, API settings, story text, player input, saves, prompts, or model request/response bodies.
- Local development does not send analytics by default. Anonymous heartbeat events are enabled only for production builds or explicit opt-in configuration.

## Content notice

The project uses publicly available historical and biographical material to establish its period setting. Apart from that preloaded public material, dynamic events, dialogue, relationships, and story developments are generated at runtime from the player's choices, current save state, and the third-party AI service selected by the player.

Generated content is fictional material belonging only to the relevant local save. It does not represent the real experiences, words, views, or character of any real person. The game is not authorised, sponsored, endorsed, or produced in cooperation with any real person, institution, company, or rights holder mentioned in it. The full legal notice, AI-generated content notice, and terms of use are available from the home screen.

Corrections and rights notices: **kale014@gmail.com**

## Licences

© 2026 RedCliffScribe.

- **Software code** — Open source under [`AGPL-3.0-only`](LICENSE). It may be used, modified, and operated commercially, but distribution or network operation of a modified version must provide the corresponding source as required by the licence.
- **Original content assets** — Original artwork, demonstration images, Storypack/Worldpack narrative content, and other non-code works that RedCliffScribe is authorised to license are available under [`CC BY-NC-SA 4.0`](LICENSE-ASSETS.md). Attribution is required, commercial use is prohibited, and shared adaptations must use the same licence.

The software code is open source, but the complete game containing the covered content assets may not be used commercially without separate permission. These licences apply only to material owned by or licensable by RedCliffScribe; they do not grant rights in third-party names, trademarks, public facts, or other third-party material. Commercial licensing enquiries: **kale014@gmail.com**.
