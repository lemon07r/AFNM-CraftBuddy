---
title: Workshop Description
status: active
authoritative: true
owner: craftbuddy-maintainers
game_version: 0.7.19-ac29603
last_verified: 2026-11-02
source_of_truth: Steam Workshop item 3661729323, package.json, src/settings/index.ts, src/optimizer/search.ts, src/optimizer/outcome.ts, crates/craftbuddy-engine/*
review_cycle_days: 30
related_files:
  - docs/project/RELEASE_NOTES_6.9.0.md
  - docs/project/RELEASE_NOTES_6.8.0.md
  - docs/project/RELEASE_PROCESS.md
  - docs/project/RELEASE_NOTES_6.7.0.md
  - docs/project/RELEASE_NOTES_6.6.0.md
  - docs/project/RELEASE_NOTES_6.5.0.md
  - docs/project/RELEASE_NOTES_6.3.1.md
  - docs/project/OPTIMIZER_DESIGN.md
  - scripts/workshop-upload.ts
---

[h1]CraftBuddy[/h1]
[b]A crafting optimizer for Ascend From Nine Mountains.[/b]

CraftBuddy reads your live craft, simulates possible continuations, and recommends the next action — and [i]why[/i].

[b]CraftBuddy 6.9.0 — updated for game version 0.7.19.[/b]

[hr][/hr]

[h1]What's New in v6[/h1]
Latest in 6.9.0:

[list]
[*] [b]0.7.19 ready[/b] — audited crafting rules, with all nine harmonies including Returning Cycle and Captivating Cadence still supported.
[*] [b]Correct auto-finish[/b] — no premature stop at five completion bands. The craft ends when stability runs out or both bars reach their actual caps.
[*] [b]Your band goals stay in effect[/b] — Perfection Band Goal and Completion Band Ceiling now reach every craft-ending score. Changing ambition settings marks old recommendations stale.
[*] [b]Safer choices[/b] — guaranteed routes take precedence over techniques whose failure would end below target, including when search uses multiple workers.
[*] [b]Auto-use fixes[/b] — respects the game's crafting auto-use toggle and tracks consumed pills correctly. Thanks to PommesMitChips for the report.
[*] [b]Game-accurate simulation[/b] — payment phases, droplets, buffs, quality caps, ambition targets and overcraft rewards remain modelled, with optional Rust/WASM assistance checked against the TypeScript simulator.
[/list]

[hr][/hr]

[h1]Features[/h1]
[list]
[*] Real-time recommendation for your next crafting action
[*] Expected completion, perfection and stability gain preview
[*] Effective qi and stability cost preview, including follow-up actions
[*] Ranked alternative actions with comparative reasoning
[*] Lookahead search with presets and manual performance controls
[*] Condition forecast awareness, plus probabilistic branching beyond the forecast queue
[*] Projected outcome tier, per-bar band progress, and the bar blocking your next tier
[*] Harmony-aware simulation for all nine harmonies
[*] Buff, mastery, Soulflame and toxicity-aware simulation
[*] Coexists with the game's crafting auto-use loadout
[*] Large-number-safe parsing and formatting for late-game values
[*] One-key snapshot export for bug reports and optimizer debugging
[/list]

[hr][/hr]

[h1]How to Use[/h1]
Open any crafting activity and CraftBuddy appears automatically. The panel shows:
[list]
[*] [b]Recommended action[/b] — the best technique to use next
[*] [b]Expected gains[/b] — completion, perfection and stability you can expect
[*] [b]Outcome[/b] — the tier you are on track for, each bar's band count, and which bar is blocking the next tier
[*] [b]Reasoning[/b] — why this action was chosen, including when it is setting up a gated technique
[*] [b]Alternatives[/b] — other viable actions, ranked
[/list]
CraftBuddy tells you when the craft will auto-finish; there is no manual finish button.

[h2]Keyboard Shortcuts[/h2]
[list]
[*] [b]Ctrl+Shift+C[/b] — toggle panel visibility
[*] [b]Ctrl+Shift+M[/b] — toggle compact mode
[*] [b]Ctrl+Shift+Y[/b] — export an optimizer replay snapshot
[/list]

[hr][/hr]

[h1]Settings & Configuration[/h1]
Settings live behind the gear icon inside the CraftBuddy panel and open as a slide-over.

[h2]Search Presets[/h2]
Pick a preset to adjust all four search parameters together.
[list]
[*] [b]Instant[/b] — near-zero latency, minimal lookahead
[*] [b]Fast[/b] — quick results, good for simple crafts
[*] [b]Balanced[/b] — recommended for most crafting
[*] [b]High Accuracy[/b] — deeper search for complex or high-value crafts
[*] [b]Max[/b] — maximum depth, may take several seconds per recommendation
[/list]

[h2]Manual Search Controls[/h2]
These sliders work together; pushing one far above the others can waste search time.
[list]
[*] [b]Lookahead Depth[/b]
[*] [b]Search Time Budget[/b]
[*] [b]Search Max Nodes[/b]
[*] [b]Search Beam Width[/b]
[/list]
Search stops as soon as either the time budget or the node budget is reached. Results vary with craft complexity and machine speed, since the time budget is wall-clock based.

[h2]Ambition Targets[/h2]
Both use bands ("stars") and default to [b]Auto[/b], following your target outcome tier.
[list]
[*] [b]Perfection Band Goal[/b] — aim for extra perfection bands, bounded by the recipe cap, without lowering the tier requirement.
[*] [b]Completion Band Ceiling[/b] — stop rewarding completion past your chosen band, never below what the target tier needs.
[/list]
[b]Why bars "stop" around 200%:[/b] band widths grow by 1.3x each, so the bands land at roughly 100% / 230% / 399% / 619% / 904% of the recipe target. Sublime needs two bands on both bars — about 230% — and once that is banked the craft has met its gate. If you want to push further, that is what these two targets are for.

[h2]Display Options[/h2]
Toggle predicted rotation, final state estimates, upcoming conditions and alternative actions independently.

[h2]Engine Selector[/h2]
[list]
[*] [b]Legacy engine[/b] — the established lookahead optimizer. Reliable and thoroughly tested for all crafting.
[*] [b]Experimental engine[/b] — opt-in Rust/WASM assistance for difficult late-game, sublime and harmony-heavy crafts, modelling the same mechanics as the main engine.
[/list]
[b]Recommendation:[/b] keep Legacy for everyday crafting. Try Experimental for difficult crafts; switch back if a recommendation looks wrong.

[hr][/hr]

[h1]Snapshots — Help Improve CraftBuddy[/h1]
Press [b]Ctrl+Shift+Y[/b] during a craft to export its state, techniques and reasoning for a replayable bug report.

[b]Please send a snapshot when:[/b]
[list]
[*] CraftBuddy gives a bad or suspicious recommendation
[*] You believe a different action should have been suggested
[*] A gain or cost preview looks wrong
[*] Anything behaves unexpectedly
[/list]
A snapshot is by far the most useful thing you can attach to a report. File issues on [url=https://github.com/lemon07r/AFNM-CraftBuddy/issues]GitHub[/url].

[hr][/hr]

[h1]Manual Installation[/h1]
If you would rather not use the Workshop:
[list]
[*] Download the latest [b]afnm-craftbuddy.zip[/b] from [url=https://github.com/lemon07r/AFNM-CraftBuddy/releases]GitHub Releases[/url]
[*] Create a [b]mods[/b] folder in your game install directory, next to the game executable
[*] Copy the zip into [b]mods[/b] — do not unzip it
[*] Launch the game
[/list]

[hr][/hr]

[h1]My Other Mods[/h1]
[list]
[*] [url=https://steamcommunity.com/sharedfiles/filedetails/?id=3701616500]ElderGPT Spirit Ring[/url] — an AI-powered contextual advisor overlay; chat with any AI model inside the game
[*] [url=https://steamcommunity.com/sharedfiles/filedetails/?id=3694065051]Lucky All Around[/url] — configurable pity-event luck weighting for Explore events
[/list]
[url=https://steamcommunity.com/sharedfiles/filedetails/?id=3704747572]View all my mods[/url]

[h1]Make Your Own Mod[/h1]
[url=https://github.com/lemon07r/AfnmAgentModTemplate]AFNM Agent Mod Template[/url] — a ready-to-go scaffold with ModAPI references, runtime checks, Workshop packaging and coding-agent workflows.
