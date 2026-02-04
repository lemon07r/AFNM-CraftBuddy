---
layout: default
title: Quest Structure
parent: Quest System
nav_order: 1
description: 'Detailed breakdown of quest interfaces and properties'
---

# Quest Structure

This page provides a comprehensive breakdown of the quest data structures and their properties.

## Quest Interface

The core quest definition that contains all quest metadata and progression:

```typescript
interface Quest {
  name: string; // Display name shown to players
  description: string; // Quest summary in quest log
  category: QuestCategory; // Determines where quest appears
  guild?: string; // Required for guild category quests
  steps: QuestStep[]; // Sequential objectives
  rewards: QuestReward[]; // Benefits upon completion
  failureCondition?: string; // Optional failure trigger
  cost?: number; // Optional cost to accept quest
}
```

### Name and Description

**Name**: Short, memorable title that appears in quest lists and notifications.

**Description**: Brief summary that explains the quest's purpose and context. Should intrigue players without spoiling story beats.

```typescript
name: 'The Wandering Herb',
description: 'Hua Tong has tasked you with finding and returning a sentient herb that escaped his gardens.'
```

### Category System

Determines quest organization and availability:

```typescript
type QuestCategory =
  | 'main'
  | 'side'
  | 'missionHall'
  | 'craftingHall'
  | 'requestBoard'
  | 'guild';
```

#### Main Quests

- Core storyline progression
- Typically linear and required
- Unlock major game features
- High narrative importance

#### Side Quests

- Optional character stories
- World building and lore
- Recurring characters
- Multi-part questlines

#### Mission Hall Quests

- Sect-based assignments
- Regular income source
- Combat and exploration focus
- Reputation building

#### Crafting Hall Quests

- Artisan skill development
- Technique acquisition
- Master-apprentice relationships
- Crafting system integration

#### Request Board Quests

- Community needs
- Quick objectives
- Immediate rewards
- Social system integration

#### Guild Quests

- Organization-specific content
- Exclusive storylines
- Guild advancement
- Factional conflicts

### Guild Specification

For guild category quests, specify the organization:

```typescript
category: 'guild',
guild: 'ShadowMoonSect' // Must match guild identifier
```

### Cost System

Optional upfront payment required to accept the quest. Only used by the Crafting Hall at this time:

```typescript
cost: 500; // Player pays 500 sect favour to start quest
```

### Failure Conditions

Optional string expression that causes quests to be removed from the quest list early:

```typescript
failureCondition: 'hp <= 0 && location == "DangerousLocation"';
```

**Common patterns:**

- **Death in specific locations**: `hp <= 0 && location == "ForbiddenRealm"`
- **Time limits**: `month > questStartMonth + 12`
- **Reputation thresholds**: `reputation.sect < -50`
- **Resource depletion**: `money <= 0 && items.food == 0`

Note quests are also removed when all the steps in the quest are completed. This is simply a way to remove the quest early.

## Reward System

Quests can show a preview of the rewards to be gained on quest completion. Note, the quest WILL NOT grant these itself, they need to be scripted in as part of an event. This is just a way to indicate this to the player:

```typescript
type QuestReward =
  | ItemQuestReward
  | MoneyQuestReward
  | FavourQuestReward
  | ReputationQuestReward
  | GuildApprovalQuestReward;
```

### Item Rewards

Grant specific items and quantities:

```typescript
{
  kind: 'item',
  item: { name: 'HealingPill' }, // Item descriptor
  amount: 5 // Quantity to give
}
```

### Spirit Stone Rewards

Provide direct currency:

```typescript
{
  kind: 'money',
  amount: 1000
}
```

### Favour Rewards

Grant sect favour points:

```typescript
{
  kind: 'favour',
  amount: 500
}
```

### Reputation Rewards

Modify standing with specific factions:

```typescript
{
  kind: 'reputation',
  amount: 25, // Reputation change
  name: 'NineMountainSect', // Faction identifier
  max?: 100 // Optional maximum reputation
}
```

### Guild Approval Rewards

Advance standing within guilds:

```typescript
{
  kind: 'approval',
  amount: 10, // Approval points
  guild: 'CraftingGuild' // Guild identifier
}
```

## Quest Design Philosophy

### Player Agency

Good quests provide meaningful choices that affect outcomes and character development. Use branching dialogue and multiple solution paths.

### Narrative Integration

Quests should feel natural within the world and contribute to character relationships, faction dynamics, and personal growth.

### Progressive Difficulty

Structure quests to match player progression, introducing new mechanics and challenges as cultivation advances.

### Emotional Investment

Create memorable characters and situations that players care about. The best quests have stakes beyond just mechanical rewards.

## Getting Started with Quest Creation

1. **Choose Your Category** - Determine the quest's purpose and audience
2. **Plan Your Narrative** - Outline the story, characters, and key moments
3. **Design Your Steps** - Break the experience into manageable objectives
4. **Write Your Events** - Create engaging dialogue and interactive moments
5. **Test Progression** - Ensure completion conditions work correctly
6. **Balance Rewards** - Match incentives to quest difficulty and story importance
