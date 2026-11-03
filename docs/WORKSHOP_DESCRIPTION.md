[h1]CraftBuddy[/h1]
[b]A crafting optimizer for Ascend From Nine Mountains.[/b]

CraftBuddy reads your live craft, simulates possible continuations, and recommends the next action — and [i]why[/i].

[b]CraftBuddy 7.0.0 — for game version 0.7.19.[/b]

[hr][/hr]

[h1]What's New in v7[/h1]
Latest in 7.0.0:

[list]
[*] [b]New look[/b] — the panel and settings now use the game's own style. The panel shows one clear next action and the outcome you are working towards, with the plan, other actions and automatic crafting in collapsible sections. Settings use plain names, work with the keyboard and screen readers, and also appear in the game's mod options screen.
[*] [b]Companions[/b] — Su Lianhua's effect interception and Han Weiguang's stability-loss protection are now simulated when you hold them.
[*] [b]More accurate Qi and stability[/b] — every Qi and stability effect is applied one at a time, the way the game does it, and stability losses are reduced by your cost reductions whether or not you hold a companion.
[*] [b]Safety checks match the real action[/b] — the survival check now uses the same simulation as the action itself, so buffs used up when you pay, mastery effects and max-stability repairs are counted correctly.
[*] [b]Faster search[/b] — the same recommendations in less time, so each preset can look further ahead, which helps most on slower machines.
[*] [b]Fresher recommendations[/b] — a change in Qi droplets alone now refreshes the recommendation, and automatic crafting no longer waits on an outdated one.
[*] [b]Clearer results[/b] — a craft that ends below the lowest tier now shows "Craft failed".
[*] [b]Simpler install[/b] — the experimental Rust/WASM engine option is gone. The regular search was always the default and is unchanged, and your saved settings carry over.
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
Open settings from the gear icon on the CraftBuddy panel, or from CraftBuddy's entry in the game's mod options screen. Both edit the same settings.

[h2]Search Presets[/h2]
Pick a preset to adjust all four search parameters together.
[list]
[*] [b]Instant[/b] — lowest search budget, minimal lookahead (1-second time budget)
[*] [b]Fast[/b] — quick results, good for simple crafts
[*] [b]Balanced[/b] — more search time than Fast, for harder crafts
[*] [b]High accuracy[/b] — deeper search for complex or high-value crafts
[*] [b]Max[/b] — maximum depth, may take several seconds per recommendation
[/list]

[h2]Advanced Search[/h2]
These sliders work together; pushing one far above the others can waste search time.
[list]
[*] [b]Turns to look ahead[/b]
[*] [b]Time per turn[/b]
[*] [b]States to explore[/b]
[*] [b]Branches to keep[/b]
[/list]
Search stops as soon as either the time budget or the node budget is reached. Results vary with craft complexity and machine speed, since the time budget is wall-clock based.

[h2]Ambition Targets[/h2]
Both use bands ("stars") and default to [b]Auto[/b], following your target outcome tier.
[list]
[*] [b]Perfection band goal[/b] — aim for extra perfection bands, bounded by the recipe cap, without lowering the tier requirement.
[*] [b]Completion band ceiling[/b] — stop rewarding completion past your chosen band, never below what the target tier needs.
[/list]
[b]Why bars "stop" around 200%:[/b] band widths grow by 1.3x each, so the bands land at roughly 100% / 230% / 399% / 619% / 904% of the recipe target. Sublime needs two bands on both bars — about 230% — and once that is banked the craft has met its gate. If you want to push further, that is what these two targets are for.

[h2]Display Options[/h2]
Show or hide the panel, use compact spacing and choose whether to show upcoming conditions, planned steps and the planned end state. [b]Other actions to list[/b] sets the alternatives limit from 0 to 5 (default 1). The plan, other actions and automatic crafting are collapsible sections on the panel; saved planned-step limits are respected.

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
