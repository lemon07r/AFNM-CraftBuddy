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
  - docs/project/WORKSTREAM_OWNERSHIP.md
  - src/optimizer/harmony.ts
  - src/modContent/nativeAutoUse.ts
  - src/modContent/autoCraftExecutor.ts
---

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
- `autoCraftExecutor.ts` prefers a direct
  `store.dispatch({ type: 'crafting/executeTechnique' })`, which **bypasses the
  React handler and therefore skips this hook entirely**. The DOM-click fallback
  (`dispatchClickSequence`) goes through the handler and does trigger it. The two
  execution paths are observably different, which is the bug Step 2 must fix.
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
- The executor still synthesises a `Finish Craft` action and maps it to native
  `Wait`. That is wrong twice over: if the auto-finish predicate already holds
  the craft has *already* resolved and no dispatch is needed, and if it does not
  hold then dispatching `Wait` silently spends 10 stability. Step 2 owns
  reconciling this, and the UI wording must say "will auto-finish", never
  "finish the craft".

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

### 3.3 Bearing on `user-report-resonance-regression`

The resonance model is byte-for-byte faithful to the runtime, so the benchmark's
`mustRankBefore` failure **cannot** be explained by a wrong resonance formula.
Combined with the already-recorded facts that the fixture snapshot carries no
`harmonyData` at all (so the harmony block never runs for it either way) and
that the two alternatives sit 0.29% apart while the actual recommendation is a
third action, the evidence points at the benchmark contract rather than the
model. Step 7 owns that decision; no scoring constant may be tuned for it.
