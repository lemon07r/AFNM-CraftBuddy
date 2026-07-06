---
title: Workshop Description
status: active
authoritative: true
owner: craftbuddy-maintainers
last_verified: 2026-07-06
source_of_truth: Steam Workshop item 3661729323, package.json, src/settings/index.ts, src/optimizer/search.ts, crates/craftbuddy-engine/*
review_cycle_days: 30
related_files:
  - docs/project/RELEASE_PROCESS.md
  - docs/project/OPTIMIZER_DESIGN.md
  - scripts/workshop-upload.ts
---

[h1]CraftBuddy[/h1]
Crafting optimizer for Ascend From Nine Mountains. CraftBuddy watches your live craft state, calculates the best next action, and shows you why — so you can craft with confidence instead of guesswork.

[h1]Latest update[/h1]
v5.2.0 improves sublime finish scoring, False Fusion-style setup recommendations, Soulflame/resonance stability accounting, and compact rotation visibility.

[h1]Features[/h1]
[list]
[*] Real-time recommendation for the next crafting action
[*] Expected completion, perfection, and stability gain preview
[*] Effective qi and stability cost preview (current + follow-up actions)
[*] Alternative action suggestions with comparative reasoning
[*] Lookahead search with presets and manual performance controls
[*] Condition forecast awareness and probabilistic branching beyond the forecast queue
[*] Harmony-aware simulation for sublime crafts
[*] Buff and mastery-aware simulation
[*] Large-number-safe parsing and formatting for late-game values
[*] Snapshot export for bug reports and optimizer debugging
[/list]

[h1]How to Use[/h1]
Open any crafting activity (forge, alchemical, inscription, resonance) and CraftBuddy appears automatically. The panel shows:
[list]
[*] [b]Recommended action[/b] — the best technique to use next
[*] [b]Expected gains[/b] — how much completion/perfection/stability you'll get
[*] [b]Reasoning[/b] — brief explanation of why this action was chosen
[*] [b]Alternatives[/b] — other viable actions ranked by quality
[/list]

[h1]Keyboard Shortcuts[/h1]
[list]
[*] [b]Ctrl+Shift+C[/b] — toggle panel visibility
[*] [b]Ctrl+Shift+M[/b] — toggle compact mode
[*] [b]Ctrl+Shift+Y[/b] — export optimizer replay snapshot
[/list]

[h1]Settings & Configuration[/h1]
CraftBuddy settings are accessible from a gear icon inside the CraftBuddy panel. Settings open as a slide-over panel.

[b]Search Presets[/b]
If you're unsure what to change, just pick a preset. Presets adjust all four search parameters together in tested ratios.
[list]
[*] [b]Instant[/b] — near-zero latency, minimal lookahead
[*] [b]Fast[/b] — quick results, good for simple crafts
[*] [b]Balanced[/b] — recommended for most crafting
[*] [b]High Accuracy[/b] — deeper search, better for complex or high-value crafts
[*] [b]Max[/b] — maximum search depth, may take several seconds per recommendation
[/list]

[b]Manual Search Controls[/b]
For advanced users. These four sliders are coupled — pushing one much higher than the others can waste search time and sometimes reduce recommendation quality.
[list]
[*] [b]Lookahead Depth[/b]
[*] [b]Search Time Budget[/b]
[*] [b]Search Max Nodes[/b]
[*] [b]Search Beam Width[/b]
[/list]
Search stops when either the time budget or node budget is reached first. Results vary by craft complexity and machine speed since the time budget is wall-clock based.

[b]Display Options[/b]
Toggle visibility for predicted rotation, final state estimates, upcoming conditions, and alternative actions.

[h1]v5 — Engine Selector[/h1]
v5 introduces a new engine selector in settings:
[list]
[*] [b]Legacy engine[/b] — the established lookahead optimizer. Reliable and well-tested for all crafting.
[*] [b]Experimental engine[/b] — opt-in Rust/WASM search that can help with difficult late-game, sublime, and harmony-heavy crafts where previous versions had weaker recommendations.
[/list]

[b]Recommendation:[/b] Keep Legacy for everyday crafting. Try Experimental on tough late-game or sublime crafts. If Experimental gives a suspicious recommendation, switch back to Legacy from CraftBuddy settings.

[h1]Snapshots — Help Improve CraftBuddy[/h1]
Press [b]Ctrl+Shift+Y[/b] during any craft to export an optimizer replay snapshot. Snapshots capture the full craft state, available techniques, and the optimizer's reasoning — everything needed to reproduce and debug an issue.

[b]Please send snapshots when:[/b]
[list]
[*] CraftBuddy gives a bad or suspicious recommendation
[*] You think a different action should have been suggested
[*] Something looks wrong with the gain/cost previews
[*] You encounter any unexpected behavior
[/list]

Snapshots are the single most useful thing you can include in a bug report or improvement suggestion. File reports on [url=https://github.com/lemon07r/AFNM-CraftBuddy/issues]GitHub[/url] and attach your snapshot.

[h1]Manual Installation[/h1]
If you prefer not to use the Workshop:
[list]
[*] Download the latest [b]afnm-craftbuddy.zip[/b] from [url=https://github.com/lemon07r/AFNM-CraftBuddy/releases]GitHub Releases[/url]
[*] Create a [b]mods[/b] folder in your game install directory (same folder as the game executable)
[*] Copy the zip file into [b]mods[/b] — do not unzip
[*] Launch the game
[/list]

[h1]My Other Mods[/h1]
[list]
[*] [url=https://steamcommunity.com/sharedfiles/filedetails/?id=3701616500]ElderGPT Spirit Ring[/url] — AI-powered contextual advisor overlay. Chat with any AI model inside the game.
[*] [url=https://steamcommunity.com/sharedfiles/filedetails/?id=3694065051]Lucky All Around[/url] — Configurable pity-event luck weighting for Explore events.
[/list]
[url=https://steamcommunity.com/sharedfiles/filedetails/?id=3704747572]View all my mods[/url]
