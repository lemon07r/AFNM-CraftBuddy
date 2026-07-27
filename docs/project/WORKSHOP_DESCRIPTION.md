---
title: Workshop Description
status: active
authoritative: true
owner: craftbuddy-maintainers
game_version: 0.7.6-7c586da
last_verified: 2026-07-27
source_of_truth: Steam Workshop item 3661729323, package.json, src/settings/index.ts, src/optimizer/search.ts, crates/craftbuddy-engine/*
review_cycle_days: 30
related_files:
  - docs/project/RELEASE_PROCESS.md
  - docs/project/RELEASE_NOTES_6.1.0.md
  - docs/project/RELEASE_NOTES_6.0.0.md
  - docs/project/OPTIMIZER_DESIGN.md
  - scripts/workshop-upload.ts
---

[h1]CraftBuddy[/h1]
[b]A crafting optimizer for Ascend From Nine Mountains.[/b]

CraftBuddy reads your live craft, simulates thousands of possible continuations, and tells you the best next action — and [i]why[/i]. No spreadsheets, no memorised rotations, no wasted materials.

[b]Updated for game version 0.7.6.[/b]

[hr][/hr]

[h1]What's New in v6.1.0[/h1]
A game-version update with one real mechanics change.

[list]
[*] [b]Updated for 0.7.6[/b] — verified against the live game, so every recommendation is scored with the current rules.
[*] [b]Eccentric Decree now matches the game[/b] — the game rewards this harmony on [i]each[/i] burst of completion or perfection, and the focused bar can switch mid-technique. CraftBuddy scores it the same way instead of settling up once at the end of your turn.
[*] [b]The Fallen Soulflame nerf is accounted for[/b] — the weaker souls are picked up straight from the game, so CraftBuddy no longer over-values a Soulflame line.
[*] [b]Techniques are labelled the way the game labels them[/b] — the renamed "Strive for Completion" now reads as "Strive for Completion" in the panel instead of its older name.
[*] [b]Fixed: harmony progress was being forgotten[/b] — Enhancing Echo attunement and Eccentric Decree's focused bar were being reset every time CraftBuddy re-read your craft. They are kept now, so advice for those two harmonies builds on your real harmony state.
[/list]

[hr][/hr]

[h1]What's New in v6.0.0[/h1]
A ground-up accuracy rework built around one goal: play the craft the way the game actually scores it.

[list]
[*] [b]Harmonies done properly[/b] — you choose the harmony, all seven types are simulated, and each one's complexity multiplier is applied to your real targets.
[*] [b]A new outcome model[/b] — CraftBuddy plays for the outcome tier you can actually reach, requiring completion [b]and[/b] perfection bands together instead of dumping points into whichever bar scored highest. Sublime crafts stopped running away with over-completion or perfection spam that never banks a band.
[*] [b]It shows its work[/b] — projected tier, band progress per bar, which bar is holding you back, when the craft will auto-finish, and when an action is setting up a gated technique.
[*] [b]Plays nicely with auto-use[/b] — auto mode respects your crafting auto-use loadout instead of double-spending pills, and re-verifies the live craft before every action.
[*] [b]Mechanics fixes[/b] — Disciplined Touch scaling, Soulflame stability loss, the real Spiritual Resonance penalty, and corrected crit, mastery and toxicity maths.
[*] [b]Faster[/b] — the native engine became [b]1.90x[/b] quicker while producing identical recommendations.
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
[*] Harmony-aware simulation for all seven harmonies
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
Crafts finish on their own once both bars are far enough along, so CraftBuddy tells you when the craft will auto-finish rather than asking you to press anything.

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
Not sure what to change? Just pick a preset — each one adjusts all four search parameters together in tested ratios.
[list]
[*] [b]Instant[/b] — near-zero latency, minimal lookahead
[*] [b]Fast[/b] — quick results, good for simple crafts
[*] [b]Balanced[/b] — recommended for most crafting
[*] [b]High Accuracy[/b] — deeper search for complex or high-value crafts
[*] [b]Max[/b] — maximum depth, may take several seconds per recommendation
[/list]

[h2]Manual Search Controls[/h2]
For advanced users. These four sliders are coupled — pushing one far above the others wastes search time and can even reduce recommendation quality.
[list]
[*] [b]Lookahead Depth[/b]
[*] [b]Search Time Budget[/b]
[*] [b]Search Max Nodes[/b]
[*] [b]Search Beam Width[/b]
[/list]
Search stops as soon as either the time budget or the node budget is reached. Results vary with craft complexity and machine speed, since the time budget is wall-clock based.

[h2]Display Options[/h2]
Toggle predicted rotation, final state estimates, upcoming conditions and alternative actions independently.

[h2]Engine Selector[/h2]
[list]
[*] [b]Legacy engine[/b] — the established lookahead optimizer. Reliable and thoroughly tested for all crafting.
[*] [b]Experimental engine[/b] — opt-in Rust/WASM assistance for difficult late-game, sublime and harmony-heavy crafts. As of v6 it models the same mechanics as the main engine and runs 1.90x faster than before.
[/list]
[b]Recommendation:[/b] keep Legacy for everyday crafting and try Experimental on tough late-game or sublime crafts. If Experimental ever gives a suspicious recommendation, switch back to Legacy in CraftBuddy settings.

[hr][/hr]

[h1]Snapshots — Help Improve CraftBuddy[/h1]
Press [b]Ctrl+Shift+Y[/b] during any craft to export an optimizer replay snapshot. Snapshots capture the full craft state, your available techniques and the optimizer's reasoning — everything needed to reproduce and fix an issue.

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
