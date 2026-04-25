# Phase 3: MCTS Engine

## Goal

Add a stochastic search engine on top of the deterministic Rust core that is better suited than the current bounded beam search for long crafts with chance-based outcomes.

## Recommended algorithm

Use **expected-utility MCTS** with:

- sampled stochastic transitions
- mean-value backpropagation
- root action ranking by expected value, with visit count/confidence as supporting diagnostics

Do **not** use max-backpropagation as the primary value signal. In this domain, max-backprop overvalues lucky rollouts and is not a stable recommendation policy for real users.

## Why this variant

The crafting domain has:

- fully observable state at each real turn
- stochastic transitions inside simulations
- moderate branching
- long horizons

That makes MCTS a good fit, but only if the search value represents expected utility rather than "best lucky line seen so far."

## Tree shape

Start with a simple implementation that is easy to make correct:

- rebuild the tree per recommendation
- no subtree reuse initially
- no explicit worker parallelism initially

Node statistics should include:

- `visits`
- `total_value`
- `mean_value`
- optional `best_value` for diagnostics only
- optional prior score for move ordering

## Selection

Use a UCB-style policy based on mean value:

```text
mean_value + exploration_term + optional_prior_bias
```

The prior term should be small and derived from the deterministic one-ply evaluator, not a separate bespoke heuristic lane.

## Expansion

When a node is expanded:

1. reconstruct the simulated state at that node
2. list legal actions from that state
3. order them using a cheap deterministic prior derived from the current scoring/transition model
4. expand one untried action

The expansion policy should not hard-filter legal moves out of existence.

## Simulation / rollout policy

Rollouts should be lightweight but still grounded in existing semantics.

Recommended policy:

- prefer top-ranked legal actions from a cheap one-ply evaluator
- occasionally explore lower-ranked legal actions
- use sampled success/crit/condition outcomes during rollout transitions
- use the deterministic scorer only for terminal/rollout-end evaluation, not full recursive search

The rollout policy should reuse existing scoring ideas where possible. Avoid inventing a second disconnected heuristic system.

## Stochastic transition rules

Sample these during rollouts:

- technique success/failure
- crit outcomes
- chance-based effects
- generated future conditions after the visible forecast queue is exhausted

Do **not** approximate condition generation from step count alone. The current TS logic depends on the current condition and the trailing visible queue state; the rollout state must carry the remaining condition queue explicitly.

See `src/optimizer/search.ts` around `getGeneratedConditionDistribution()`.

## Finish Craft handling

Treat `Finish Craft` as a terminal pseudo-action, but use the existing exact finish-outcome evaluator instead of sampling craft-end success bands unnecessarily.

That lowers variance and preserves the current documented finish behavior.

## Edge cases

Must be handled explicitly:

- no legal actions
- zero/negative stability
- non-turn item actions
- forecasted condition queue consumption
- crafts already at target
- sublime crafts with harmony-dependent continuation value

## Suggested result metrics

The engine should return enough data for TS to hydrate a full `SearchResult`:

- ranked root actions with `skillKey`, `visits`, `meanScore`, and confidence
- principal variation as `skillKey[]`
- projected final state if followed
- time taken
- simulations completed
- average rollout depth
- optional outcome-rate diagnostics

## Tests for this phase

Minimum scenario coverage:

1. trivial craft with one obvious productive action
2. stabilize-or-die scenario
3. buff-setup scenario where short-term loss pays off
4. probabilistic-risk scenario where the safer expected line should win
5. long-craft scenario that reaches a useful answer within budget

For fixed-seed tests, require stable recommendations under the chosen seed and budget. Do **not** require "more simulations always increases score" because stochastic search is not monotonic that way.

## Deferred until after correctness

- subtree reuse between real turns
- worker/off-main-thread execution
- fancy tree memory optimizations
- aggressive representation tuning beyond measured hot spots
