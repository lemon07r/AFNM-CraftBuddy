---
layout: default
title: Quest Examples
parent: Quest System
nav_order: 4
description: 'Complete, annotated quest implementations showing common patterns'
---

# Quest Examples

This page provides complete quest implementations from the actual game with detailed annotations explaining design decisions and best practices.

## Simple Tutorial Quest

A straightforward main quest that teaches basic game mechanics through sequential condition steps:

```typescript
export const tutorialQuest: Quest = {
  name: 'Learning the Ropes',
  description: 'Learn how life works at the Nine Mountain Sect from Lu Gian.',
  category: 'main',
  steps: [
    // Step 1: Basic healing tutorial
    {
      kind: 'condition',
      hint: 'Heal yourself.',
      completionCondition: healerTutorial.name + 'Completed',
    },
    // Step 2: Cultivation progression
    {
      kind: 'condition',
      hint: 'Break through to the Body Forging realm.',
      completionCondition: cultivationTutorial.name + 'Completed',
    },
    // Step 3: Manual learning
    {
      kind: 'condition',
      hint: 'Learn the Advancing Fist manual.',
      completionCondition: manualPavilionTutorial.name + 'Completed',
    },
    // Step 4: Crafting introduction
    {
      kind: 'condition',
      hint: 'Craft a Healing Pill.',
      completionCondition: craftingTutorial.name + 'Completed',
    },
    // Step 5: Mission hall introduction
    {
      kind: 'condition',
      hint: 'Accept a sect mission.',
      completionCondition: missionHallTutorial.name + 'Completed',
    },
    // Step 6: Major narrative event
    {
      kind: 'event',
      hint: 'Meet Lu Gian at the crossroads.',
      event: {
        location: crossroads.name,
        steps: [
          {
            kind: 'text',
            text: 'A thick cloud is swirling over the crossroads as you finally arrive...',
          },
          {
            kind: 'speech',
            character: luGian.name,
            text: '"Finally! I was so bored I started blasting the Ratascar..."',
          },
          // Additional dialogue and instructions
        ],
        // Set flags on completion
        onCompleteFlags: [
          {
            flag: luGianReturnToSectTutorial,
            value: 1,
          },
        ],
      },
    },
    // Additional steps continue the tutorial sequence...
  ],
  rewards: [], // No explicit rewards - progression is the reward
};
```

**Design Analysis:**

- **Progressive learning**: Each step introduces a new game mechanic
- **Condition-based progression**: Uses tutorial completion flags for reliable tracking
- **Mixed step types**: Combines condition checks with narrative events
- **Clear guidance**: Each hint tells players exactly what to do
- **Flag integration**: Uses tutorial system flags for completion tracking

## Multi-Part Adventure Quest

A complex side quest with exploration, dialogue, and combat elements:

```typescript
export const wanderingHerbQuest: Quest = {
  name: 'Wandering Herb',
  description:
    'Hua Tong has tasked you with finding and returned a sentient herb that escaped his gardens.',
  category: 'side',
  steps: [
    // Step 1: Information gathering
    {
      kind: 'event',
      hint: 'Go to the Nine Mountain Sect and ask around about the herb.',
      event: {
        location: nineMountainSectName,
        steps: [
          {
            kind: 'text',
            text: "Entering the sect, you spend some time asking if anyone has seen any sign of a sentient wandering herb...",
          },
          {
            kind: 'speech',
            character: genericFemaleCultivator.name,
            text: '"I saw a plant figure, down on the outskirts of the Heian Forest..."',
          },
        ],
      },
    },
    // Step 2: First encounter
    {
      kind: 'event',
      hint: 'Search the Heian Forest for signs of Zhiwu.',
      event: {
        location: heianForestName,
        steps: [
          {
            kind: 'text',
            text: 'You walk through the mists of the Heian Forest, eyes open and alert...',
          },
          {
            kind: 'speech',
            character: zhiwuName,
            text: '"STILLNESS. QUERY. DESIRE DEATH?"',
          },
          {
            kind: 'choice',
            choices: [
              {
                text: '"I\'m taking you home Zhiwu"',
                children: [
                  {
                    kind: 'speech',
                    character: zhiwuName,
                    text: '"DESIRE FREEDOM. RETURN UNDESIRED. LEAVE."',
                  },
                ],
              },
              // Alternative dialogue choice
            ],
          },
          // Zhiwu escapes, requiring further pursuit
        ],
      },
    },
    // Steps 3-5: Tracking Zhiwu across multiple locations
    // Each step involves asking NPCs and following the trail

    // Step 6: Final confrontation with completion condition
    {
      kind: 'event',
      hint: 'Go to the Star Draped Peak and confront Zhiwu.',
      completionCondition: wanderingHerbZhiwuBeaten, // Must defeat Zhiwu to complete
      event: {
        location: starDrapedPeakName,
        steps: [
          {
            kind: 'speech',
            character: zhiwuName,
            text: '"FREEDOM UNABLE WHILST YOU FOLLOW."',
          },
          {
            kind: 'fightCharacter',
            character: zhiwuName,
            victory: [
              {
                kind: 'speech',
                character: zhiwuName,
                text: '"ZHIWU WEAK. YOU STRONG. RESPECT."',
              },
              {
                kind: 'addItem',
                item: { name: zhiwuLeaf.name },
                amount: '1',
              },
              {
                kind: 'flag',
                flag: wanderingHerbZhiwuBeaten,
                value: 'month', // Store when this occurred
                global: true,
              },
            ],
            defeat: [
              {
                kind: 'speech',
                character: zhiwuName,
                text: '"ZHIWU STRONG. YOU LEAVE NOW."',
              },
              { kind: 'exit' }, // Player must retry
            ],
          },
        ],
      },
    },
    // Step 7: Quest conclusion
    {
      kind: 'event',
      hint: 'Return to Hua Tong.',
      event: {
        location: herbGardenName,
        steps: [
          {
            kind: 'speech',
            character: huaTongName,
            text: '"I will commend you on a task well done..."',
          },
          {
            kind: 'favour',
            amount: '3500', // Major reward
          },
          {
            kind: 'analytics',
            type: 'progression',
            eventName: 'wanderingHerbComplete', // Track completion
          },
        ],
      },
    },
  ],
  rewards: [
    {
      kind: 'favour',
      amount: 3500, // Preview of the reward
    },
  ],
};
```

**Design Analysis:**

- **Multi-location story**: Quest spans multiple areas, encouraging exploration
- **Character development**: Zhiwu has a personality and grows throughout the quest
- **Challenge-based progression**: Step 6 requires defeating Zhiwu to proceed
- **Meaningful choices**: Dialogue options reflect different approaches
- **Retry mechanics**: Combat defeat allows retrying without repeating dialogue
- **Progressive revelation**: Each step reveals more about Zhiwu's motivations
- **Satisfying conclusion**: Both narrative and mechanical rewards

## Simple Fetch Quest

A minimal quest demonstrating basic structure:

```typescript
export const theSpiritFields: Quest = {
  name: 'The Spirit Fields',
  description:
    'Apparently the caretaker of the Herb Gardens, Hua Tong, can aid you supplying your own crafting materials.',
  category: 'side',
  steps: [
    {
      kind: 'condition',
      completionCondition: huaTongSpokenTo, // Simple flag check
      hint: 'Go to the Herb Garden and talk to Hua Tong.',
    },
  ],
  rewards: [], // No explicit rewards - unlocks functionality
};
```

**Design Analysis:**

- **Single step simplicity**: One clear objective
- **Functional purpose**: Introduces players to an important NPC
- **Flag-based completion**: Uses simple boolean flag for tracking
- **No explicit rewards**: The interaction itself provides value

## Continuation Quest Pattern

The wandering herb questline continues with multiple related quests:

```typescript
export const wanderingHerb2Quest: Quest = {
  name: 'Wandering Herb: Starlight Training',
  description:
    'Zhiwu wishes to test themselves against you once more, under the light of the stars.',
  category: 'side',
  steps: [
    {
      kind: 'event',
      hint: 'Meet Zhiwu at the Star Draped Peak under the full moon.',
      completionCondition: wanderingHerbPeakBattleComplete,
      event: {
        location: starDrapedPeakName,
        steps: [
          {
            kind: 'speech',
            character: zhiwuName,
            text: '"FRIEND-RIVAL CAME. GOOD. ZHIWU ABSORBED MUCH POWER..."',
          },
          // Battle and character development continue
        ],
      },
    },
  ],
  rewards: [],
};

export const wanderingHerb3Quest: Quest = {
  name: 'Wandering Herb: Heavenly Core',
  description:
    'Zhiwu has begun forming a core, but the process is causing them great pain. Help them complete their transformation.',
  category: 'side',
  steps: [
    {
      kind: 'event',
      hint: 'Meet Hua Tong and Zhiwu at the Tomb of Lu Bu Lin.',
      event: {
        // Complex transformation sequence
      },
    },
    {
      kind: 'wait',
      hint: 'Wait for Zhiwu to emerge from the Mystical Region.',
      months: 12, // Significant time investment
    },
    {
      kind: 'event',
      hint: 'Zhiwu is set to emerge from the Mystical Region. Go see how the experience has changed them.',
      event: {
        // Resolution of the character arc
      },
    },
  ],
  rewards: [],
};
```

**Design Analysis:**

- **Continuing relationships**: Characters remember previous interactions
- **Escalating stakes**: Each quest in the series becomes more significant
- **Time investment**: Uses wait step to show passage of time
- **Character growth**: Both player and NPCs develop through the series
- **Interconnected story**: Each quest builds on the previous ones

## Common Patterns Summary

### Flag Usage
- **Tutorial flags**: `tutorialName + 'Completed'` for system integration
- **Story flags**: `questSpecificFlag` for custom progression tracking
- **Time flags**: `value: 'month'` to record when events occurred

### Step Progression
- **Simple quests**: Single condition or event step
- **Tutorial quests**: Sequential condition steps building complexity
- **Adventure quests**: Mixed event and condition steps with exploration
- **Epic quests**: Multiple wait steps and high-stakes events

### Completion Conditions
- **Flag checks**: `flagName == 1` or `flagName > 0`
- **Combat requirements**: Used in event steps with victory conditions
- **Tutorial completion**: `tutorialName + 'Completed'`

### Reward Integration
- **Preview in quest**: Shows what players will earn
- **Delivered in events**: Actual rewards given through event steps
- **Multiple types**: Favour, items, reputation, and story progression

These examples demonstrate how the quest system supports everything from simple fetch quests to complex multi-part storylines with character development and meaningful player choices.