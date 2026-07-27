---
title: Runtime Evidence 0.7.5
status: active
authoritative: true
owner: craftbuddy-maintainers
last_verified: 2026-07-26
source_of_truth: installed AFNM 0.7.5 runtime bundle (scripts/installed-game-runtime.js)
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

# Runtime Evidence 0.7.5

Verbatim findings extracted from the **installed** AFNM 0.7.5 runtime. The
runtime is the sole authority here: where a tooltip, a patch note, or an earlier
CraftBuddy note disagrees with the code below, the code below wins.

## How to reproduce

```bash
bun run runtime:oracle                      # confirms build id + bundle inventory
bun run runtime:extract                     # unpacks app.asar into tmp/installed-game-runtime/<build>/
bun run runtime:grep -- "<pattern>"         # searches the extracted bundle
```

`runtime:oracle` reported AFNM **0.7.5**, Electron 40.4.0, build
`1170135731-1784964316349`, extracted to
`tmp/installed-game-runtime/1170135731-1784964316349/`. The two crafting-relevant
chunks are `dist-electron/Game.js` (~4.5 MB) and
`dist-electron/_rolldown_dynamic_import_helper.js` (~10.9 MB). `tmp/` is not
committed, so the snippets are reproduced here verbatim.

Symbol names are minified and **not stable across builds**. Resolve them by
following the re-export aliases (`rg -o "[A-Za-z_$]{1,10} as <alias>"`) rather
than reusing the identifiers below.

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
  divergence was the bug; see section 4 for how it was resolved.
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

---

## 2. There is no Finish Craft technique — the craft auto-finishes

### 2.1 The only technique appended to every roster is `Wait`

```js
yQr={name:`Wait`,icon:vQr,poolCost:0,noQiCost:!0,stabilityCost:10,successChance:1,cooldown:0,
tooltip:`Let the crafting process advance. Has no other effects.`,effects:[],type:`support`,
realm:`mundane`,currentCooldown:0,masteryKindPools:[`stability`]}
```

There is **no** `Finish Craft` action anywhere in the 0.7.5 bundle. The craft
resolves on its own once the terminal predicate holds; the player never
confirms it.

### 2.2 `Wait` is not a free no-op

`Wait` costs **10 stability** and consumes a turn. It is *not* a safe stand-in
for "finish now".

**Consequences for CraftBuddy**

- `outcome.ts` is correct that 0.7.5 has no manual finish, and `willAutoFinish`
  is the right terminal predicate.
- Synthesising a `Finish Craft` action and mapping it to native `Wait` is wrong
  twice over: if the auto-finish predicate already holds the craft has *already*
  resolved and no dispatch is needed, and if it does not hold then dispatching
  `Wait` silently spends 10 stability. See section 4.

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
every transition. `bun run optimizer:bench` now reports **98 of 98 contracts
passing**. No scoring constant was tuned.

One contract change came with the fix. The runner-up ordering clause is now
materiality-aware: it always fails when the losing candidate is actually
recommended, and otherwise only when the score gap exceeds an explicit
tolerance. Search scores are not normalised across depths (~18k at depth 4
against ~44k at depth 5), so an ordering claim must be node-budget bound rather
than wall-clock bound — measured on this fixture, refine leads at depth 4,
inverts at 5, and leads again from 6.

---

## 4. What was done about each finding

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

<!-- prettier-ignore-end -->
