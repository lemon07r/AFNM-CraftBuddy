---
layout: default
title: Calendar Events
parent: Events System
nav_order: 5
---

# Calendar Events

Calendar events are time-based events that trigger automatically on specific dates in the game world. They provide seasonal content, festivals, and recurring events that add structure and immersion to the cultivation journey.

## Calendar Event Structure

Calendar events follow a specific structure tied to the game's year/month system:

```typescript
interface CalendarEvent {
  name: string; // Event identifier
  condition: string; // Availability condition
  year: number; // Starting year
  month: number; // Month (1-12)
  event?: GameEvent; // Event content (optional)
  location?: string; // Target location (optional)
  recurrenceYears: number; // Years between occurrences
  realm?: Realm; // Minimum realm requirement (optional)
}
```

## Basic Calendar Event

A simple location-triggered event with recurrence:

```typescript
const auctionEvent: CalendarEvent = {
  name: 'Chenmai Auction',
  condition: '1', // Always available
  year: 1066, // Starting year
  month: 4, // Fourth month
  recurrenceYears: 1, // Annual occurrence
  location: 'Shen Henda City', // Location trigger
};
```

## Event with Content

Festival with full event sequence:

```typescript
const springFestival: CalendarEvent = {
  name: 'Spring Blossom Festival',
  condition: '1',
  year: 1066,
  month: 3,
  recurrenceYears: 1,
  event: {
    location: 'Liang Tiao Village',
    steps: [
      {
        kind: 'text',
        text: "Cherry blossoms drift through the village as the annual spring festival begins. Cultivators gather to celebrate the season's renewal.",
      },
      {
        kind: 'choice',
        choices: [
          {
            text: 'Participate in poetry contest',
            children: [
              {
                kind: 'text',
                text: "Your verses about spring's beauty earn admiration from fellow cultivators.",
              },
              {
                kind: 'additem',
                item: 'festivalToken',
                amount: 1,
              },
            ],
          },
          {
            text: 'Watch technique demonstrations',
            children: [
              {
                kind: 'text',
                text: 'Masters demonstrate advanced cultivation methods. You gain valuable insights.',
              },
              {
                kind: 'qi',
                amount: 500,
              },
            ],
          },
        ],
      },
    ],
  },
};
```

## Conditional Calendar Events

Use conditions to gate events behind progression or flags:

```typescript
const beastWaveEvent: CalendarEvent = {
  name: 'Beast Wave',
  condition: 'returningHomeComplete == 1', // Requires quest completion
  year: 1066,
  month: 11,
  realm: 'bodyForging', // Minimum realm
  event: {
    location: 'Liang Tiao Village',
    steps: [
      {
        kind: 'text',
        text: 'A massive wave of corrupted beasts approaches the village. The cultivation community must unite to defend their home.',
      },
      {
        kind: 'combat',
        enemy: 'corruptedBeastHorde',
      },
    ],
  },
};
```

## Recurring Festivals

Create festivals that repeat every few years:

```typescript
const majorFestival: CalendarEvent = {
  name: 'Ru Gong Festival',
  condition: '1',
  year: 1066,
  month: 12,
  recurrenceYears: 6, // Every 6 years
  event: {
    location: 'Liang Tiao Village',
    steps: [
      {
        kind: 'text',
        text: 'The great Festival of Ru Gong honors the progenitor of blood cultivation. Scarlet streamers adorn every building as the village celebrates.',
      },
      {
        kind: 'choice',
        choices: [
          {
            text: 'Visit the tournament grounds',
            children: [
              {
                kind: 'tournament',
                participants: ['bloodCultivator1', 'bloodCultivator2'],
                rewards: {
                  first: [{ item: 'bloodyArrowTrophy', amount: 1 }],
                },
              },
            ],
          },
          {
            text: 'Browse the festival stalls',
            children: [
              {
                kind: 'text',
                text: 'Merchants from across the realm display rare cultivation resources and delicacies.',
              },
            ],
          },
        ],
      },
    ],
  },
};
```

## Registering Calendar Events

Add calendar events to your mod using the ModAPI:

```typescript
// Single event registration
window.modAPI.actions.addCalendarEvent(springFestival);

// Multiple events
const festivalEvents = [springFestival, beastWaveEvent, majorFestival];

festivalEvents.forEach((event) => {
  window.modAPI.actions.addCalendarEvent(event);
});
```

## Calendar System Details

### Timing Mechanics

- **Year**: Absolute year in the game world (starting around 1066)
- **Month**: 1-12, follows standard calendar progression
- **Recurrence**: Events repeat every `recurrenceYears` years
- **Conditions**: Must evaluate to true for event to trigger

### Event Activation

1. Game checks calendar events each month advance
2. Evaluates `condition` string for each eligible event
3. If conditions pass and timing matches, event triggers
4. Events with `location` trigger when player visits that location
5. Events with `event` content trigger immediately

### Best Practices

**Timing Strategy**

- Space major events throughout the year
- Use longer recurrence periods for special festivals
- Consider realm progression when setting start years

**Content Design**

- Make events feel significant and special
- Provide meaningful choices and rewards
- Connect events to world lore and progression

**Technical Considerations**

- Test condition strings thoroughly
- Ensure event content matches realm requirements
- Use descriptive names for easy identification

Calendar events provide rhythm and anticipation to the game world, marking important moments in the cultivation journey and creating memorable experiences tied to the passage of time.
