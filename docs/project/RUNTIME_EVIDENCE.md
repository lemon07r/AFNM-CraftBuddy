---
title: Runtime Evidence
status: active
authoritative: true
owner: craftbuddy-maintainers
game_version: 0.7.8-24a8210
last_verified: 2026-08-09
source_of_truth: installed AFNM 0.7.8 runtime bundle (scripts/installed-game-runtime.js)
review_cycle_days: 90
related_files:
  - docs/project/MECHANICS_PARITY.md
  - docs/project/INTEGRATION_MODAPI.md
  - docs/project/OPTIMIZER_ENGINE_FINDINGS.md
  - src/optimizer/harmony.ts
  - src/modContent/nativeAutoUse.ts
  - src/modContent/autoCraftExecutor.ts
---

<!-- prettier-ignore-start -->
<!--
  Do NOT run Prettier over this file. The fenced `js` blocks are verbatim
  minified runtime source; Prettier reformats embedded JavaScript and would
  silently destroy the evidence this document exists to preserve.
-->

# Runtime Evidence

Verbatim findings extracted from the **installed** AFNM runtime, currently
**0.7.8-24a8210**. The runtime is the sole authority here: where a tooltip, a
patch note, or an earlier CraftBuddy note disagrees with the code below, the code
below wins.

**The filename carries no version on purpose.** This file used to be
`RUNTIME_EVIDENCE_075.md`, which meant every game patch produced a rename plus a
fan-out of link edits, and left stale per-version copies behind. The targeted
build now lives in the `game_version` frontmatter field and in each finding's
citation, so a future patch is a **content edit to this file**, not a new file.

## How to reproduce

```bash
bun run runtime:oracle                      # confirms build id + bundle inventory
bun run runtime:extract                     # unpacks app.asar into tmp/installed-game-runtime/<build>/
bun run runtime:grep -- "<pattern>"         # searches the extracted bundle
```

`runtime:oracle` reports `gameVersion: 0.7.8-24a8210`, extracted to
`tmp/installed-game-runtime/1168651333-1786309913280/`. The 0.7.6 findings below
were produced by diffing the 0.7.6 build (`1172405719-1785155522026/`) against
`0.7.5-d764178` (`1170135731-1784964316349/`); the 0.7.7/0.7.8 findings
(section 14) were verified directly on the current extraction.

The two crafting-relevant chunks are `dist-electron/Game.js` (~4.5 MB) and
`dist-electron/_rolldown_dynamic_import_helper.js`, which grew from ~12.8 MB in
0.7.5 to ~14.1 MB in 0.7.6. All crafting mechanics live in the helper chunk;
`Game.js` holds the React layer. `tmp/` is not committed, so the snippets are
reproduced here verbatim.

Symbol names are minified and **not stable across builds**. Resolve them by
following the re-export aliases (`rg -o "[A-Za-z_$]{1,10} as <alias>"`) rather
than reusing the identifiers below. Byte offsets are quoted only to make a
finding re-checkable in *this* extraction; they move with every build.

## What 0.7.6 changed

The whole diff, as it bears on crafting:

| Finding | Kind | Section |
| --- | --- | --- |
| Eccentric Decree scores per bar application through a new `onBarChange` hook | **real mechanics change** | 4 |
| Fallen Soulflame per-stack values nerfed | data only, no code change | 5 |
| Harmony complexity multipliers | unchanged | 6 |
| Native crafting auto-use read path; crafting loadouts now name a paired auto-use loadout | read path unchanged | 7 |
| False Fusion renamed to "Strive for Completion" | display only | 8 |
| "Toxicity cleansing can no longer crit" | combat only; crafting never critted | 9 |
| New ModAPI surfaces, non-crafting systems | available, not adopted | 10 |

Sections 1-3 predate 0.7.6 and were **re-verified against the 0.7.6 bundle**
rather than assumed; each says what was re-checked.

---

## 1. Native crafting auto-use is a pre-technique hook

### 1.1 The hook fires immediately before the technique dispatch

The `Game.js` technique handler (the `onClick` behind a technique button) reads
the loadout, applies the selected items, and only then dispatches the technique:

```js
// verbatim, `rg -o ".{260}vY\(.{0,700}" Game.js`
// f = the auto-use callback
rogressState;if(!i||!a||!o)return;let s=e.player.player.currentCraftingAutoUseLoadout?.slots;
if(!s||s.length===0)return;let c=Ly(i,a,o),l=c.pillsPerRound??1,u=1-(c.resistance??0)/100,
d=(i.stats.maxtoxicity??0)-(i.stats.toxicity??0),f=t.trainingMode!==void 0,
p=vY(s,i,a,o,e.inventory.items,{consumedPills:t.consumedPills,pillsPerRound:l,availableToxicity:d,
  getItemToxicity:e=>e.toxicity===0?0:Math.max(1,Math.floor(Ra(e,i.realm,u)))});
for(let{item:e}of p){let t={...e,stacks:1};n(ov(t)),f||n(Iy(t))}},[n,r]),
// p = the technique click handler: auto-use FIRST, then the technique
p=(0,Q.useCallback)(e=>{f(),n(Cse(e)),n(yue(e.name))},[n,f])
```

Decoded:

```ts
const runNativeAutoUse = useCallback(() => {
  if (!player || !recipe || !progressState) return;
  const slots = state.player.player.currentCraftingAutoUseLoadout?.slots;
  if (!slots || slots.length === 0) return;
  const stats = aggregateCraftingStats(player, recipe, progressState);
  const pillsPerRound = stats.pillsPerRound ?? 1;
  const resistanceScale = 1 - (stats.resistance ?? 0) / 100;
  const availableToxicity =
    (player.stats.maxtoxicity ?? 0) - (player.stats.toxicity ?? 0);
  const skipRemoval = progressState.trainingMode !== undefined;
  const selected = selectAutoUseSlots(
    slots, player, recipe, progressState, state.inventory.items,
    {
      consumedPills: progressState.consumedPills,
      pillsPerRound,
      availableToxicity,
      getItemToxicity: (item) =>
        item.toxicity === 0
          ? 0
          : Math.max(1, Math.floor(scaleToxicity(item, player.realm, resistanceScale))),
    },
  );
  for (const { item } of selected) {
    const single = { ...item, stacks: 1 };
    dispatch(applyCraftingItem(single));
    if (!skipRemoval) dispatch(removeItemFromInventory(single));
  }
}, [dispatch, ...]);

const onTechnique = useCallback((technique) => {
  runNativeAutoUse();          // <-- always first
  dispatch(executeTechnique(technique));
  dispatch(noteTechniqueUsed(technique.name));
}, [dispatch, runNativeAutoUse]);
```

**Re-verified in 0.7.6.** The same callback body is present in the 0.7.6
`Game.js` with only the minified helper names changed (`Ly` → `lw`, `vY` → `VPe`):

```js
// verbatim from the 0.7.6 Game.js
=t.progressState;if(!i||!a||!o)return;let s=e.player.player.currentCraftingAutoUseLoadout?.slots;
if(!s||s.length===0)return;let c=lw(i,a,o),l=c.pillsPerRound??1,u=1-(c.resistance??0)/100,
d=(i.stats.maxtoxicity??0)-(i
```

Details that matter:

- `pillsPerRound` defaults to **1**, not 0, when the stat is absent.
- Per-item toxicity is `toxicity === 0 ? 0 : max(1, floor(scaled(item, realm, 1 - resistance/100)))`.
- Removal is skipped when `progressState.trainingMode !== undefined` — the check
  is on **definedness, not truthiness**, so a defined-but-`false` `trainingMode`
  still suppresses inventory removal.
- The technique click dispatches **two** actions after the hook, so "the
  technique landed" is not a single-dispatch observation.

**Consequences for CraftBuddy**

- It is a *hook*, not a background timer. There is no window in which to "react"
  to native consumption — it happens inside the same user gesture.
- `autoCraftExecutor.ts` used to prefer a direct
  `store.dispatch({ type: 'crafting/executeTechnique' })`, which **bypasses the
  React handler and therefore skips this hook entirely**. The DOM-click path
  (`dispatchClickSequence`) goes through the handler and does trigger it. That
  divergence was the bug; see section 11 for how it was resolved.
- `CRAFTING_AUTO_USE_PILL` / `CRAFTING_AUTO_USE_REAGENT` are **react-dnd drag
  type strings for the loadout editor rows**, not part of this system. The
  earlier identification in the Phase 5 notes was wrong.

### 1.2 The slot selector, verbatim

```js
vY=(e,t,n,r,i,a)=>{if(!e||e.length===0)return[];let o=Math.floor(a.pillsPerRound)-a.consumedPills;
if(o<=0)return[];let s=$_(t,n,r),c=(r.step??0)===0,l={},u={},d=0,f=[],
p=e=>{if(!e)return!1;let t=i.find(t=>t.name===e);return z(t?{...t,stacks:1}:{name:e,stacks:1}).kind===`reagent`},
m=e.map((e,t)=>t);c&&m.sort((t,n)=>{let r=+!p(e[t]?.item),i=+!p(e[n]?.item);return r===i?t-n:r-i});
for(let n of m){if(f.length>=o)break;let p=e[n],m=p?.item;if(!p||!m)continue;
let h=i.filter(e=>e.name===m),g=h.reduce((e,t)=>e+(t.stacks??0),0),_=l[m]??0;if(g-_<=0)continue;
let v=z({...h[0],stacks:1});
if(!hNe(v)||v.kind===`reagent`&&!c||p.maxCount!==void 0&&p.maxCount>0&&(r.pillTracking?.[m]??0)+(u[m]??0)>=p.maxCount||!(qo(ub(Rb(p),{selfEffectBuffName:mNe(m)}),s)>0)||uk(lk(v.effects),t))continue;
let y=a.getItemToxicity(v);y+d>a.availableToxicity||(l[m]=_+1,u[m]=(u[m]??0)+1,d+=y,f.push({slot:p,rowIndex:n,item:v}))}
return f}
```

Decoded selection rules, in evaluation order — this is the contract
`projectNativeAutoUse` must mirror exactly:

| # | Rule |
| --- | --- |
| 1 | Empty/absent slot list selects nothing. |
| 2 | Budget is `floor(pillsPerRound) - consumedPills`; `<= 0` selects nothing. |
| 3 | On the **first step only** (`(progressState.step ?? 0) === 0`) slots are re-sorted so reagents come first, stable within each group. |
| 4 | Iteration stops as soon as the budget is filled. |
| 5 | Slots whose item has no remaining inventory stacks (minus already-selected) are skipped. |
| 6 | Non-crafting items are skipped; **reagents are skipped unless it is the first step**. |
| 7 | `slot.maxCount > 0` is enforced against `progressState.pillTracking[name]` plus this turn's uses. |
| 8 | The slot's condition expression must evaluate `> 0`, evaluated with `selfEffectBuffName` bound to the item's buff name. |
| 9 | Items whose effects are already satisfied on the player are skipped. |
| 10 | Cumulative toxicity must stay within `availableToxicity` (`maxtoxicity - toxicity`); a slot that would exceed it is skipped, and iteration **continues** to later slots. |

`trainingMode` applies the item but does **not** remove it from the inventory,
so inventory-diff-based verification must not treat that as a mismatch.

Section 7 records what 0.7.6 added around this selector.

---

## 2. There is no Finish Craft technique — the craft auto-finishes

### 2.1 The only technique appended to every roster is `Wait`

```js
yQr={name:`Wait`,icon:vQr,poolCost:0,noQiCost:!0,stabilityCost:10,successChance:1,cooldown:0,
tooltip:`Let the crafting process advance. Has no other effects.`,effects:[],type:`support`,
realm:`mundane`,currentCooldown:0,masteryKindPools:[`stability`]}
```

**Re-verified in 0.7.6:** the definition is unchanged (`poolCost: 0`,
`noQiCost`, `stabilityCost: 10`, same tooltip), and the string `Finish Craft`
does not occur in either the 0.7.6 helper chunk or `Game.js`. The craft resolves
on its own once the terminal predicate holds; the player never confirms it.

### 2.2 `Wait` is not a free no-op

`Wait` costs **10 stability** and consumes a turn. It is *not* a safe stand-in
for "finish now".

**Consequences for CraftBuddy**

- `outcome.ts` is correct that there is no manual finish, and `willAutoFinish`
  is the right terminal predicate.
- Synthesising a `Finish Craft` action and mapping it to native `Wait` is wrong
  twice over: if the auto-finish predicate already holds the craft has *already*
  resolved and no dispatch is needed, and if it does not hold then dispatching
  `Wait` silently spends 10 stability. See section 11.

---

## 3. Spiritual Resonance — CraftBuddy already matches the runtime

### 3.1 Runtime implementation

```js
// harmony handler for Spiritual Resonance
r.buffs=r.buffs.filter(e=>e.name!==`Resonance`);
if(!e.resonance?.resonance){e.resonance={resonance:t.type,strength:1,pendingCount:0}}
else if(e.resonance.resonance===t.type){
  e.resonance.strength+=1;e.resonance.pendingResonance=void 0;e.resonance.pendingCount=0;
  n.harmony+=3*e.resonance.strength}
else{let i=e.resonance.pendingResonance===t.type;
  if(!(i&&e.resonance.pendingCount===1)){n.harmony-=9;n.stability-=3;
    e.resonance.strength=Math.max(0,e.resonance.strength-1)}
  if(i){e.resonance.pendingCount+=1;
    if(e.resonance.pendingCount>=2){e.resonance.resonance=t.type;
      e.resonance.pendingResonance=void 0;e.resonance.pendingCount=0}}
  else{e.resonance.pendingResonance=t.type;e.resonance.pendingCount=1}}
r.buffs=[{name:`Resonance`,icon:yO.icon,canStack:!0,stats:{
  critchance:{value:3,stat:void 0,scaling:`stacks`},
  successChanceBonus:{value:.03,stat:void 0,scaling:`stacks`}},
  effects:[],onFusion:[],onRefine:[],stacks:e.resonance.strength,displayLocation:`none`},...r.buffs];
e.resonance.resonance?e.recommendedTechniqueTypes=[e.resonance.resonance]:e.recommendedTechniqueTypes=[]
```

### 3.2 Verified formulas

| Quantity | Runtime | `src/optimizer/harmony.ts` |
| --- | --- | --- |
| Matching type | `harmony += 3 * strength` (after increment) | `harmonyDelta = 3 * res.strength` — match |
| Mismatching type | `harmony -= 9`, `stability -= 3`, `strength = max(0, strength - 1)` | `-9` / `-3` / same clamp — match |
| Penalty exemption | skipped when `pendingResonance === type && pendingCount === 1` | same predicate — match |
| Switch | on `pendingCount >= 2`; strength **keeps** its decremented value | same — match |
| Buff | `critchance 3`, `successChanceBonus 0.03`, both `scaling: 'stacks'`, `stacks = strength` | `strength * 3`, `strength * 0.03` — match |
| Recommended types | `[resonance]` or `[]` | same — match |

**The applied harmony penalty is `-9`, not `-15`.** The in-game log string still
reads "-15 harmony"; the value actually subtracted from `progressState.harmony`
is `9`. CraftBuddy is right and the log text is stale.

**Re-verified in 0.7.6:** the mismatch branch is still
`harmony-=9,n.stability-=3,e.resonance.strength=Math.max(0,...)`. Resonance was
not touched by the patch.

### 3.3 Bearing on `user-report-resonance-regression` — closed

The resonance model is byte-for-byte faithful to the runtime, so the benchmark's
`mustRankBefore` failure could **not** be explained by a wrong resonance
formula. The fixture snapshot also carries no `harmonyData` at all, so the
harmony block never ran for it either way. Nothing about the finding was
resonance-specific.

The cause was found elsewhere, and it was a real mechanics bug in both engines.
Expected progress was computed as `min(p * gain, headroom)`. In the runtime the
completion and perfection appliers are plain `r.completion += e` /
`r.perfection += e` statements inside the **success** branch, so the correct
expectation is `p * min(gain, headroom)`. Clamping before weighting let the
headroom cap swallow the failure risk of any technique whose raw gain overshot
the bar: on this fixture Explosive Fusion (65% success, raw gain above the 9,170
completion remaining) was credited the full 9,170 and became the top
recommendation past depth 6 — exactly the reported behaviour.

Fixed identically in `calculateSkillGains` and `effects.rs::calculate_skill_gains`;
11 of 585 corpus transitions shifted by one point and both engines still agree on
every transition. No scoring constant was tuned. That fix landed in 6.0.0, when
`bun run optimizer:bench` reported **98 of 98 contracts passing**; the current
benchmark shape is recorded in `ENGINE_PERFORMANCE.md`.

One contract change came with the fix. The runner-up ordering clause is now
materiality-aware: it always fails when the losing candidate is actually
recommended, and otherwise only when the score gap exceeds an explicit
tolerance. Search scores are not normalised across depths (~18k at depth 4
against ~44k at depth 5), so an ordering claim must be node-budget bound rather
than wall-clock bound — measured on this fixture, refine leads at depth 4,
inverts at 5, and leads again from 6.

---

## 4. Eccentric Decree moved to a per-bar-change hook (0.7.6)

This is the one real crafting mechanics change in the patch.

### 4.1 In 0.7.5, the whole state machine was `processEffect`

`processEffect` for Eccentric Decree (`ERa`, offset 7733349 in the 0.7.5 helper
chunk) ran **once**, after the action had resolved, and did everything: seed,
diff both bars, award harmony, flip focus:

```js
// verbatim 0.7.5
ERa=(e,t,n,r,i)=>{e.eccentricDecree=e.eccentricDecree||{focusedBar:`completion`,lastCompletion:n.completion,lastPerfection:n.perfection};
let a=e.eccentricDecree,o=i.recipeStats,s=nLa(i.recipe,o,r.realm).flat,c=rLa(i.recipe,o,r.realm).flat,
l=Math.min(s,Math.max(0,Math.floor(n.completion))),u=Math.min(c,Math.max(0,Math.floor(n.perfection))),
d=a.lastCompletion,f=a.lastPerfection,p=l-d,m=u-f,h=a.focusedBar===`completion`?p:m,g=a.focusedBar===`completion`?m:p,
_=a.focusedBar===`completion`?`perfection`:`completion`;
a.pulseKey=(a.pulseKey??0)+1,a.pulseBar=h>0?a.focusedBar:void 0,a.crackBar=g>0?_:void 0,
h>0&&(n.harmony+=5,i.craftingLog.push(...
```

One action, one harmony award. A turn that moved both bars twice could still only
score once.

### 4.2 In 0.7.6, `processEffect` only seeds and re-applies the stat modifier

`processEffect` is now `ORa` (offset 7742155) and has been reduced to two jobs:

```js
// verbatim 0.7.6
ORa=(e,t,n,r,i)=>{e.eccentricDecree=e.eccentricDecree||{focusedBar:`completion`,lastCompletion:n.completion,lastPerfection:n.perfection};
let a=e.eccentricDecree;ERa(a.focusedBar,r),e.recommendedTechniqueTypes=a.focusedBar===`completion`?[`fusion`]:[`refine`]}
```

`ERa` in 0.7.6 (offset 7740504) is no longer the state machine — it is just the
focused-bar stat modifier, re-applied as a single-stack hidden buff:

```js
// verbatim 0.7.6
ERa=(e,t)=>{t.buffs=[{name:TRa,icon:AO.icon,canStack:!1,
stats:e===`completion`?{intensity:{value:.5,stat:`intensity`}}:{control:{value:.5,stat:`control`}},
effects:[],onFusion:[],onRefine:[],stacks:1,displayLocation:`none`},...t.buffs.filter(e=>e.name!==TRa)]}
```

`+0.5` of the stat itself, i.e. the `1.5x` multiplier
`getEccentricDecreeStatModifiers` applies: intensity while completion is
focused, control while perfection is focused.

### 4.3 The scoring moved into a new `onBarChange` hook

The harmony registry gained an `onBarChange` slot, dispatched by `ths`
(offset 13336022):

```js
// verbatim 0.7.6
ths=(e,t,n,r)=>{let i=r.recipeStats?.harmonyType;!i||!t.harmonyTypeData||nU[i].onBarChange?.(e,t.harmonyTypeData,t,n,r)}
```

`ths(bar, progressState, playerState, ctx)` is called from **inside** the two bar
appliers — `applyPerfection` (`ihs`, offset 13337548, call at 13338049) and
`applyCompletion` (`ahs`, offset 13338496, call at 13338997). The call sits at
the **tail of the applier, outside the negative/positive branch**:

```js
// verbatim 0.7.6, applyPerfection
ihs=(e,t,n,r,i,a,o,s)=>{let c=0,l=!1;
if(e<0)r.perfection+=e,n.messages.push({...bindPoint:`perfection`...});
else{let o=YIa(t.critchance,t.critmultiplier,t.overcrit);e=Math.floor(e*o.multiplier),c=o.critCount,l=o.didCrit,
a.perfection+=e,r.perfection+=e,n.messages.push({...}),i.push(`perfection`)}
ths(`perfection`,r,n,s);let u=EH(r.perfection,o.perfection),...
```

So a **negative** application (a bar-draining effect) still fires the hook. It
awards nothing, because the hook only reacts to a bar that went *up*, but it does
re-anchor `lastCompletion` / `lastPerfection` — a drain is absorbed rather than
paid back later.

### 4.4 The hook body, verbatim

```js
// verbatim 0.7.6, offset 7740764
DRa=(e,t,n,r,i)=>{t.eccentricDecree=t.eccentricDecree||{focusedBar:`completion`,lastCompletion:n.completion,lastPerfection:n.perfection};
let a=t.eccentricDecree,o=i.recipeStats,s=rLa(i.recipe,o,r.realm).flat,c=iLa(i.recipe,o,r.realm).flat,
l=Math.min(s,Math.max(0,Math.floor(n.completion))),u=Math.min(c,Math.max(0,Math.floor(n.perfection))),
d=a.lastCompletion,f=a.lastPerfection,p=l-d,m=u-f,
h=a.focusedBar===`completion`?p:m,g=a.focusedBar===`completion`?m:p,
_=a.focusedBar===`completion`?`perfection`:`completion`,v=h>0,y=g>0;
(v||y)&&(a.lastVisualStep!==n.step&&(a.pulseBar=void 0,a.crackBar=void 0),a.pulseKey=(a.pulseKey??0)+1,
  v&&(a.pulseBar=a.focusedBar),y&&(a.crackBar=_),a.lastVisualStep=n.step),
v&&(n.harmony+=5,i.craftingLog.push(N(`Eccentric Decree: <info>{bar}</info> advanced. <gold>+5</gold> harmony`,{bar:N(wRa[a.focusedBar])}))),
y&&(n.harmony-=5,r.stats.pool-=5,i.craftingLog.push(N(`Eccentric Decree: strayed to <red>{bar}</red>. <red>-5</red> harmony, <red>-5</red> Qi Pool`,{bar:N(wRa[_])}))),
a.lastCompletion=l,a.lastPerfection=u;
let b=a.focusedBar===`completion`?o.completion:o.perfection,
x=a.focusedBar===`completion`?d:f,S=a.focusedBar===`completion`?l:u,C=EH(x,b).guaranteed;
EH(S,b).guaranteed>C&&(a.focusedBar=_,i.craftingLog.push(N(`Eccentric Decree: bar filled! Focus flips to <info>{bar}</info>`,{bar:N(wRa[a.focusedBar])}))),
ERa(a.focusedBar,r),t.recommendedTechniqueTypes=a.focusedBar===`completion`?[`fus...
```

Per event, in order:

| Step | Runtime |
| --- | --- |
| 1 | Seed `eccentricDecree` if absent, anchored on the **current** bars. |
| 2 | Clamp both bars: `min(flatCap, max(0, floor(value)))`, where the caps are the recipe's flat overcraft caps (`rLa(...).flat` / `iLa(...).flat`). |
| 3 | Diff both clamped bars against `lastCompletion` / `lastPerfection`. |
| 4 | Focused bar advanced (`> 0`) → `+5` harmony. |
| 5 | Other bar advanced (`> 0`) → `-5` harmony **and** `-5` Qi Pool (`r.stats.pool -= 5`). |
| 6 | Store the clamped values as the new anchors. |
| 7 | Flip focus if `getBonusAndChance(focusedValue, target).guaranteed` (`EH`) increased across **this event**, comparing the focused bar's pre- and post-event values against `recipeStats` — one band's width, not the cap. |
| 8 | Re-apply the focused-bar stat modifier and refresh `recommendedTechniqueTypes`. |

Two details worth stating explicitly:

- **`DRa` receives the bar name (`e`) and never reads it.** It derives focused
  and stray purely by diffing both clamped bars. Passing `'completion'` when the
  perfection bar moved would change nothing.
- **`pulseKey` / `pulseBar` / `crackBar` / `lastVisualStep` are presentation
  state only** — the bar-shake animation, now debounced per `step`. CraftBuddy
  does not model them and does not need to.

### 4.5 Lazy seeding anchors on the current bars, not zero

Both `ORa` and `DRa` seed with `lastCompletion: n.completion`, i.e. wherever the
craft stands right now. The game's own `initEffect` (`kRa`, offset 7742475) is
the only path that seeds at zero, and it runs at craft start:

```js
// verbatim 0.7.6
kRa=(e,t)=>{e.eccentricDecree={focusedBar:`completion`,lastCompletion:0,lastPerfection:0},ERa(`completion`,t),e.recommendedTechniqueTypes=[`fusion`]}
```

The consequence is deliberate on the game's side and important for CraftBuddy:
**attaching to a craft mid-flight cannot retro-charge harmony** for progress made
before the state machine existed. `seedEccentricDecreeData` in
`src/modContent/harmonyState.ts` mirrors the lazy form, so a synthesized snapshot
of an in-progress craft does not credit the first observed turn with every point
banked before CraftBuddy saw it.

### 4.6 What CraftBuddy does with it

`processEccentricDecree` in `src/optimizer/harmony.ts` folds over an ordered
`BarChangeEvent[]`, and the Rust engine mirrors it over `BarChange`. The
modelling limits of applying expected values to a per-application hook are
recorded plainly in `MECHANICS_PARITY.md`; they are not restated here.

---

## 5. Fallen Soulflame was nerfed in data, not code

Every Soulflame buff is a plain definition with `scaling: 'stacks'`. The 0.7.6
patch changed four numbers and nothing else:

| Buff | Effect | 0.7.5 | 0.7.6 |
| --- | --- | --: | --: |
| Soul of Fusion | `completion` x `intensity` per stack | `0.5` | `0.2` |
| Soul of Refinement | `perfection` x `control` per stack | `0.5` | `0.2` |
| Soul of Qi | `pool` per stack (`maxStacks: 3`) | `3` | `2` |
| Soul of Stability | `stability` per stack (`maxStacks: 3`) | `2` | `1` |

```js
// verbatim 0.7.5 / 0.7.6, Soul of Fusion
effects:[{kind:`completion`,amount:{value:.5,stat:`intensity`,scaling:`stacks`}}]
effects:[{kind:`completion`,amount:{value:.2,stat:`intensity`,scaling:`stacks`}}]
```

The **fragment threshold is unchanged**: the `Soul Fragment (V)` tooltip is
byte-identical in both builds — at `9` stacks the next action consumes `9`
fragments and `5` stability to summon the soul for that action type.

**No CraftBuddy change was required.** Both engines model Soulflame through the
generic definition-driven buff path with no hardcoded Soulflame constants, so the
new values flow through from the live buff definitions the game hands over.
`src/__tests__/runtimeParity.test.ts` pins the 0.7.6 numbers so a future silent
re-balance shows up as a test failure rather than as quietly wrong advice.

---

## 6. Harmony complexity multipliers are unchanged

All seven are identical across the two builds:

| Harmony | Complexity multiplier |
| --- | --: |
| forge | 1.2 |
| alchemical | 1.2 |
| inscription | 0.9 |
| resonance | 1.3 |
| formless | 1.5 |
| enhancingEcho | 1.3 |
| eccentricDecree | 1 |

The patch note "balanced a LOT of harmony effects" is **equipment-side**: the
changes are in `upgradeHarmonies` / `statTable`, which decide what the *crafted
item* ends up with. CraftBuddy optimises the reachable outcome tier during the
craft and does not model the finished item's stats, so none of it applies. This is
the same boundary as the unmodelled `harmonyAugment` item effects.

---

## 7. Auto-use: read path unchanged, loadout pairing added

Re-verified for 0.7.6:

- `player.player.currentCraftingAutoUseLoadout` and the `storedAutoUseLoadouts`
  reducers are structurally identical, and `currentCraftingAutoUseLoadout` occurs
  **8 times in both** builds — same read path, same shape.
- 0.7.6 adds `craftingLoadout.craftingAutoUseLoadoutId` (5 occurrences), which
  ties a crafting loadout to a paired auto-use loadout. The game resolves that
  pairing into `currentCraftingAutoUseLoadout` **before** CraftBuddy reads state,
  so `nativeAutoUse.ts` needs no change: it still reads the resolved current
  loadout.
- Auto-use slots gained a `(This Effect)` self-reference condition. CraftBuddy
  cannot evaluate the game's inline condition expressions at all, so this hits
  the pre-existing conservative default in `src/modContent/nativeAutoUse.ts` —
  a configured slot is assumed to fire. **Over-estimating native consumption is
  the safe direction**: it makes CraftBuddy withhold an item action rather than
  duplicate one the game is about to apply.

---

## 8. The False Fusion rename is display-only

```js
// verbatim, identical field in both 0.7.5 and 0.7.6
name:`False Fusion`,icon:...,displayName:`Strive for Completion`,poolCost:50,stabilityCost:10,...
```

The internal `name` is still `` `False Fusion` ``, and `displayName` already
existed in 0.7.5 — 0.7.6 only made the game surface it. Internal keys such as
`false_fusion` therefore remain correct and must **not** be renamed. Only
user-facing labels change, and every CraftBuddy surface resolves them through
`techniqueDisplayName()` in `src/optimizer/skills.ts`, which falls back to `name`
when `displayName` is absent.

---

## 9. Crafting toxicity cleansing never critted

The patch note "removed the ability for toxicity cleansing effects to critically
strike" is **combat-only**. The crafting applier (`hms` in 0.7.5, `shs` in
0.7.6) is unchanged apart from renamed minified helpers, and neither version ever
multiplied the cleanse amount by a crit factor:

```js
// verbatim 0.7.5
hms=(e,t,n,r)=>{e<0?(t.stats.toxicity-=e,t.stats.toxicity>n&&(t.stats.toxicity=n),t.messages.push({id:c3(),...
// verbatim 0.7.6
shs=(e,t,n,r)=>{e<0?(t.stats.toxicity-=e,t.stats.toxicity>n&&(t.stats.toxicity=n),t.messages.push({id:x3(),...
```

Both CraftBuddy engines likewise apply `toxicityCleanse` without a crit factor,
so there was nothing to change and nothing to fix.

---

## 10. Available but not adopted

Recorded so the next agent does not rediscover them as if they were new.

0.7.6 ModAPI surfaces that exist and are **not** used by CraftBuddy:

- `gameData.buffs` — a registry of buff definitions. CraftBuddy hydrates buff
  definitions from the live craft payload instead, which is authoritative for the
  craft in progress.
- `getCoreFormationAltarStats`.
- Buff-interceptor stat filters.

Adopting any of them is a deliberate future decision, not an oversight.

Out of scope entirely, as non-crafting systems: the research queue, market
favourites, the Unstable Rift, the herb garden, and the combat nerfs (Seal
Meridian, Disrupt Dantian, Expose Meridian, and the Pill Replication condition).

`hasItemTypeToHarmonyType` is still `false` in `runtime:oracle` output — the
utility removed in 0.7.5 has not returned, and harmony remains player-selected.

---

## 11. What was done about each finding

Recorded here so the evidence and its resolution stay together.

| Finding | Resolution |
| --- | --- |
| Auto-use is a pre-technique hook (1.1) | `src/modContent/nativeAutoUse.ts` reads the loadout and projects what it will consume; the policy layer withholds covered items and downgrades `fullActionSpace`, so the two systems never contend for the same pill. |
| The two execution paths differ (1.1) | Resolved deliberately: **with** a loadout active a technique is executed through the in-game control so the hook runs, and automation stops (`NativeAutoUseUnreachableError`) rather than dispatching in a way that skips it. **Without** a loadout the direct dispatch stays preferred — equivalent for the craft, and far more precise than DOM matching. |
| The 10-rule slot selector (1.2) | Mirrored by `projectNativeAutoUse`, including the step-0 reagent sort, the `floor(pillsPerRound) - consumedPills` budget, `maxCount` against `pillTracking`, and the cumulative toxicity ceiling that skips a slot but keeps iterating. Slot condition expressions cannot be evaluated without the game's condition engine, so a slot is assumed *satisfiable* — the safe direction. |
| `trainingMode` applies without removing (1.2) | Inventory-based verification treats it as expected, not as a stale mismatch. |
| There is no manual finish (2) | Auto mode no longer synthesises a finish once `willAutoFinish` holds, and all player-facing copy says "will auto-finish". |
| `Wait` costs 10 stability (2.2) | Treated as a normal technique everywhere; it is never used as a stand-in for "finish now". |
| Resonance matches the runtime (3) | No model change. The benchmark contract carries the open question instead. |
| Eccentric Decree scores per bar application (4) | `processEccentricDecree` folds over `BarChangeEvent[]` in `src/optimizer/harmony.ts`, mirrored over `BarChange` in the Rust engine; the event list is only built for Eccentric Decree crafts. Known second-order gaps are stated in `MECHANICS_PARITY.md`. |
| Lazy seeding anchors on current bars (4.5) | `seedEccentricDecreeData` mirrors it, so attaching mid-craft cannot retro-charge harmony. |
| Soulflame values are data (5) | No code change; the definition-driven buff path carries them. New values pinned in `runtimeParity.test.ts`. |
| Complexity multipliers unchanged (6) | No change. The equipment-side harmony rebalance is outside CraftBuddy's model. |
| Auto-use loadout pairing (7) | No change: the game resolves the pairing before CraftBuddy reads state. The `(This Effect)` condition falls to the conservative "will fire" default. |
| False Fusion rename (8) | Display-only; labels resolve through `techniqueDisplayName()` while internal keys keep using `name`. |
| Cleanse never critted in crafting (9) | No change in either engine. |
| Overcraft extras are unilateral (12) | `src/optimizer/search.ts` scores extra perfection and extra completion bands as two independent post-tier terms, mirrored in the Rust engine; the conjunctive tier gate itself is untouched. Terminal scoring prices each bar's craft-end bonus-roll chance as expected value (the Rust engine enumerates the roll branches to the same effect); live horizon leaves bank guaranteed bands only. Extras are bounded by the finish flat's band count, since the runtime clamps bars there (section 2). |

---

## 12. Overcraft reward scaling (verified for the overcraft scoring fix)

Verified 2026-07-28 against `0.7.6-7c586da`. Motivation: the optimizer credited
extra bands *conjunctively* (`min(extraCompletion, extraPerfection)`), so after
the 2-band sublime gate every further perfection action was score-neutral and
recommendations plateaued at ~2 bands even when the game pays for more. The
game pays **unilaterally**, per bar, as shown below.

### 12.1 Stacks scaling: +20% per extra perfection band, per bar independently

`ZIa` (helper chunk) is the stacks scaler; `XIa` is the per-band bonus:

```js
// verbatim, helper chunk
JIa=1.3,
EH=(e,t)=>{let n=t,r=e,i=0;for(;r>0&&n>0&&r>=n;)r-=n,i++,n=Math.floor(n*JIa);let a=r/n,o=e+(n-r);
  return{guaranteed:i,bonusChance:a,nextThreshold:o}},
XIa=.2,
ZIa=(e,t,n)=>Math.floor(e*(1+(t-n)*XIa))
```

`EH` is `getBonusAndChance` (unchanged, section header of `outcome.ts`). `ZIa`
takes `(baseStacks, bandCount, baseline)` and pays `+0.2` of base stacks per
band **above the baseline**. The craft-result code in `Game.js` calls it with
baseline 2 for sublime and baseline 1 for perfect (`pc` is the `Game.js` alias
of `ZIa`):

```js
// verbatim, Game.js craft-result effect
if(r===`stacks`)n.stacks=pc(n.stacks,o,2);            // sublime: o = perfectionSuccess
...
n===`stacks`?t.stacks=pc(t.stacks,o,1):               // perfect
```

So perfection band count scales the result **regardless of how many completion
bands were banked** (beyond what the tier gate needs). Decoded:

| Result | Formula |
| --- | --- |
| sublime, `stacks` kind | `floor(baseStacks * (1 + (perfectionSuccess - 2) * 0.2))` |
| perfect, `stacks` kind | `floor(baseStacks * (1 + (perfectionSuccess - 1) * 0.2))` |

### 12.2 Quality path: sublime grants a harmony augment of `perf - 2`

```js
// verbatim, Game.js sublime branch (r === `quality`)
let t=o-2;n.hiddenPotential=f>0?f:void 0,t>0&&(n.harmonyAugment={type:e.recipeStats.harmonyType,quality:t})
```

In 0.7.6 the sublime quality reward is a `harmonyAugment` of
`quality = perfectionSuccess - 2` (granted only when positive). This differs
from the `CraftingCode` snapshot, which assigned `qualityTier = perf - 2`
directly; the installed runtime wins. The perfect branch sets only
`hiddenPotential` — no quality or augment — so extra perfection bands pay
quality **only on the sublime result**.

The result-tier gate itself is unchanged and still conjunctive:

```js
// verbatim, Game.js
BFe=(e,t,n)=>e===0?`failed`:e>1&&t>1&&n.isSublimeCraft?`sublime`:t>0?`perfect`:`basic`
```

### 12.3 Completion extras: material refund, 20% per band, capped at 80%

```js
// verbatim, Game.js craft-result effect
if(e.recipe.isSublimeCraft&&a>1){let t=Math.max(0,Math.min((a-1)*20,80)),
n=e.recipe.ingredients.reduce((e,t)=>e+t.quantity,0),r=Math.floor(n*t/100),...
```

Extra **completion** bands refund materials on sublime-capable crafts:
`(completionSuccess - 1) * 20` percent of the total ingredient count, clamped
to `[0, 80]`, dispensed as randomly chosen single stacks. This also scales
unilaterally — it does not depend on the perfection band count.

### 12.4 `canOvercraft` and the stated intent (tooltips)

`canOvercraft` is set at craft start to `isSublimeCraft && perfectionEffect !== 'none'`:

```js
// verbatim, Game.js craft-start dispatch
recipe:{...D,sublimeItem:n?D?.sublimeItem:void 0,isSublimeCraft:n,canOvercraft:n&&ce!==`none`}
```

The in-game tooltips state the intended bonuses verbatim:

> For each 100% you go over the completion maximum, you will gain an additional
> 10% Qi Control bonus and a chance to reclaim up to 20% of the materials used
> (max 80%). Current reclaim percentage is {reclaimPercentage}%.

> For each 100% you go over the perfection maximum, you will gain 20% more
> stacks of the final items. Current bonus items is {bonusPercentage}%.

> For each 100% you go over the perfection maximum, the crafted item will be 1
> quality tier higher. The maximum quality tier based on your realm is
> {maxQualityTier}. Current quality tier is {currentQualityTier}.

with

```js
// verbatim, Game.js tooltip block
let e=Math.max(0,Math.floor((Ye.guaranteed-1)*20));        // bonusPercentage (stacks)
let r=3+W.indexOf(t.realm)+(W.indexOf(e.recipe.realm)-3),  // maxQualityTier (realm-capped)
i=Math.max(0,Math.floor(Ye.guaranteed-2));                 // currentQualityTier
let r=Math.max(0,Math.min((Je.guaranteed-1)*20,80));       // reclaimPercentage
```

The "10% Qi Control bonus" application site was **not** located in this pass
(no `qiControl` symbol anywhere in either chunk); the refund and stacks/quality
scaling above are the mechanically verified rewards, and are what the scoring
weights derive from. `maxQualityTier = 3 + realmIndex(player.realm) +
(realmIndex(recipe.realm) - 3)` caps how far quality can scale, so perfection
extras have diminishing value past that cap on quality-kind recipes.

### 12.5 Auto-finish predicate for overcraft crafts (re-verified)

The craft-complete flag in the 0.7.6 `Game.js`:

```js
// verbatim, Game.js
Be=e=>e.guaranteed>=5,
Ve=e.recipe&&e.recipeStats?Qt(e.recipe,e.recipeStats,t.realm).flat:0,   // getMaxCompletion
z=e.recipe&&e.recipeStats?ld(e.recipe,e.recipeStats,t.realm).flat:0,    // getMaxPerfection
He=e.recipe&&e.recipeStats&&e.progressState?Bl(e.progressState.completion,e.recipeStats.completion):void 0,
Ue=(e.progressState?.stability??0)<=0||e.recipe&&e.recipeStats&&e.progressState&&
  (e.progressState.completion>=Ve&&e.progressState.perfection>=z
   ||e.recipe.canOvercraft&&He!==void 0&&Be(He)&&e.progressState.perfection>=z)
```

Decoded: finish when stability runs out, or both bars reach their caps, or —
for `canOvercraft` recipes — completion holds **5 guaranteed bands** and
perfection reaches its cap. `src/optimizer/outcome.ts::willAutoFinish` already
mirrors all three branches, including the 5-band overcraft branch; no change
was needed there.

## 13. Blob-URL search workers (Phase 2.4 capability verification)

Verified 2026-07-29. Motivation: the worker-pool backend
(`src/modContent/searchBackendClient.ts`) instantiates the search bundle from
a Blob URL (`new Worker(URL.createObjectURL(new Blob([bundle])))`), which is
a capability some embedded-browser runtimes block. The mod must detect that
and fall back to the synchronous engine.

Environment facts that shaped the design:

- The production bundle is served from the `mod://` publicPath and the mod
  runs as an inline script on a `file://` page, so URL-loaded worker chunks
  (`new Worker('mod://...')`) cannot resolve. The worker bundle is therefore
  inlined into `mod.js` as a string (webpack second compilation +
  `asset/source`) and instantiated from a Blob URL — no URL resolution, no
  extra files in the zip.
- No system Chromium is available on the development machine, so the game's
  embedded browser cannot be probed headlessly from a script. The executable
  proxy is Bun 1.3.14, whose `Worker` supports blob-URL scripts: the echo
  smoke test (`new Worker(blobUrl)` + postMessage round-trip) passes, and
  `bun scripts/bench-worker-pool.ts` drives the real worker entry through
  full partitioned searches (see OPTIMIZER_ENGINE_FINDINGS "Worker pool").

The authoritative in-game check is the client's **once-per-session smoke
probe**: on the first search dispatch the client spawns one worker, round-
trips a probe message with a 1500 ms timeout, and terminates it. The outcome
is recorded in `integrationDiagnostics` (`searchBackendProbe`:
`passed`/`failed`, plus `searchBackendProbeDetail`,
`searchBackendWorkerResultCount`, `searchBackendSyncFallbackCount`) and
surfaced in the debug log, so a failing runtime is diagnosable from a support
snapshot. On probe failure (or any worker error mid-search) the caller runs
the synchronous `findBestSkill` path unchanged, so behavior on a runtime that
blocks blob workers is byte-identical to the pre-pool mod.

## 14. Stateful buffs, the Illume Crucible seal, and discordant conditions (0.7.7/0.7.8)

Verified 2026-08-09 against the installed 0.7.8 build, extracted to
`tmp/installed-game-runtime/1168651333-1786309913280/`; all crafting mechanics
below live in `dist-electron/_rolldown_dynamic_import_helper.js`. Symbol names
are from this extraction and will not survive a rebuild.

### 14.1 Buff `internalState`, `triggeredEffects`, and `setState`

0.7.7 buffs carry a per-instance key→number map. The definition's
`initialState` eqns seed it at creation, the buff's own eqns read it, and
`setState` effects write it (`set` / `add`); effects later in the same block
observe earlier writes. Triggered blocks fire on six crafting triggers —
`completionGained`, `perfectionGained`, `poolSpent`, `poolRestored`,
`stabilitySpent`, `stabilityRestored` — with `amount` in scope, plus
`percentGained` for the two bar triggers.

`percentGained` is the tier-scaled delta, not the raw bar delta (runtime
`O7o`, over the shared threshold helper `ox`):

```js
// O7o(amount, barAfter, target): r = ox(barAfter - amount, target),
// i = ox(barAfter, target); percentGained =
//   (i.guaranteed + i.bonusChance - (r.guaranteed + r.bonusChance)) * 100
```

`ox` is the same 1.3×-inflated threshold-tier helper the outcome bands use,
so crossing into the 130-wide second tier dilutes the percentage per point.

### 14.2 True Bifang Flame

Definition (`gmi`): `initialState: { blaze: '0' }`, a `completionGained`
trigger running `blaze = max(blaze, floor(percentGained))`, and a control
stat scaling `+0.03` per blaze. Tier V adds an `onFusion` block granting
`+0.02` perfection per blaze; tier VI grants it on every action. Only the
**largest single application** is kept — there is no accumulation.

### 14.3 Flame of the Azure Depths

Definition (`Jpi`): `initialState: { stored: '0', charge: '0' }`, a
`poolSpent` trigger that charges `amount` into `charge`, grants
`stored += floor(charge * 100 / maxpool)` (one stored Qi per 1% of max pool
spent; the `1` in `Hpi(1)` is the divisor), and keeps the remainder in
`charge`. A per-turn effect decays `stored = max(0, stored - 1)` every
action, gated by the temper condition while stability < 50%. Tier VI adds a
`poolRestored` backdraft (`Hpi(3)`). Stats grant `+0.01` control and
intensity per stored.

### 14.4 Illume Crucible `sealedMaxStability`

The seal is two runtime checks (`E7o` = any active buff has
`sealedMaxStability`, `D7o` = the restoration block):

```js
// decay:  (!i.noMaxStabilityLoss || E7o(e)) && t.stabilityPenalty++
// restore: dropped entirely while E7o(e) holds
```

So max stability falls by 1 every action even when the technique prevents
decay, and no max-stability restoration (full restore, positive
`maxStabilityChange`, technique or buff deltas) applies while the seal is
held. Reductions still apply. The definition's tooltip matches: "Maximum
Stability always falls by 1 every action and cannot be restored."

### 14.5 `discordantConditions` (Uncontrollable Flames / Flame of Discordance)

The buff carries `discordantConditions: 0.7`. The gate sits at the
**stay-neutral decision** of `getNextCondition` only:

```js
if (Math.random() >= d) return 'neutral';
```

A would-be neutral outcome therefore holds only `1 - d` of the time; the
rest falls through to the harmony roll. The positive/negative early-return
branches (upgrade/degrade decisions) are not gated. As a probability
distribution over the stay-neutral block that is
`effectiveChange = change + (1 - change) * d`.

### 14.6 Eccentric Decree rebalance (0.7.8)

The stray-bar penalty moved from `-5` harmony / `-5` Qi Pool to
**`-15` / `-15`**; the focused bar still awards `+5`. This supersedes the
0.7.7 patch note's "3x worse" phrasing — the 0.7.8 note ("5 to 15 for both
Harmony and Qi Pool") and the runtime agree.

### 14.7 Verified unchanged in 0.7.7/0.7.8

- Turbid Qi: first stack at step 100, then every 3 steps, granted after the
  step bump. ("Crafting Actions" in the tooltip is a UI label, not a second
  counter.)
- All seven harmony complexity multipliers (forge 1.2, alchemical 1.2,
  inscription 0.9, resonance 1.3, formless 1.5, echo 1.3, decree 1.0) and
  Formless Way's starting harmony of 33.
- Reagent toxicity gating.

<!-- prettier-ignore-end -->
