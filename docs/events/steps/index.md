---
layout: default
title: Event Step Types
parent: Events System
nav_order: 4
has_children: true
description: 'Complete reference for all event step types'
---

# Event Step Types

Comprehensive documentation for every type of event step available in AFNM. Each step type is designed for specific functionality, from basic text display to complex game state modifications.

## Step Categories

### Basic Interaction

- **[Text Step](text)** - Display narrative text and descriptions
- **[Speech Step](speech)** - Character dialogue and conversations
- **[Choice Step](choice)** - Player decision points and branching

### State Management

- **[Flag Step](flag)** - Set and modify flag values
- **[Conditional Step](conditional)** - Execute steps based on conditions

### Inventory & Resources

- **[Add Item Step](additem)** - Give items to player
- **[Remove Item Step](removeitem)** - Remove items from player
- **[Replace Item Step](replaceitem)** - Transform one item into another
- **[Money Step](money)** - Modify spirit stones
- **[Qi Step](qi)** - Adjust qi reserves
- **[Drop Item Step](dropitem)** - Random item selection from pools

### Character Interactions

- **[Approval Step](approval)** - Modify character approval ratings
- **[Progress Relationship Step](progressrelationship)** - Advance relationship tiers
- **[Team Up Step](teamup)** - Create temporary combat partnerships
- **[Clear Team Up Step](clearteamup)** - Remove all team-up partners
- **[Add Follower Step](addfollower)** - Add persistent follower companions
- **[Dual Cultivation Step](dualcultivation)** - Intimate cultivation sessions
- **[Talk To Character Step](talktocharacter)** - Open dialogue interface
- **[Trade With Character Step](tradewithcharacter)** - Open trading interface
- **[Craft With Character Step](craftwithcharacter)** - Collaborative crafting
- **[Fight Character Step](fightcharacter)** - Initiate combat encounters
- **[Set Character Step](setcharacter)** - Place NPCs at specific locations
- **[Clear Character Step](clearcharacter)** - Remove NPCs from locations
- **[Mark Beat Character Step](markbeatcharacter)** - Mark character as defeated
- **[Mark Did Encounter Step](markdidencounter)** - Track first character meetings
- **[Update Character Definition Step](updatecharacterdefinition)** - Evolve character behaviors

### World & Navigation

- **[Change Location Step](changelocation)** - Move player between locations
- **[Unlock Location Step](unlocklocation)** - Make new areas accessible
- **[Unlock Altar Step](unlockaltar)** - Unlock special altar locations
- **[Change Screen Step](changescreen)** - Navigate to different game interfaces
- **[Pass Time Step](passtime)** - Advance the game calendar
- **[Exit Step](exit)** - Terminate current event immediately
- **[Label Step](label)** - Create jump points for navigation
- **[Goto Label Step](gotolabel)** - Jump to labeled points in events

### Combat & Challenges

- **[Combat Step](combat)** - Battle encounters with enemies
- **[Crafting Step](crafting)** - Crafting challenges and mini-games
- **[Tournament Step](tournament)** - Competitive tournament brackets
- **[Stone Cutting Step](stonecutting)** - Jade stone gambling mini-games

### Progression & Systems

- **[Create Buff Step](createbuff)** - Apply temporary effects to player
- **[Consume Buff Step](consumebuff)** - Remove or reduce buff duration
- **[Add Quest Step](addquest)** - Start new questlines
- **[Change Favour Step](changefavour)** - Modify favour points
- **[Add Destiny Step](adddestiny)** - Modify destiny points
- **[Change Reputation Step](changereputation)** - Affect faction standings
- **[Change Hp Step](changehp)** - Modify player health
- **[Unlock Technique Step](unlocktechnique)** - Grant combat techniques
- **[Unlock Crafting Technique Step](unlockcraftingtechnique)** - Grant crafting techniques
- **[Add Recipe Step](addrecipe)** - Grant crafting recipes
- **[Give Item Step](giveitem)** - Interactive item selection from inventory
- **[Craft Skill Step](craftskill)** - Increase crafting skill points
- **[Change Physical Stat Step](changePhysicalStat)** - Increase/decrease physical statistics
- **[Change Social Stat Step](changeSocialStat)** - Increase/decrease social statistics

### Guild Systems

- **[Add Guild Approval Step](addguildapproval)** - Increase guild standing
- **[Advance Guild Rank Step](advanceguildrank)** - Promote player in guild

### Audio & Atmosphere

- **[Change BGM Step](changebgm)** - Change background music
- **[Clear Change BGM Step](clearchangebgm)** - Restore location music

### Advanced Systems

- **[Mark Calendar Event Complete Step](markcalendareventcomplete)** - Track monthly events
- **[Override Player Realm Step](overrideplayerrealm)** - Temporarily change perceived realm
- **[Set Aid Breakthrough Cooldown Step](setaidbreakthroughcooldown)** - Manage character aid timers

Each step type has its own dedicated page with detailed explanations, parameters, examples, and best practices for effective usage in your events.
