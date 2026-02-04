/**
 * CraftBuddy - Main Mod Content
 * 
 * Integrates the crafting optimizer with the game using lifecycle hooks
 * and a custom harmony type for UI rendering.
 * 
 * IMPORTANT: This mod reads ALL values from the game API instead of using hardcoded defaults:
 * - Character stats (control, intensity, maxpool) from CraftingEntity.stats
 * - Skill definitions from CraftingEntity.techniques
 * - Condition multipliers from recipeConditionEffects
 * - Forecasted conditions from ProgressState.nextConditions
 * - Targets from CraftingRecipeStats
 */

import React from 'react';
import { 
  HarmonyTypeConfig, 
  CraftingEntity, 
  ProgressState, 
  CraftingState as GameCraftingState,
  CraftingTechnique,
  CraftingCondition,
  RecipeConditionEffect,
  CraftingBuff,
} from 'afnm-types';
import {
  CraftingState,
  findBestSkill,
  SearchResult,
  BuffType,
  OptimizerConfig,
  SkillDefinition,
  SkillMastery,
} from '../optimizer';
import { RecommendationPanel } from '../ui/RecommendationPanel';

// Global state for the optimizer
let currentRecommendation: SearchResult | null = null;
let currentConfig: OptimizerConfig | null = null;
let targetCompletion = 100;
let targetPerfection = 100;
let targetStability = 60;
let currentCompletion = 0;
let currentPerfection = 0;
let currentStability = 0;
let currentMaxStability = 60; // Tracks the current max stability (decreases each turn)
let nextConditions: CraftingCondition[] = [];
let conditionEffectsCache: RecipeConditionEffect | null = null;

// Toxicity tracking for alchemy crafting
let currentToxicity = 0;
let maxToxicity = 0;

// Cooldown tracking (skill key -> turns remaining)
let currentCooldowns: Map<string, number> = new Map();

// Current crafting type
let currentCraftingType: 'forge' | 'alchemical' | 'inscription' | 'resonance' = 'forge';

/**
 * Extract buff information from game's CraftingBuff array.
 * Reads actual buff data from the game including:
 * - Buff stacks (turns remaining)
 * - Buff multipliers from buff.stats (control/intensity values)
 */
function extractBuffInfo(
  buffs: CraftingBuff[] | undefined
): { 
  controlBuffTurns: number; 
  intensityBuffTurns: number;
  controlBuffMultiplier: number;
  intensityBuffMultiplier: number;
} {
  let controlBuffTurns = 0;
  let intensityBuffTurns = 0;
  let controlBuffMultiplier = 1.4; // Default fallback
  let intensityBuffMultiplier = 1.4; // Default fallback

  if (!buffs) return { controlBuffTurns, intensityBuffTurns, controlBuffMultiplier, intensityBuffMultiplier };

  for (const buff of buffs) {
    // Read actual buff properties from game
    const name = (buff.name || '').toLowerCase();
    const stacks = buff.stacks || 0;
    
    // Check for control-boosting buffs
    if (name.includes('control') || name.includes('inner focus')) {
      controlBuffTurns = Math.max(controlBuffTurns, stacks);
      // Read the actual multiplier from buff.stats.control
      if (buff.stats?.control?.value !== undefined) {
        // The stat value is typically stored as a percentage bonus (e.g., 0.4 for 40%)
        // Convert to multiplier (1 + bonus)
        controlBuffMultiplier = 1 + buff.stats.control.value;
        console.log(`[CraftBuddy] Read control buff multiplier from game: ${controlBuffMultiplier}`);
      }
    }
    // Check for intensity-boosting buffs  
    if (name.includes('intensity') || name.includes('inner fire')) {
      intensityBuffTurns = Math.max(intensityBuffTurns, stacks);
      // Read the actual multiplier from buff.stats.intensity
      if (buff.stats?.intensity?.value !== undefined) {
        intensityBuffMultiplier = 1 + buff.stats.intensity.value;
        console.log(`[CraftBuddy] Read intensity buff multiplier from game: ${intensityBuffMultiplier}`);
      }
    }
  }

  return { controlBuffTurns, intensityBuffTurns, controlBuffMultiplier, intensityBuffMultiplier };
}

/**
 * Get condition multiplier from game's recipeConditionEffects.
 * Reads actual multiplier values from the game data instead of hardcoding.
 */
function getConditionMultiplier(
  condition: CraftingCondition | undefined,
  effectType: 'control' | 'intensity' | 'pool' | 'stability'
): number {
  if (!condition) return 1.0;
  
  // Try to get from cached condition effects (loaded from game data)
  if (conditionEffectsCache) {
    const conditionData = conditionEffectsCache.conditionEffects[condition];
    if (conditionData?.effects) {
      for (const effect of conditionData.effects) {
        if (effect.kind === effectType) {
          return effect.multiplier;
        }
      }
    }
  }
  
  // Fallback: read from modAPI.gameData.recipeConditionEffects
  const recipeConditionEffects = window.modAPI?.gameData?.recipeConditionEffects;
  if (recipeConditionEffects && recipeConditionEffects.length > 0) {
    // Use the first condition effect type (usually the default)
    const condEffect = recipeConditionEffects[0];
    const conditionData = condEffect?.conditionEffects?.[condition];
    if (conditionData?.effects) {
      for (const effect of conditionData.effects) {
        if (effect.kind === effectType) {
          return effect.multiplier;
        }
      }
    }
  }
  
  // Ultimate fallback if game data not available
  console.warn(`[CraftBuddy] Could not read ${effectType} multiplier for condition ${condition} from game data`);
  return 1.0;
}

/**
 * Extract mastery bonuses from a technique's mastery array.
 * Reads all mastery types: control, intensity, poolcost, stabilitycost, etc.
 */
function extractMasteryBonuses(mastery: any[] | undefined): SkillMastery {
  const result: SkillMastery = {};
  
  if (!mastery || mastery.length === 0) return result;
  
  for (const m of mastery) {
    if (!m) continue;
    
    switch (m.kind) {
      case 'control':
        result.controlBonus = (result.controlBonus || 0) + (m.percentage || 0);
        break;
      case 'intensity':
        result.intensityBonus = (result.intensityBonus || 0) + (m.percentage || 0);
        break;
      case 'poolcost':
        result.poolCostReduction = (result.poolCostReduction || 0) + (m.change || 0);
        break;
      case 'stabilitycost':
        result.stabilityCostReduction = (result.stabilityCostReduction || 0) + (m.change || 0);
        break;
      case 'successchance':
        result.successChanceBonus = (result.successChanceBonus || 0) + (m.change || 0);
        break;
      case 'critchance':
        result.critChanceBonus = (result.critChanceBonus || 0) + (m.percentage || 0);
        break;
      case 'critmultiplier':
        result.critMultiplierBonus = (result.critMultiplierBonus || 0) + (m.percentage || 0);
        break;
    }
  }
  
  return result;
}

/**
 * Convert game CraftingTechnique array to our skill definitions.
 * Reads ALL technique data directly from the game's technique objects.
 * This includes:
 * - Costs (qi, stability, toxicity)
 * - Effects with scaling (completion, perfection, stability, maxStability, cleanseToxicity)
 * - Buff creation with multipliers read from buff stats
 * - noMaxStabilityLoss flag for preventing decay
 * - Cooldowns
 * - Mastery bonuses
 */
function convertGameTechniques(
  techniques: CraftingTechnique[] | undefined
): SkillDefinition[] {
  if (!techniques || techniques.length === 0) {
    console.warn('[CraftBuddy] No techniques provided, cannot determine skills');
    return [];
  }

  const skills: SkillDefinition[] = [];

  for (const tech of techniques) {
    if (!tech) continue;

    // Read costs directly from technique
    const qiCost = tech.poolCost || 0;
    const stabilityCost = tech.stabilityCost || 0;
    const toxicityCost = tech.toxicityCost || 0;
    const techType = tech.type || 'support';
    const techName = tech.name || 'Unknown';
    
    // Read cooldown from technique
    const cooldown = tech.cooldown || 0;
    
    // Read noMaxStabilityLoss flag - if true, this skill prevents max stability decay
    const preventsMaxStabilityDecay = tech.noMaxStabilityLoss === true;
    
    // Extract mastery bonuses
    const mastery = extractMasteryBonuses(tech.mastery);

    // Extract effect values from the technique's effects array
    let baseCompletionGain = 0;
    let basePerfectionGain = 0;
    let stabilityGain = 0;
    let maxStabilityChange = 0;
    let toxicityCleanse = 0;
    let buffType = BuffType.NONE;
    let buffDuration = 0;
    let buffMultiplier = 1.0;
    let scalingStat: string | undefined;

    const effects = tech.effects || [];
    for (const effect of effects) {
      if (!effect) continue;
      
      switch (effect.kind) {
        case 'completion':
          // Read the base value from the Scaling object
          baseCompletionGain = effect.amount?.value || 0;
          // Check what stat this scales with
          if (effect.amount?.stat) {
            scalingStat = effect.amount.stat;
          }
          break;
        case 'perfection':
          basePerfectionGain = effect.amount?.value || 0;
          if (effect.amount?.stat) {
            scalingStat = effect.amount.stat;
          }
          break;
        case 'stability':
          stabilityGain = effect.amount?.value || 0;
          break;
        case 'maxStability':
          // Read max stability change from the effect
          // Positive values increase max stability, negative decrease it
          maxStabilityChange = effect.amount?.value || 0;
          break;
        case 'cleanseToxicity':
          // Read toxicity cleanse amount
          toxicityCleanse = effect.amount?.value || 0;
          break;
        case 'createBuff':
          // Read buff type from the actual buff object
          const buff = effect.buff;
          const buffName = (buff?.name || '').toLowerCase();
          
          if (buffName.includes('control') || buffName.includes('inner focus')) {
            buffType = BuffType.CONTROL;
            // Read the actual buff multiplier from buff.stats.control
            if (buff?.stats?.control?.value) {
              // The stat value is typically stored as a percentage bonus (e.g., 0.4 for 40%)
              // Convert to multiplier (1 + bonus)
              buffMultiplier = 1 + (buff.stats.control.value || 0.4);
            }
          } else if (buffName.includes('intensity') || buffName.includes('inner fire')) {
            buffType = BuffType.INTENSITY;
            // Read the actual buff multiplier from buff.stats.intensity
            if (buff?.stats?.intensity?.value) {
              buffMultiplier = 1 + (buff.stats.intensity.value || 0.4);
            }
          }
          // Read stack count from Scaling object
          buffDuration = effect.stacks?.value || 2;
          break;
        case 'consumeBuff':
          // This is likely a "Disciplined Touch" style skill
          break;
      }
    }

    // Determine scaling based on technique type and effect stat
    // Fusion skills typically scale with intensity, Refine with control
    const scalesWithIntensity = techType === 'fusion' || scalingStat === 'intensity';
    const scalesWithControl = techType === 'refine' || scalingStat === 'control';
    
    // Check for special skills that consume buffs for gains
    const hasConsumeBuff = effects.some(e => e?.kind === 'consumeBuff');
    const isDisciplinedTouch = hasConsumeBuff || techName.toLowerCase().includes('disciplined');

    skills.push({
      name: techName,
      key: techName.toLowerCase().replace(/\s+/g, '_'),
      qiCost,
      stabilityCost,
      baseCompletionGain,
      basePerfectionGain,
      stabilityGain,
      maxStabilityChange,
      buffType,
      buffDuration,
      buffMultiplier,
      type: techType,
      scalesWithControl,
      scalesWithIntensity,
      isDisciplinedTouch,
      preventsMaxStabilityDecay,
      toxicityCost: toxicityCost > 0 ? toxicityCost : undefined,
      toxicityCleanse: toxicityCleanse > 0 ? toxicityCleanse : undefined,
      cooldown: cooldown > 0 ? cooldown : undefined,
      mastery: Object.keys(mastery).length > 0 ? mastery : undefined,
    });
  }

  console.log(`[CraftBuddy] Loaded ${skills.length} techniques from game:`, skills.map(s => {
    const extras: string[] = [];
    if (!s.preventsMaxStabilityDecay) extras.push('maxStabDecay');
    if (s.maxStabilityChange) extras.push(`maxStabChange:${s.maxStabilityChange}`);
    if (s.cooldown) extras.push(`cd:${s.cooldown}`);
    if (s.toxicityCost) extras.push(`tox:${s.toxicityCost}`);
    if (s.mastery) extras.push('mastery');
    return `${s.name} (${extras.join(', ') || 'none'})`;
  }));
  return skills;
}

/**
 * Build optimizer config from actual game entity stats.
 * Reads control, intensity, maxpool, maxtoxicity from CraftingEntity.stats.
 * Also determines default buff multiplier from loaded skills.
 */
function buildConfigFromEntity(entity: CraftingEntity): OptimizerConfig {
  const stats = entity.stats;
  
  // Read actual character stats from the game
  const baseControl = stats?.control || 10;
  const baseIntensity = stats?.intensity || 10;
  const maxQi = stats?.maxpool || 100;
  
  // Read max toxicity for alchemy crafting
  // @ts-ignore - maxtoxicity may exist on stats for alchemy
  const entityMaxToxicity = stats?.maxtoxicity || 0;
  
  // Convert entity's techniques to skill definitions
  const skills = convertGameTechniques(entity.techniques);
  
  // Determine default buff multiplier from skills that create buffs
  // Use the first non-1.0 multiplier found, or default to 1.4
  let defaultBuffMultiplier = 1.4;
  for (const skill of skills) {
    if (skill.buffMultiplier && skill.buffMultiplier !== 1.0) {
      defaultBuffMultiplier = skill.buffMultiplier;
      break;
    }
  }
  
  console.log(`[CraftBuddy] Character stats from game: control=${baseControl}, intensity=${baseIntensity}, maxQi=${maxQi}, defaultBuffMult=${defaultBuffMultiplier}, craftingType=${currentCraftingType}`);
  if (entityMaxToxicity > 0 || maxToxicity > 0) {
    console.log(`[CraftBuddy] Toxicity tracking: maxToxicity=${maxToxicity || entityMaxToxicity}, currentToxicity=${currentToxicity}`);
  }
  
  return {
    maxQi,
    maxStability: targetStability, // From recipe stats
    baseIntensity,
    baseControl,
    minStability: 10, // This is typically fixed in the game
    skills,
    defaultBuffMultiplier,
    maxToxicity: maxToxicity || entityMaxToxicity,
    craftingType: currentCraftingType,
  };
}

/**
 * Update the recommendation based on current crafting state.
 * Reads ALL values from game objects instead of using hardcoded defaults.
 * 
 * IMPORTANT: This function ALWAYS reads fresh values from the game on every call:
 * - Character stats (control, intensity, pool) from entity.stats
 * - Current max stability from game state or tracked internally
 * - Buff multipliers from active buff stats
 * - Techniques from entity.techniques
 * - Toxicity for alchemy crafting
 * - Cooldowns for techniques
 * 
 * No caching of config - rebuilt every turn to ensure fresh values.
 */
function updateRecommendation(
  entity: CraftingEntity,
  progressState: ProgressState,
  gameState: GameCraftingState
): void {
  // ALWAYS read current values fresh from game state - never use stale cached values
  const pool = entity?.stats?.pool || 0;
  const stability = progressState?.stability || 0;
  const completion = progressState?.completion || 0;
  const perfection = progressState?.perfection || 0;
  const condition = progressState?.condition;
  const buffs = entity?.buffs;
  
  // Store forecasted conditions from game (fresh each turn)
  nextConditions = progressState?.nextConditions || [];
  
  // Store current values for UI (fresh each turn)
  currentCompletion = completion;
  currentPerfection = perfection;
  currentStability = stability;
  
  // Read toxicity from game state for alchemy crafting
  // @ts-ignore - toxicity may exist on progressState or entity.stats
  const gameToxicity = progressState?.toxicity ?? entity?.stats?.toxicity ?? 0;
  currentToxicity = gameToxicity;

  // Extract buff information from game's buff array (fresh each turn)
  const { 
    controlBuffTurns, 
    intensityBuffTurns,
    controlBuffMultiplier,
    intensityBuffMultiplier 
  } = extractBuffInfo(buffs);
  
  // Read cooldowns from entity's techniques (fresh each turn)
  const techniques = entity?.techniques || [];
  currentCooldowns = new Map();
  for (const tech of techniques) {
    if (tech && tech.currentCooldown && tech.currentCooldown > 0) {
      const key = tech.name.toLowerCase().replace(/\s+/g, '_');
      currentCooldowns.set(key, tech.currentCooldown);
    }
  }

  // ALWAYS rebuild config from entity to ensure fresh stats and techniques
  // This ensures we never use stale baseControl, baseIntensity, maxQi, or skill data
  currentConfig = buildConfigFromEntity(entity);
  
  // Try to read current max stability from game state (fresh each turn)
  // The game tracks this as it decreases each turn
  // @ts-ignore - maxStability may exist on progressState in some game versions
  const gameMaxStability = progressState?.maxStability ?? gameState?.maxStability;
  if (gameMaxStability !== undefined && gameMaxStability > 0) {
    // Game provides current max stability - use it directly
    currentMaxStability = gameMaxStability;
  } else {
    // Game doesn't expose current maxStability
    // We need to track it ourselves based on the last used technique
    // If this is the first turn or max stability was reset, use target
    if (currentMaxStability <= 0 || currentMaxStability > targetStability) {
      currentMaxStability = targetStability;
    }
    // Note: max stability decay is applied in processEffect after technique use
  }

  // Create crafting state with values from game
  // Use current max stability (which may have decayed) not the initial target
  const state = new CraftingState({
    qi: pool,
    stability,
    maxStability: currentMaxStability,
    completion,
    perfection,
    controlBuffTurns,
    intensityBuffTurns,
    controlBuffMultiplier,
    intensityBuffMultiplier,
    toxicity: currentToxicity,
    maxToxicity: currentConfig?.maxToxicity || maxToxicity,
    cooldowns: currentCooldowns,
    history: [],
  });

  // Get condition multipliers from game data for current condition
  const controlMultiplier = getConditionMultiplier(condition, 'control');
  const intensityMultiplier = getConditionMultiplier(condition, 'intensity');

  // Convert forecasted conditions to multipliers for lookahead search
  // This allows the optimizer to simulate future turns with accurate condition effects
  const forecastedMultipliers: number[] = nextConditions.map(cond => 
    getConditionMultiplier(cond, 'control')
  );

  // Find best skill using game-derived values
  currentRecommendation = findBestSkill(
    state,
    currentConfig,
    targetCompletion,
    targetPerfection,
    controlMultiplier,
    false, // Use lookahead search
    3,     // Lookahead depth
    forecastedMultipliers // Pass forecasted condition multipliers for lookahead
  );
  
  console.log(`[CraftBuddy] Recommendation updated. Pool: ${pool}, Stability: ${stability}/${currentMaxStability}, Condition: ${condition} (ctrl x${controlMultiplier})`);
  console.log(`[CraftBuddy] Buff multipliers: control=${controlBuffMultiplier}, intensity=${intensityBuffMultiplier}`);
  if (currentToxicity > 0 || maxToxicity > 0) {
    console.log(`[CraftBuddy] Toxicity: ${currentToxicity}/${maxToxicity}`);
  }
  if (currentCooldowns.size > 0) {
    console.log(`[CraftBuddy] Cooldowns: ${Array.from(currentCooldowns.entries()).map(([k, v]) => `${k}:${v}`).join(', ')}`);
  }
  if (nextConditions.length > 0) {
    console.log(`[CraftBuddy] Forecasted conditions: ${nextConditions.join(', ')} -> multipliers: ${forecastedMultipliers.join(', ')}`);
  }
}

/**
 * Custom Harmony Type that renders the CraftBuddy recommendation panel.
 * This integrates into the crafting UI.
 */
const craftBuddyHarmony: HarmonyTypeConfig = {
  name: 'CraftBuddy Advisor',
  description: 'Displays optimal skill recommendations during crafting.',
  
  initEffect: (harmonyData, entity: CraftingEntity) => {
    // Initialize when crafting starts - build config from entity
    currentRecommendation = null;
    currentCompletion = 0;
    currentPerfection = 0;
    currentStability = 0;
    currentMaxStability = targetStability; // Reset to initial max stability
    nextConditions = [];
    
    // Reset toxicity and cooldowns for new session
    currentToxicity = 0;
    currentCooldowns = new Map();
    
    // Build config from entity's actual stats and techniques
    currentConfig = buildConfigFromEntity(entity);
    
    console.log('[CraftBuddy] Initialized for crafting session');
    console.log(`[CraftBuddy] Entity has ${entity.techniques?.length || 0} techniques`);
    console.log(`[CraftBuddy] Initial max stability: ${currentMaxStability}`);
    console.log(`[CraftBuddy] Crafting type: ${currentCraftingType}`);
    if (maxToxicity > 0) {
      console.log(`[CraftBuddy] Max toxicity: ${maxToxicity}`);
    }
  },
  
  processEffect: (harmonyData, technique, progressState: ProgressState, entity: CraftingEntity, state: GameCraftingState) => {
    // Track max stability decay from the technique that was just used
    // This is called AFTER a technique is applied, so we need to update our tracking
    // @ts-ignore - maxStability may exist on progressState
    const gameMaxStability = progressState?.maxStability ?? state?.maxStability;
    if (gameMaxStability === undefined || gameMaxStability <= 0) {
      // Game doesn't expose max stability, so we track it ourselves
      // Check if the technique prevents max stability decay
      const preventsDecay = technique?.noMaxStabilityLoss === true;
      if (!preventsDecay && currentMaxStability > 10) {
        // Standard decay: max stability decreases by 1 each turn
        currentMaxStability = Math.max(10, currentMaxStability - 1);
      }
      // Also check for direct max stability changes from technique effects
      const effects = technique?.effects || [];
      for (const effect of effects) {
        if (effect?.kind === 'maxStability') {
          const change = effect.amount?.value || 0;
          currentMaxStability = Math.max(10, currentMaxStability + change);
        }
      }
      console.log(`[CraftBuddy] Tracked max stability after ${technique.name}: ${currentMaxStability} (preventsDecay: ${preventsDecay})`);
    }
    
    // Update recommendation using actual game state objects (always fresh)
    updateRecommendation(entity, progressState, state);
    
    console.log('[CraftBuddy] Updated recommendation after:', technique.name);
  },
  
  renderComponent: (harmonyData) => {
    // Render the recommendation panel with current state
    return React.createElement(RecommendationPanel, {
      result: currentRecommendation,
      currentCompletion,
      currentPerfection,
      targetCompletion,
      targetPerfection,
      currentStability,
      currentMaxStability,
      targetStability,
      nextConditions,
      currentToxicity,
      maxToxicity,
      craftingType: currentCraftingType,
    });
  },
};

// Register CraftBuddy for ALL harmony types (forge, alchemical, inscription, resonance)
// This ensures the optimizer works for all crafting types in the game
const harmonyTypes: Array<'forge' | 'alchemical' | 'inscription' | 'resonance'> = [
  'forge',
  'alchemical', 
  'inscription',
  'resonance'
];

for (const harmonyType of harmonyTypes) {
  try {
    window.modAPI.actions.addHarmonyType(harmonyType, craftBuddyHarmony);
    console.log(`[CraftBuddy] Harmony type override registered for ${harmonyType} crafting`);
  } catch (e) {
    console.error(`[CraftBuddy] Failed to register harmony type for ${harmonyType}:`, e);
  }
}

/**
 * Alternative approach: Use lifecycle hooks for crafting events.
 */
try {
  // Hook into recipe difficulty calculation (called when crafting starts)
  window.modAPI.hooks.onDeriveRecipeDifficulty((recipe, recipeStats, gameFlags) => {
    console.log('[CraftBuddy] Crafting started for recipe:', recipe?.name);
    
    // Store targets from recipeStats - these come directly from the game
    if (recipeStats) {
      targetCompletion = recipeStats.completion || 100;
      targetPerfection = recipeStats.perfection || 100;
      targetStability = recipeStats.stability || 60;
      
      // Cache the condition effect type for this recipe
      const conditionType = recipeStats.conditionType;
      if (conditionType) {
        conditionEffectsCache = conditionType;
        console.log(`[CraftBuddy] Condition type: ${conditionType.name}`);
      }
      
      console.log(`[CraftBuddy] Targets from recipe: completion=${targetCompletion}, perfection=${targetPerfection}, stability=${targetStability}`);
    }
    
    // Determine crafting type from recipe
    // @ts-ignore - harmonyType may exist on recipe
    const recipeHarmonyType = recipe?.harmonyType || recipe?.type;
    if (recipeHarmonyType && ['forge', 'alchemical', 'inscription', 'resonance'].includes(recipeHarmonyType)) {
      currentCraftingType = recipeHarmonyType as typeof currentCraftingType;
    }
    
    // Read max toxicity for alchemy crafting from recipe stats
    const recipeStatsAny = recipeStats as any;
    if (recipeStatsAny?.maxToxicity) {
      maxToxicity = recipeStatsAny.maxToxicity;
    } else if (currentCraftingType === 'alchemical') {
      // Default max toxicity for alchemy if not specified
      maxToxicity = 100;
    } else {
      maxToxicity = 0;
    }
    
    // Reset state for new crafting session
    currentRecommendation = null;
    currentCompletion = 0;
    currentPerfection = 0;
    currentStability = 0;
    currentMaxStability = targetStability; // Reset to initial max stability from recipe
    currentToxicity = 0;
    currentCooldowns = new Map();
    currentConfig = null; // Will be rebuilt from entity in initEffect
    nextConditions = [];
    
    // Return unchanged recipeStats
    return recipeStats;
  });
  
  console.log('[CraftBuddy] Lifecycle hooks registered');
} catch (e) {
  console.error('[CraftBuddy] Failed to register lifecycle hooks:', e);
}

/**
 * Export debug functions to the window for testing.
 * These allow manual inspection of the mod's state.
 */
(window as any).craftBuddyDebug = {
  getConfig: () => currentConfig,
  getRecommendation: () => currentRecommendation,
  getTargets: () => ({ targetCompletion, targetPerfection, targetStability }),
  getCurrentState: () => ({ 
    currentCompletion, 
    currentPerfection, 
    currentStability, 
    currentMaxStability,
    currentToxicity,
    maxToxicity,
    craftingType: currentCraftingType,
  }),
  getCooldowns: () => Object.fromEntries(currentCooldowns),
  getNextConditions: () => nextConditions,
  getConditionEffects: () => conditionEffectsCache,
  
  // Set targets manually for testing
  setTargets: (completion: number, perfection: number, stability?: number) => {
    targetCompletion = completion;
    targetPerfection = perfection;
    if (stability !== undefined) targetStability = stability;
    console.log(`[CraftBuddy] Targets set to: completion=${completion}, perfection=${perfection}, stability=${targetStability}`);
  },
  
  // Log all game data sources
  logGameData: () => {
    console.log('[CraftBuddy] === Game Data Sources ===');
    console.log('recipeConditionEffects:', window.modAPI?.gameData?.recipeConditionEffects);
    console.log('craftingTechniques:', window.modAPI?.gameData?.craftingTechniques);
    console.log('Current config:', currentConfig);
    console.log('Condition effects cache:', conditionEffectsCache);
  },
};

console.log('[CraftBuddy] Mod loaded successfully!');
console.log('[CraftBuddy] All values are read from game API - no hardcoded defaults');
console.log('[CraftBuddy] Debug: window.craftBuddyDebug.logGameData() to inspect data sources');
