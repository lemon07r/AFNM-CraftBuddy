---
title: Runtime Evidence
status: active
authoritative: true
owner: craftbuddy-maintainers
game_version: 0.7.18-97c093b
last_verified: 2026-10-31
source_of_truth: installed AFNM 0.7.18 runtime bundle; earlier sections identify their historical builds and coverage
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

Findings extracted from the **installed** AFNM runtime, most recently
**0.7.18-97c093b** (section 18). Earlier sections retain their historical build
citations. The runtime is the sole authority here: where a tooltip, a
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

**Historical 0.7.10 coordinates:** the earlier `runtime:oracle` run reported
`gameVersion: 0.7.10-9bf9078`, extracted to
`tmp/installed-game-runtime/1182767661-1788139699386/`. The 0.7.6 findings below
were produced by diffing the 0.7.6 build (`1172405719-1785155522026/`) against
`0.7.5-d764178` (`1170135731-1784964316349/`); the 0.7.7/0.7.8 findings
(section 14) were verified against the 0.7.8 build (`1168651333-1786309913280/`),
the 0.7.9 findings (section 15) diff that 0.7.8 build against the 0.7.9 build
(`1172235715-1787523522327/`), and the 0.7.10 findings (section 16) diff that
0.7.9 build against that historical 0.7.10 extraction.

For those historical builds, the two crafting-relevant chunks were `dist-electron/Game.js` (~4.5 MB) and
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
| False Fusion rename (8) | Display-only; labels resolve through `techniqueDisplayName()` while internal keys keep using `name`. Since 6.4.0 the auto-craft DOM fallback (`buildSearchAliases` in `src/modContent/autoCraftExecutor.ts`) indexes both spellings, because the in-game button carries the display name. |
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

Historical evidence only: the five-band shortcut below is absent in installed
0.7.18. Section 18 is the current auto-finish authority; section 17.7 also
records the flat-cap rule for 0.7.17. Preserve this section as versioned evidence.

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

## 15. The 0.7.9 crafting changes (Insight rework, Purifying Flame, Forge Compression)

Verified 2026-08-23 by diffing the 0.7.8 build (`1168651333-1786309913280/`)
against the first installed 0.7.9 build, `0.7.9-de5da56`
(`1172083670-1787487937177/`), both from
`dist-electron/_rolldown_dynamic_import_helper.js`. Re-verified 2026-08-24
against the current `0.7.9-b8ef246` hotfix build
(`1172235715-1787523522327/`), where every payload and formula below is
unchanged. Minified identifiers differ between builds; the values below are the
0.7.9 payloads.

### 15.1 Technique data is read live, so renames/overhauls auto-adopt

CraftBuddy never hardcodes a technique roster: `convertGameTechniques` consumes
`entity.techniques` (resolved through `craftingTechniqueFromKnown` when
available) each craft. 0.7.9 kept every technique's public shape
(`name/icon/poolCost/stabilityCost/successChance/cooldown/effects/type/realm/upgradeMasteries`),
so the overhauled Insight techniques, the two new ones, and the Forge
Compression rework are picked up without a code change. 121 technique payloads
differ between builds, but almost all of that is minified-helper renames plus
new `upgradeMasteries` entries; the optimizer already reads both live.

### 15.2 Insight package buffed

The `Insight` buff's per-stack control rose from `.1` to `.15`:

```js
// 0.7.8
stats:{control:{value:.1,stat:`control`,scaling:`stacks`},poolCostPercentage:{value:140,stat:void 0}}
// 0.7.9
stats:{control:{value:.15,stat:`control`,scaling:`stacks`},poolCostPercentage:{value:140,stat:void 0}}
```

Two new techniques join the package (definitions are read live):

```js
// Perfected Understanding — coreFormation support, 25 pool / 5 stability, cd 5
effects:[{kind:`createBuff`,buff:Insight,stacks:{value:1,stat:void 0,eqn:`floor(perfectionPercentage / 100) * 2`}}]
// Sustained Revelation — lifeFlourishing support, 25 pool / 5 stability, cd 8, requires 5 Insight
effects:[{kind:`createBuff`,buff:SustainedRevelation,stacks:{value:5,stat:void 0}}]
// Sustained Revelation buff (maxStacks 5): on refine, +.08 perfection per Insight stack, then -1 stack
onRefine:[{kind:`perfection`,amount:{value:.08,stat:`control`,scaling:Insight.name,upgradeKey:`perfection`}},{kind:`addStack`,stacks:{value:-1,stat:void 0}}]
```

`Insightful Refinement` was **removed** from the game (the "removed crafting
actions" fix filters it from the roster). The remaining Insight techniques
(`Insightful Finale`, `Insightful Restoration`, `Seek Insight`) are unchanged in
mechanics — `Seek Insight` costs 16 pool (was 20) and grants `.9` perfection
(was `.7`); the others only changed mastery-builder helper names.

### 15.3 Purifying Flame reworked: hidden potential → quality cap

0.7.8 granted `bonusHiddenPotential:{value:F.indexOf(e)-3}` per realm. 0.7.9
replaces that with a per-realm `Purity` buff carrying `bonusMaximumQuality`
(raises the quality cap) and `bonusQuality` (bonus stars on a max-tier finish):

```js
// 0.7.9 — Wmi is the per-realm Purity buff map, P is the realm order array
P=[`mundane`,`bodyForging`,`meridianOpening`,`qiCondensation`,`coreFormation`,`pillarCreation`,`lifeFlourishing`,`worldShaping`,`innerGenesis`,`soulAscension`]
Wmi=P.map(e=>{let t=P.indexOf(e)>=P.indexOf(`pillarCreation`),n=P.indexOf(e)>=P.indexOf(`lifeFlourishing`);
  return{name:`Purity (${F[e]})`,canStack:!1,stats:void 0,effects:[],stacks:1,displayLocation:`none`,
    bonusMaximumQuality:{value:t?2:1,stat:void 0},
    bonusQuality:n?{value:1,stat:void 0}:void 0,realm:e}})
```

So `bonusMaximumQuality` is **2** for realms ≥ pillarCreation else **1**, and
`bonusQuality` is **1** for realms ≥ lifeFlourishing else absent. The base
flame's stats are unchanged (`{pool:0,control:-.3,intensity:-.55}, maxpool:-60`).

**Cap wiring.** The game computes the cap once per craft and threads the bonus
through `getMaxCompletion`/`getMaxPerfection` as a new optional `maxStepsBoost`
argument. Its `getMaxStepsBoost(entity.buffs)` sums each buff's floored
`bonusMaximumQuality`, evaluating each with `eqn` stripped and `stacks` **pinned
to 1** — a `stacks`-scaled bonus is therefore *not* multiplied by the held stack
count. Each extra step stretches the bar by one more 1.3x-scaled threshold:

```js
// runtime getMaxStepsBoost equivalent
jvi=e=>{let t=0;for(let n of e.buffs??[])if(n.bonusMaximumQuality){let r=Hl({...n.bonusMaximumQuality,eqn:void 0},{...e.stats,stacks:1},1);t+=Math.floor(r)}return t}
```

CraftBuddy mirrors this in `computeMaxStepsBoost`
(`src/modContent/qualityCap.ts`) and passes it as
the 4th argument to `getMaxCompletion`/`getMaxPerfection`, so the optimizer sees
the raised cap directly. `bonusQuality` only adds stars to the finished item on
a max-tier finish — it is not an in-progress bar, so the optimizer does not
simulate it.

### 15.4 Forge Compression reworked

0.7.8 granted 8 stacks of a buff that added `.3` completion per Pressure stack
then drained one. 0.7.9 replaces it with a 5-stack buff driven by a
`stackGained.Pressure` trigger and new `pressureStacks`/`completion` masteries:

```js
// 0.7.9 Forge Compression technique (lifeFlourishing support, 50 pool / 8 stability, cd 10)
effects:[{kind:`createBuff`,buff:SKr,stacks:{value:5,stat:void 0,upgradeKey:`stacks`}}]
upgradeMasteries:{stacks:gd(`stacks`,`resplendent`,`Forge Compression`,2),
  pressureStacks:ld(`pressureStacks`,`incandescent`,...),
  completion:pd(`completion`,`empowered`)}
// buff: on any action lose a stack; on Pressure gain, +1 Pressure and +.3 completion
triggeredEffects:[{trigger:`stackGained.${Pressure.name}`,effects:[
  {kind:`createBuff`,buff:Pressure,stacks:{value:1,stat:void 0,upgradeKey:`pressureStacks`}},
  {kind:`completion`,amount:{value:.3,stat:`intensity`,upgradeKey:`completion`}}]}]
```

The `stackGained.<buff>` dynamic trigger family is new in 0.7.9
(`stackGainedTrigger`/`stackLostTrigger` helpers); the optimizer's
triggered-effect dispatch already handles string triggers.

### 15.5 New cauldrons

Two new cauldrons appear in 0.7.9: **Discernment Cauldron** and **Hundredfold
Lens Cauldron**. Cauldrons are not modeled by the optimizer (they are equipment
the game applies before the craft starts), so no code change is needed.

### 15.6 Verified unchanged in 0.7.9

- `getMaxCompletion`/`getMaxPerfection` still return `{flat, percentage}`; the
  only signature change is the optional 4th `maxStepsBoost` argument.
- The seven harmony complexity multipliers and the conjunctive outcome-tier
  gates are unchanged; `src/optimizer/outcome.ts` remains the band authority.
- Buff `internalState`, `sealedMaxStability`, and `discordantConditions` are
  unchanged.

## 16. The 0.7.10 crafting change: Completion Bonus becomes a Perfection Boost stat

Verified 2026-09-01 by diffing the 0.7.9 build (`1172235715-1787523522327/`)
against `0.7.10-9bf9078` (`1182767661-1788139699386/`), both from
`dist-electron/_rolldown_dynamic_import_helper.js` plus the ModAPI export table
in `dist-electron/Game.js`. Minified identifiers below are the 0.7.10 build's.

### 16.1 Four new crafting boost stats

0.7.10 adds four stats to the crafting stat registry, alongside
`poolCostPercentage` & friends, with display names and a default of `0` on the
crafted-entity payload:

```js
`poolCostFlat`,`completionBoost`,`perfectionBoost`,`stabilityBoost`,`qiBoost`
completionBoost:`Completion Boost`,perfectionBoost:`Perfection Boost`,stabilityBoost:`Stability Boost`,qiBoost:`Qi Boost`
{...poolCostFlat:0,completionBoost:0,perfectionBoost:0,stabilityBoost:0,qiBoost:0,buffs:[],...}
```

All four are registered in the percentage-stat set. Tooltip copy: Completion /
Perfection Boost "increase(s) [the] gains percentage", Stability Boost
"increases stability restoration by a percentage", Qi Boost "increases qi pool
[restoration]".

### 16.2 The Completion Bonus buff now grants `perfectionBoost`, not control

The high-completion bonus is still a synthetic buff named `gos` = `"Completion
Bonus"`, still re-created after every action with `stacks` =
`getBonusAndChance(completion).guaranteed - 1`. Only its payload changed:

```js
// 0.7.9 (Rns/gos site)
...,stacks:...guaranteed-1,icon:e.image,effects:[],animations:[],canStack:!0,onFusion:[],
onRefine:[],displayLocation:`none`,stats:{control:{value:.1,stat:`control`,scaling:`stacks`}}},...e.buffs])...
// 0.7.10
let f=Nb(t.completion,n.recipeStats.completion);e.buffs=e.buffs.filter(e=>e.name!==gos),
f.guaranteed>1&&(e.buffs=[{name:gos,stacks:f.guaranteed-1,icon:e.image,effects:[],animations:[],
canStack:!0,onFusion:[],onRefine:[],displayLocation:`none`,
stats:{perfectionBoost:{value:10,stat:void 0,scaling:`stacks`}}},...e.buffs]),...
```

So each completion band past the first grants **+10 Perfection Boost** instead
of the old +.1 control multiplier fraction per stack.

### 16.3 Where the boosts apply: the four bar/stat appliers

Each bar/stat application helper reads its boost once and folds it into the
gain *after* the expected-crit multiplier, with each step floored, and only on
**positive** amounts — a loss goes through untouched:

```js
Yas=(e,t,n,r,...)=>{let u=t.perfectionBoost??0;if(e<0){r.perfection+=e;...}
  else{let o=xyi(t.critchance,t.critmultiplier,t.overcrit);
       e=Math.floor(e*o.multiplier),u&&(e=Math.floor(e*(1+u/100)));...}}
```

`Xas` (completion) reads `t.completionBoost`, `Gas` (stability) reads
`t.stabilityBoost` on its restoration branch, and `Zas` (pool) reads
`r.qiBoost` on restores, identically. Nothing else accepts these boosts: cost
paths, max-stability changes, and harmony scoring are untouched by them.

### 16.4 ModAPI surface unchanged

The ModAPI export table in `Game.js` still maps
`completionBonusBuffName: Ope` (an alias into the helper chunk), and
`afnm-types` 0.7.10 still declares it as `completionBonusBuffName: string`
under `utils`. CraftBuddy's extraction accepts both the new
`perfectionBoost`-of-10-scaled-by-stacks signature and the legacy control one,
so the stack count survives across a mixed-install window; the measured stacks
then come from `getBonusAndChance(completion).guaranteed - 1` either way.

### 16.5 Verified unchanged in 0.7.10

- Craft termination is still `stability <= 0` or both bars reaching the
  (possibly boosted) flats — `Lyi`,`Fyi`,`Iyi`,`jyi` match the 0.7.9 shape.
- `getMaxCompletion`/`getMaxPerfection` retain the 0.7.9 optional 4th
  `maxStepsBoost` argument; the Purifying Flame `Purity` payload is unchanged.
- The seven harmony complexity multipliers, conjunctive outcome tiers, buff
  `internalState`/`triggeredEffects`, `sealedMaxStability`, and
  `discordantConditions` are unchanged.
- `hasItemTypeToHarmonyType` remains `false` in the runtime oracle.

## 17. AFNM 0.7.17 retarget audit (CraftBuddy 6.7.0; phase 1 only)

Verified 2026-10-22 against **0.7.17-d8ae6ce**, compared where noted with
**0.7.12-ad43f78**. These findings describe the game and statically inspected
CraftBuddy gaps; they do **not** claim that CraftBuddy has been retargeted or
that a live UI test passed. No implementation, dependency, build, or release
changes were authorized in this phase.

**Implementation follow-up (6.8.0):** the gaps described below were the
pre-retarget 6.7.0 implementation, not outstanding work. Phase 2 implemented
the cost/droplet/mastery/trigger/scaling and buff-name timing corrections in
both engines, then Returning Cycle, hydration/replay and the native bridge.
The regenerated v4 corpus has 177 scenarios / 1,554 cases (1,352 legal
transitions, 202 illegal-action checks). `MECHANICS_PARITY.md` records the
current model and its deliberate approximations; `ENGINE_PERFORMANCE.md`
records the measured ~0.58 vs pre-retarget HEAD ~0.41 ms/node phase/cost
overhead and the approved 6,000-node heat-one benchmark contract. The
resonance safety prohibition remains; only its non-recommended runner-up
ordering clause was removed after the new-name tick rule below explained
the inversion and restoring old ticking reproduced HEAD scores. No scoring
constants changed. This follow-up is simulator/build evidence, not a live
game UI smoke-test claim.

The review follow-up preserves the complete worker state (including droplets,
independent cost channels, Returning Cycle and native variables), supplies live
additive item effectiveness, gates compatibility flooring on an actual legacy
stat, and advances Rust's running bars during recursive trigger dispatch.
Five new scenarios cover fractional costs, combined Jade+Bifang and Calming Mind
at three effectiveness values; none of the existing 172 scenarios changes its
recorded outcome, excluding the added item-effectiveness scalar checks.

### 17.1 Provenance and reproducible evidence coordinates

The repository's `runtime:oracle` and `runtime:extract` commands both succeeded.
To respect this audit's scratch-only extraction requirement, they were run with
`NODE_OPTIONS="--require=$HOME/.local/tmp/afnm/craftbuddy/runtime-cache.cjs"`.
That scratch preload redirects only the extractor's cache path. The installed
game resolves to `$HOME/.local/share/Steam/steamapps/common/Ascend From Nine Mountains`.

Current extract: `$HOME/.local/tmp/afnm/craftbuddy/runtime/2904927473-1792546170769`.
`G:L` references below mean line L of
`$HOME/.local/tmp/afnm/craftbuddy/Game.pretty.js`, a Prettier navigation copy of
that extract's `dist-electron/Game.js`. Formulas below are explanations, not
verbatim minified snippets. Useful zero-based **byte** anchors in the original
current `Game.js` are:

| Subject | Byte anchor | Search text |
| --- | ---: | --- |
| Cost multiplier | 8298295 | `pmo=(e=0,t=0)` |
| Returning Cycle | 8317926 | ``Iho=`returningCycle.webp` `` |
| Condition generator | 14126658 | `RLc=(e,t)=>` |
| Native auto-use callback | 16607457 | `currentCraftingAutoUseLoadout?.slots` |
| New droplet action | 7974156 | ``name:`Stablizing Circuit` `` |
| Converging Jade | 6609169 | ``name:`Converging Jade Cauldron (${e})` `` |
| Room scaling | 5334839 | `e.scalesWithRoomEffectiveness` |
| Extra state keys | 14114991 | `for(let t of l.keys)` |
| Preview mastery filtering | 14261196 | ``n.condition?.kind===`chance` `` |
| Separate replicated-pill results | 16770756 | `replicatedPills:l` |

Baseline extract: `tmp/installed-game-runtime/2204327147-1789294012392` in this
repository. Its `package.json` identifies 0.7.12-ad43f78. Baseline byte references
below distinguish `dist-electron/Game.js` from
`dist-electron/_rolldown_dynamic_import_helper.js` (called **old helper**).

### 17.2 Cost replacement is a mechanics migration, not a rename

`qiCostReduction`, `qiCostPenalty`, `stabilityCostReduction`, and
`stabilityCostPenalty` replace the two old percentage stats; neutral is zero.
Reduction contributions combine as
`100 - (100 - min(100, a)) * (100 - min(100, b)) / 100`.
Penalty contributions combine as `(100 + a) * (100 + b) / 100 - 100`.
Each combination is rounded to 10 decimal places. A positive penalty increases
cost; it is not a negative-valued reduction. Condition multipliers below one
enter the reduction channel; those above one enter the penalty channel.
Evidence: G:144990-144993,317975-317982,318218-318286.

Let `M = max(0, 100 - reduction) * max(0, 100 + penalty) / 10000` and
`F(x) = floor(round(max(0, x) * 1e10) / 1e10)`.
Qi cost is `floor(F(max(0, basePoolCost + poolCostFlat) * M) * harmonyQiMultiplier)`;
`noQiCost` bypasses it entirely. Positive base stability cost uses
`floor(F(baseStabilityCost * M) * harmonyStabilityMultiplier)`; otherwise it is
zero. Keep the inner rounding and outer harmony floor separate. Evidence:
G:321632-321657. Current TS and Rust instead normalize the old stats around 100
and use the old negative stability-delta path:
`src/optimizer/skills.ts:1810-1919`,
`crates/craftbuddy-engine/src/effects.rs:2269-2355`.

Review regression: a 15.5% base reduction combined with a 10% reduction buff
gives 23.95% reduction, so base cost 200 pays **152**, not 151. The modern
channels must not pass through the floored legacy percentage view; a legacy
adjustment applies only to the side with a legacy-stat contribution.

### 17.3 Action execution, mastery timing, and native auto-use

The current UI checks legality using the pre-action derived costs and resources,
including droplets (G:692996-693025,693229-693262). Its click callback applies
native auto-use first, then dispatches the technique
(G:693113-693159). The same callback ordering and loadout/toxicity/training inputs
exist in baseline `Game.js`, byte 1413302. The current slot selector retains the
step-zero reagent priority, inventory and per-craft limits, condition and existing
effect checks, toxicity budget, and enabled switch (G:692895-692949).
**No new auto-use mechanism is needed.** Preserve the existing guard that only
direct-dispatches techniques when native auto-use is inactive:
`src/modContent/autoCraftExecutor.ts:719-745`.

The reducer snapshots existing buff **names**, executes the action, then passes
the returned `{ poolCost, stabilityCost, succeeded }` to end-of-turn processing
(G:541130-541146). Action order is toxicity, droplets, buff cost, success-chance
capture, mastery effects, recomputed Qi/stability costs and payment, success roll,
then successful technique effects (G:540478-540651). Mastery effect buffs can
therefore affect the **current** payment. Failed actions still pay and still reach
end-of-turn harmony processing. Static cost/success masteries remain baked into
the technique at construction (G:343620-343655); do not apply them twice.

At turn end: cooldown update; type-specific and ordinary effects of buff names
in the pre-action snapshot; harmony `processEffect` with the resolution; condition
advance; stability decay and caps; bar/resource flooring and caps; Completion
Bonus replacement and harmony clamp (G:540284-540308,540929-541022).
New buff names created by mastery/technique effects do not receive an immediate
ordinary buff tick. Do not flatten mastery effects into ordinary technique
effects as the current extractor does:
`src/modContent/craftStateExtraction.ts:249-267,675-722`;
the current TS cost deduction precedes those effects
(`src/optimizer/skills.ts:3519-3530`). Mirror the corrected phases in Rust.

### 17.4 Chance masteries and the game preview are different contracts

Examples in the current mastery generators: deterministic control/intensity is
`2 * (tierIndex + 1)` percent versus a 10% chance of
`30 * (tierIndex + 1)` percent; deterministic bar effects use 0.02 versus a 10%
chance of 0.3 times the scaling stat. These chance examples have 1.5 times the
deterministic expected amount (G:342418-342538). Read the actual runtime payload;
do not multiply already-strengthened extracted effects by 1.5 again.

The game preview strips mastery entries whose own condition is `chance`, and
strips chance-conditioned nested effects from effect masteries, before simulation
(G:547788-547818). This is preview-only: actual execution still rolls them.
Optimizer expected-value simulation must not discard them merely to imitate the
game's displayed preview. Mastery pool selection is effect-kind based, and the
new declarations include `modifyBuffGroup`; dependency/type retargeting must
retain those runtime entries rather than a stale exhaustive kind map
(G:343582-343591; supplied `diff_crafting_0712_0717.txt:219-229`).

### 17.5 Returning Cycle: complete transition contract

The ninth registered harmony is `returningCycle`, with complexity multiplier
**1.3**, no starting-harmony override, and empty recommendations. Initialization
creates `{ charges: 0, storedQi: 0, chargeSize: max(1, entity.stats.maxpool * 0.1) }`
and removes Returned Precision. The charge size uses the raw starting
`stats.maxpool`, not each turn's computed maximum or current pool. Absent or
non-finite cycle data, or non-positive charge size, is reinitialized from that
same expression (G:318992-319018,319079-319082,319232-319275).

For **every** harmony resolution, including a failed action:

1. Increment `pulseKey`; clear recommended technique types.
2. Add `max(0, actionResolution?.poolCost ?? 0)` to `storedQi`.
3. Create `floor((storedQi + chargeSize * 1e-9) / chargeSize)` charges; subtract
   their charge-size units, clamping the remainder at zero. Charges are uncapped.
   `lastOutcome` is `charge` if any were created, otherwise `drain`.
4. With the resulting total charges C, subtract `3 * C` harmony and
   `C * chargeSize * (0.03 / 0.1)` Qi, clamping pool at zero. This direct drain
   does not run through the ordinary pool applier/`poolSpent` trigger and does
   **not** charge the next cycle. Restores do not erase recorded spending.
5. If the technique **type** is `stabilize`, clear all charges and set
   `lastOutcome = release`, then add `10 * C` harmony and `5 * C` Returned
   Precision stacks. Drain happens **before** release, including newly earned
   charges. The partial `storedQi` remainder survives.

Evidence: G:319039-319078. The harmony reads the reported computed `poolCost`,
not a net pool delta; it does not inspect `succeeded` or `stabilityCost`.
No resolution means no new spending credit, not a skipped drain/release.

Returned Precision is a stackable ordinary buff: `critchance` contribution is
`1 * stacks`, and its ordinary effect subtracts one stack each action. Existing
stacks tick before harmony resolution; cash-out stacks are added afterward, so
they do not immediately decay or improve the cash-out action itself. Harmony is
finally clamped to [-100, 100], and pool is floored/capped by normal turn cleanup
(G:319019-319037,540937-540963,540988-540991,541017-541019).
Search should value charges/Precision through simulated future outcomes, not a
new flat harmony reward or a hardcoded Stabilize recommendation.

### 17.6 Buff/scaling additions and the two named buff fixes

`isItem` multiplies by `1 + itemEffectiveness / 100` (G:183689); the live stat is
additive and neutral is **0** (G:318300-318328). Calming Mind Pill specifies
`stacks: { value: 4, isItem: true }`, a 15-point stability-cost-reduction buff,
and ordinary -1 stack decay (G:275603). Therefore it creates 4 stacks at neutral,
6 at +50 effectiveness and 2 at -50; seed the live stat in both engines rather
than a percentage baseline of 100.

Buff stat scopes merge base variables, `additionalVariables`, `internalState`,
then current stacks (G:318247-318265). Buff effect execution resets room
effectiveness to zero before merging per-instance variables/state
(G:540145-540157). Scaling now supports room-effectiveness opt-in, a nested
`multiplier` (including stepped thresholds and optional increasing step costs),
and final `roundToInteger`. The multiplier is applied after the normal initial
rounding and before `max`/stance operations/final integer rounding
(G:183677-183746). These fields are absent from CraftBuddy's local Scaling and
BuffDefinition contracts (`src/optimizer/gameTypes.ts:51-74,180-220`); preserve
them through extraction and mirror evaluation in Rust.

`setState.keys` sets extra keys in addition to the primary key. The new
Stablizing Circuit uses **set-mode** to reset four action-type flags together
(G:306623-306649). Its runtime implementation also has observable quirks:
add-mode extra keys derive from the already-updated primary key, and the
immediate variable-copy loop uses array indexes rather than key values
(G:540245-540275). Do not silently replace those semantics with an idealized
implementation; the inspected Circuit path uses set-mode, not that add branch.
The local TS effect contract currently exposes only `key`
(`src/optimizer/gameTypes.ts:127-141`).

Converging Jade now declares a source-independent `perfectionGained` trigger,
whose completion effect has `value: 30`, `eqn: amount / 100`; it still negates on
Fusion (G:249124-249145). Triggered blocks run through the **general buff effect
executor**, with a trigger/buff re-entry guard (G:540797-540840), so this completion
effect receives normal completion-applier behavior, not a special raw-bar add.
CraftBuddy currently permits only `setState` in triggered blocks; this silently
omits the new completion effect in TS and Rust
(`src/optimizer/skills.ts:3840-3845`;
`crates/craftbuddy-engine/src/effects.rs:1815-1818,1871-1875`).

Fusion Invasion and Refinement Invasion both now declare `canStack: true` and
lose one stack per ordinary action (G:305799-305813,305855-305869). The displayed
stat definitions do not scale with stacks: do not turn a stacking duration into
an invented per-stack intensity/control penalty. Preserve runtime definitions
and the normal can-stack path rather than adding name-specific overrides.

### 17.7 Scoped condition/outcome comparison and new droplet action

**Conditions did not change between the inspected builds.** Baseline old helper
byte 11365674 (`zas`) matches G:540879-540927 (`RLc`), including entity-based
discordance, constants 0.25/0.18 (old helper byte 11365410), extremes, and queued
neutral handling. `getNextCondition(progress, entity?)` is not a new migration
requirement. A pre-existing model discrepancy was noticed, not expanded here:
the runtime handles nonzero discordance before queue-based branches, whereas
`src/optimizer/search.ts:906-949` applies a different late neutral gate. This is
not a newly introduced 0.7.17 condition rule.

**Outcome gates/termination are unchanged.** Baseline old helper byte 5797785
matches G:318413-318419: end on stability <= 0 or both maximum flats. Baseline
`Game.js` byte 1501044 matches G:700753-700760: failure at zero completion bands;
sublime needs both band counts > 1 and a sublime craft; otherwise any perfection
band yields perfect. Material refund is still capped at 80%
(G:703034-703053). Keep `src/optimizer/outcome.ts` as the authority; no new tier,
manual Finish action, or scoring retune follows from this update.

**Pill replication changed, but not outcome tiers.** Baseline `Game.js` byte
1534172 walks consumed pill types in insertion order; current G:688466-688488
randomly samples individual consumed units **without replacement**, capped by
`floor(pillReplication)` and consumed count, then regroups by item. Results now
carry `replicatedPills` separately on failed/basic/perfect/sublime results
(G:703055-703148), instead of mixing them into material refunds. Current
CraftBuddy optimizer/modContent contain no pill-replication result processing;
no new mid-craft resource or band-scoring rule is required. Any future result
inspection must use the new field rather than `refund`.

**Droplets now matter to the action space.** The new technique's internal name
is misspelled `Stablizing Circuit`; it costs 3 droplets, has zero base Qi/stability
cost, a 9999999 cooldown, and creates the four-type tracking buff
(G:306606-306649). Neither spelling appears in either inspected 0.7.12 bundle.
Current legality checks droplets (G:693004), and execution deducts them before
masteries/costs (G:540489-540500), so failed execution still spends them. The
runtime variable builder exports `qiDroplets` and `maxqiDroplets`
(G:318311-318312). Neither droplet field nor `dropletCost` is modeled anywhere in
current `src/optimizer` or `src/modContent`; add extraction, state, legality,
transition, and Rust/bridge support rather than recommending an unpayable action.
Keep the internal spelling unchanged and user-facing names on
`techniqueDisplayName()`.

### 17.8 Harmony hydration and Rust/WASM bridge

TS currently stops at eight harmony names
(`src/optimizer/gameTypes.ts:38-45`). The live-data clone explicitly copies
Captivating Cadence but has no Returning Cycle field, so it would discard the
new state (`src/modContent/harmonyState.ts:30-76`). Add the cycle's authoritative
charge size, charges, remainder, and presentation metadata to hydration and pure
state cloning/serialization; do not reconstruct an in-progress cycle from
current pool.

There is **no Rust harmony enum to extend**: dispatch uses `&str`
(`crates/craftbuddy-engine/src/lib.rs:1803-1825`). Captivating Cadence already has
a Rust state field, processing branch, and TS bridge conversion
(`lib.rs:345,1817,1985-2027`;
`src/optimizer/nativeMcts.ts:212,233-238,495-500`). Returning Cycle needs a new
serde payload and string dispatch branch, action-resolution context, correctly
timed Precision buff mutation, and matching bridge conversion. It currently
falls through the zero-effect default if presented as a string. Cost and droplet
fields also have to cross the same TS/Rust boundary. Rebuild WASM after those
source changes; a type-only upgrade cannot enable the mechanic. Preserve the
existing per-bar Eccentric Decree fold and contribution gates in both engines.

### 17.9 DOM/controller compatibility: static selector audit only

CraftBuddy does not currently call `injectUI`; it mounts its own overlay and
uses generic controls plus class/text fallbacks
(`src/modContent/overlayMount.ts:213-252,289-309,319-322`;
`src/modContent/autoCraftExecutor.ts:38-47`;
`src/modContent/index.ts:2677-2703`). No game-specific injectUI selector requires
migration. Literal lowercase progress class names are not established by this
inspection; the surviving English `Completion:`, `Perfection:`, and `Stability:`
labels support the existing fallback searches (G:701795,701825,701919).

The current crafting action component retains a `button` role, translated
`displayName ?? name` aria-label, tab index, and click callback; controller support
adds data attributes, not a replacement input path
(G:621915-621927,622522-622530). These match the executor's `[role="button"]`
and aria-label searches; keeping `techniqueDisplayName()` remains necessary.
**No mandatory selector rewrite was found by this grep-level audit.** Actual
visibility/layout, localization, controller focus, and click-sequence behavior
remain untested; check them in phase 2 rather than treating bundle presence as a
live UI pass.

### 17.10 Phase-1 check results and scope limits

The runtime oracle and extraction passed. After this evidence update, the
inventory generator ran with its output redirected to audit scratch, preserving
the one-repository-file write limit. Documentation link and authority checks
passed. The combined `docs:check` failed at freshness: 16 **untouched** documents
exceeded their review periods; for example, `docs/DOC_INVENTORY.md:6-8` records
2026-09-13 with a 30-day cycle, and `docs/project/ARCHITECTURE.md:7-9` records
2026-08-23 with a 30-day cycle. Those dates were not changed merely to make the
check pass. Source tests, WASM/build/corpus generation, benchmarks, and live UI
checks were not run in this read-only implementation audit. Only this evidence
document was changed in the repository; no phase-2 work or commit was started.

## 18. Installed 0.7.18 auto-finish correction (2026-10-29)

The audit's extracted `package.json` reports **0.7.18-97c093b**. The formatted
`Game.pretty.js` SHA-256 is
`d960c947d7b1e8f329183e27dc24a610f54c7c128a15d2e5cc1bd503dbca6e05`.
The raw `dist-electron/Game.js` SHA-256 is
`cc6ca4a00d277d5ddf86262cbc786fba8f7b27c823d0c3b788aec8d7f4fb9b4e`.
Line numbers below refer to that exact formatted artifact; formatting changes
locations, so recover the alias and re-check the body on another build.

`Game.pretty.js:318431-318438` defines the two cap getters and `Eho`:

```js
Tho = (e, t, n, r = 0) => bho(t.completion, e, n, e.canOvercraft ?? !1, r),
IF = (e, t, n, r = 0) => bho(t.perfection, e, n, e.canOvercraft ?? !1, r),
Eho = (e, t, n, r, i = 0) => {
  if (e.stability <= 0) return !0;
  let a = Tho(t, n, r, i).flat,
    o = IF(t, n, r, i).flat;
  return e.completion >= a && e.perfection >= o;
},
```

There is **no five-completion-band early-finish branch**. The historical
five-band shortcut described in section 12.5 must not be applied to this
runtime. Section 17.7 had already recorded the same flat-cap predicate for
0.7.17, but the TypeScript `willAutoFinish` still retained the older shortcut.
That mismatch could tell search a high-cap craft had ended while the game still
allowed more completion. The correction removes only the obsolete shortcut;
band thresholds, actual item tiers and user-selected goals remain independent.

Example: with completion cap 2000, perfection cap 399 and base widths 100,
completion 902 (five bands), perfection 399 and stability 50 is still live.
Reaching both actual flats 2000/399, or stability 0, ends it. These boundaries are
covered in `src/__tests__/outcome.test.ts`.

This is static installed-artifact evidence. It does not establish full 0.7.18
mechanics parity or a live gameplay validation.

<!-- prettier-ignore-end -->

### 18.1 Stability payment, failure streaks and critical chains

Additional static checks against the same 0.7.18 artifact:

- `RLc` at formatted line 539835 adds the full negative stability payment to
  the live bar and emits `stabilitySpent` with that full amount. It does not
  clamp the bar to zero. `gRc` at 541070 clamps after buffs and harmony. Thus
  starting at 1, paying 10, then restoring 7 still ends at 0. Clamping before
  recovery invents survival. Both transition implementations now defer that
  clamp; mastery subphases also preserve the intermediate value.
- `KLc` at 540210 is a per-technique failure-streak map. `JLc` at 540221
  calibrates the increasing-roll coefficient by 64 bisection iterations over
  expected trial count. The success check at 540687 uses
  `min(1, coefficient * (failures + 1))`, then resets on success. The map is
  not reset in the inspected `initCrafting` reducer. Current-craft
  `actionTracking[name].attempts` proves the streak only after a recorded
  success. An unknown carry-over is modeled with robust bounds over both
  outcomes, not a fabricated exact probability.
- `oho` at 318150 implements independent critical applications, up to nine
  additional critical-chain rolls using `overcrit`. Values above 90 add to
  the multiplier; the chain chance is floored after each multiplication.
  The native helper itself draws randomness, so it must never be called as
  an expected-value calculation. The new branch resolver implements its
  arithmetic without invoking the live RNG.
- `eRc` at 540717 dispatches `actionFailed` before the ordinary turn tick.
  Nine Fates Flame uses that event (265817 onward). Branch simulation now
  retains the resulting whole buff on the failed branch.

These checks are covered by `stochasticTransitions.test.ts`, the survival
regressions, PRD extraction tests, and Rust stability-phase regressions. They
remain scoped evidence, not an exhaustive audit of all 0.7.18 effects.


## 19. PR #4 native-selector verification (0.7.18)

Rechecked on 2026-10-29 using the installed ASAR, fingerprint
`2905116188-1793133742679`. Set `AFNM_GAME_DIR` to the Steam game directory
before running `runtime:oracle` or `runtime:extract`. The oracle reports
`gameVersion: 0.7.18-97c093b`; its older minified buildVersion pattern returns
null and is not used as version evidence. Nested ASAR lookups now use host path
separators so Windows extraction includes `dist-electron/main/index.js`.
Extraction lives in `tmp/installed-game-runtime/2905116188-1793133742679/`.

The current crafting logic is in `dist-electron/Game.js`, SHA-256
`cc6ca4a00d277d5ddf86262cbc786fba8f7b27c823d0c3b788aec8d7f4fb9b4e`.
Search these build-specific symbols in the extracted source (names are not
stable across releases):

- `recipeConditionEffects:eu` exports `eu=[...]`, an ordered array of
  condition definitions, not a keyed object. Array order defines rule indices.
- `scu` accepts reagents or pills with `pillKind === 'crafting'`.
  `ccu` calls this predicate before slot selection; accepting all pills would
  diverge from the native hook.
- `eR` normalizes blocks, legacy conditions with AND/OR, and single
  condition rows. `iho` and `rho` compile `condition/check/value` fields.
  They do not consume a `kind/comparison` rule schema.
- `ccu` calls `hEl(fEl(item.effects), entity)` to skip items with an
  already-active non-stacking createBuff effect. `fEl` extracts direct
  createBuff definitions; `hEl` tests any matching positive stack count.
  Stackable buffs at their cap and direct resource restoration are not part
  of that native predicate. Adding broader satisfaction rules would mispredict
  which items the game consumes.
- `NF` / `vho` / `_ho` seed resistance from entity stats and add buff
  stats. Condition-specific modifiers apply to control/intensity and cost
  channels, not resistance. The simulator likewise seeds raw resistance,
  folds buffs once through `getCraftingActionVariables`, and recalculates
  payment between selected items. Passing already-aggregated resistance into
  the raw base would double-count buffs.
- `ccu` uses `floor(pillsPerRound) - consumedPills` and selects nothing
  when this is zero or negative. Zero must not be converted into one.

The disputes and fixes are backed by `prReviewRegressions.test.ts` and
`nativeAutoUsePlan.test.ts`. These are scoped observations, not an exhaustive
claim of parity for every crafting mechanic.


### Native harmony rule indices, rechecked during review round 2

The same installed 0.7.18 artifact/hash was rechecked on 2026-10-29. Its
`Wmo` array still contains only forge, alchemical, inscription, resonance,
formless, enhancingEcho and eccentricDecree, in that order. This is the native
rule selector's whitelist, distinct from the nine playable harmony types in
`harmonyRegistry.ts`. In `rho`, a Harmony Type index not present in `Wmo`
returns expression `0` before interpreting the comparison operator. Thus
indices 7/8 do not fire for either equality or inequality. A valid inequality
such as `Harmony Type != forge` can still match Returning Cycle.

Replacing the native seven-index whitelist with the general nine-entry gameplay
registry would incorrectly predict item consumption. The whitelist is named and
commented explicitly in `nativeAutoUsePlan.ts`; `prReviewRound2.test.ts`
covers invalid indices for both comparisons and valid comparisons across all
nine playable harmonies. Revisit this list when runtime evidence changes.


### Native pre-click gate, rechecked for review comment 4413767132

In the same inspected 0.7.18 Game.js, the control builder computes action costs
with `s_o` and `canUse` with `dcu` using the pre-action entity/variables,
then passes that flag and the click callback to the technique control. Only the
click callback runs native auto-use `v()`, followed by technique dispatch
`bRc` and history recording `cpc`. Thus an item restoring Qi cannot make a
currently disabled technique clickable. Native auto-use stays inside the enabled
control path; direct dispatch remains forbidden when the loadout is active.
This is also the contract already recorded in section 17.3.

### Native availability payload, rechecked for review comment 4416939157

The same 0.7.18-97c093b artifact was rechecked on 2026-10-30. `dcu`
requires sufficient Qi, buff payment/requirement stacks, toxicity capacity and
droplets, an exact condition match, zero cooldown and positive stability. It also
checks `firstActionOnly` against step zero, `minStability` with a strict `>`
comparison, and `disableAtMaxStacks` against each createBuff effect. Serpent's
Foundation declares firstActionOnly, Coiled Strike declares minStability 45,
and capped-buff techniques declare disableAtMaxStacks. These are real native
gates, not hypothetical future metadata.

The worker previously lacked those three gates because it has no live native
callback. `nativeAvailability.ts` now mirrors them from the raw payload, with
simulated cooldowns and resource state. The raw schema is checked before
certification, including matching directly copied payment fields. Unknown
fields or malformed gates cannot receive a certificate. An executable comparison
against the extracted `dcu` passed 486 combinations of gates, step, stability,
stacks and condition. This is scoped availability evidence, not exhaustive
transition parity. Existing Rust arithmetic and its regenerated differential
corpus are unchanged.

### Missing harmony observations, review comment 4422591232

The same 0.7.18 artifact was rechecked on 2026-10-30. In the Resonance
different-action branch, unless it is the second consecutive action toward the
pending resonance, the runtime subtracts 9 harmony and 3 stability and reduces
strength. `processResonance` models this. Omitting the subsystem is therefore
not a neutral approximation: at stability 5, a refine costing 2 can end the
craft immediately after the additional 3-stability penalty.

`hydrateHarmonyData` reports `source: missing` for a non-forge harmony when no
live progress payload exists. An empty or incomplete payload is still labeled
`progressState`; that source tag does not establish subsystem completeness.
Certification checks the resulting envelope and requires the active stateful
subsystem after step zero. Its Returning Cycle presentation defaults
do not prove that live charges/stored Qi are zero. The adapter now preserves
that uncertainty by withholding missing-source data from the search state.
Certification rejects missing/unknown harmony types, absent envelopes, and
missing active stateful subsystems after step zero. Observed Forge fallbacks
remain accepted. The regression in `reviewSafetyIdentity.test.ts` contrasts the
missing Resonance snapshot with the observed penalty-bearing state.

### Guaranteed actions preserve PRD carry-over, independent review

The same 0.7.18 artifact's success block updates `KLc` only inside the stated
chance `u < 1` branch. A failure increments the map and a successful trial
deletes its entry. A stated chance of one bypasses the trial and leaves the
map unchanged. This differs from a real trial whose streak-adjusted chance
reaches one: that trial still resets the streak on success.

An independent Astra audit supplied a two-action source reproduction: base
success 0.5, a +0.5 chance condition on the first action, then neutral. The
simulator incorrectly reset the streak on the first guaranteed action. An
incoming streak of two subsequently produced 30.2103% instead of 90.6309%;
an unknown incoming streak incorrectly became an exact probability. Root
independently reproduced the result and inspected the native block before
repair. `prdGuaranteedCarry.test.ts` now covers known/unknown preservation,
policy uncertainty, real probability-one trials, zero-chance trials and an
immediately guaranteed finish. This is scoped source/artifact evidence, not
live-game sampling.

### Celadon Cycle stack events and consumption

The installed artifact was rechecked as **0.7.18-97c093b**. Flickering Celadon
Flame's `Celadon Cycle` creates Fusion, Refinement, Support and Stability Ember
from its four action-type blocks. Embers are non-stacking, capped at one. Each
named stack-gain listener checks all four native aliases, restores 0.1 times
maximum Qi and 10 stability, then applies four negative createBuff effects.

The native `op` alias helper preserves case (`Fusion_Ember`, not merely a
lowercase optimizer key). `p2` emits stackGained after an accepted positive
addition, but not when an existing non-stacking buff ignores it. `XLc` routes
negative buff createBuff amounts through `f2`, which consumes non-stacking buffs
too. The trigger dispatcher recomputes `PF` for each matching owner and guards
re-entry by event/owner. Its captured variable frame remains in use across the
whole effect list. `WLc` publishes actual capped pool restoration, including
zero, while `RLc` retains stability overdraft until end-of-action cleanup.
`gRc` executes action-type buffs after either success or failure.

An isolated comparison loaded the actual native Celadon definition plus native
stack appliers, trigger dispatcher, buff executor and resource appliers from
the extracted artifact. **96 comparisons passed** across all 24 action orders,
one/two cycles and boosted/unboosted payouts. Stat frames and expression
plumbing were isolated to this tested payload; this is not full-game execution.
Source tests additionally cover repeated embers, chance branches, caps, low
stability, current maximum Qi, downstream triggers and nested-event guards.
The historical Rust corpus is unchanged and does not establish Celadon parity;
the production TypeScript worker is the authority for this new support.

### Resource phase audit (2026-10-31, 0.7.18-97c093b)

The installed artifact was rechecked through the runtime summary before this audit. Native `WLc` branches on the raw operation sign: spending floors the pool at zero without an upper cap; restoration applies Qi boost and its captured maximum. It publishes the actual state delta, including zero. Negative boosts can produce signed restoration deltas; a later spend can also report a signed delta when flooring a temporarily negative pool. These are applier semantics, not evidence that every generated probe represents a normal equipment loadout.

The technique executor captures its variable frame for the mastery list, executes mastery effects, recomputes the payment frame, pays Qi and then stability, and executes successful technique effects. The buff executor captures a fresh frame per buff; event dispatch captures one per owner and retains it across that handler block. Native `RLc` retains stability debt through the action. Turn cleanup captures its pool cap after buff execution and before harmony, then performs final flooring/capping. The item executor does not perform that technique-turn cleanup.

The independent generator [generate-qi-resource-oracle.cjs](../../scripts/optimizer/generate-qi-resource-oracle.cjs) accepts the audited pretty bundle and refuses a changed `WLc` hash. It imports no simulator code. [qiResourceOracle.json](../../src/__tests__/fixtures/qiResourceOracle.json) records 1,440 literal expectations and the source-function SHA-256. The matrix covers four caller phases, two initial pools, five boost values and two ordered operations drawn from six amounts. Observer values are doubled before encoding so native scaling rounding does not erase fractional deltas. The generated expectations are checked in [qiPhaseSafety.test.ts](../../src/__tests__/qiPhaseSafety.test.ts).

This comparison isolates the pool applier and declared caller order. Separate regressions cover live/captured frames, payment observers, item continuation, chance branches and rejection of unsupported progress-dependent sequencing. It is not full-game execution, full Rust/native equivalence or in-game acceptance of Ashglass Ward.

The native condition evaluator distinguishes scope types: pool conditions and expression conditions read the captured variable frame, while native completion/perfection/stability gates read live progress. The new regression tests distinguish captured expressions from the live bar checks involved in this repair. Ordinary progress-derived stat buffs capture their values for a technique and refresh on the next action; mentioning completion/perfection in a stat formula is not by itself an unsupported mechanic.
