---
layout: default
title: Mark Calendar Event Complete Step
parent: Event Step Types
grand_parent: Events System
nav_order: 28
description: 'Mark calendar events as completed to prevent re-triggering'
---

# Mark Calendar Event Complete Step

## Introduction

The Mark Calendar Event Complete Step marks calendar events as completed for the current month, preventing them from being triggered again during that time period. This is essential for calendar-based events like auctions and festivals.

## Interface

```typescript
interface MarkCalendarEventCompleteStep {
  kind: 'markCalendarEventComplete';
  condition?: string;
  event: string;
}
```

## Properties

**`kind`** - Always `'markCalendarEventComplete'`

**`event`** - Calendar event identifier

- String that uniquely identifies the calendar event to mark as complete
- Must match the format: `{CalendarEvent.name}_{CalendarEvent.location}`
- Case-sensitive and must exactly match the calendar event definition

**`condition`** (optional) - Conditional execution

- Flag expression that must be true for the event to be marked complete
- Step is skipped if condition fails

## Examples

### Simple Event Completion

```typescript
{
  kind: 'markCalendarEventComplete',
  event: 'Chenmai Auction_Shen Henda City'
}
```
