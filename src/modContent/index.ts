/**
 * CraftBuddy - Main Mod Content
 * 
 * Integrates the crafting optimizer with the game by wrapping existing harmony types
 * to inject our recommendation panel into the crafting UI.
 * 
 * Approach: We wrap the existing harmony type configs to add our processEffect
 * and renderComponent logic while preserving the original behavior.
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
  RecipeHarmonyType,
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
import {
  CraftBuddySettings,
  saveSettings,
  loadSettings,
} from '../settings';

// Global state for the optimizer
let currentRecommendation: SearchResult | null = null;
let currentConfig: OptimizerConfig | null = null;
let targetCompletion = 100;
let targetPerfection = 100;
let targetStability = 60;
let currentCompletion = 0;
let currentPerfection = 0;
let currentStability = 0;
let currentMaxStability = 60;
let nextConditions: CraftingCondition[] = [];
let conditionEffectsCache: RecipeConditionEffect | null = null;

// Toxicity tracking for alchemy crafting
let currentToxicity = 0;
let maxToxicity = 0;

// Cooldown tracking
let currentCooldowns: Map<string, number> = new Map();

// Current crafting type
let currentCraftingType: 'forge' | 'alchemical' | 'inscription' | 'resonance' = 'forge';

// Settings
let currentSettings: CraftBuddySettings = loadSettings();

// Store the last entity for rendering
let lastEntity: CraftingEntity | null = null;
let lastProgressState: ProgressState | null = null;

/**
 * Extract buff information from game's CraftingBuff array.
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
  let controlBuffMultiplier = 1.4;
  let intensityBuffMultiplier = 1.4;

  if (!buffs) return { controlBuffTurns, intensityBuffTurns, controlBuffMultiplier, intensityBuffMultiplier };

  for (const buff of buffs) {
    const name = (buff.name || '').toLowerCase();
    const stacks = buff.stacks || 0;
    
    if (name.includes('control') || name.includes('inner focus')) {
      controlBuffTurns = Math.max(controlBuffTurns, stacks);
      if (buff.stats?.control?.value !== undefined) {
        controlBuffMultiplier = 1 + buff.stats.control.value;
      }
    }
    if (name.includes('intensity') || name.includes('inner fire')) {
      intensityBuffTurns = Math.max(intensityBuffTurns, stacks);
      if (buff.stats?.intensity?.value !== undefined) {
        intensityBuffMultiplier = 1 + buff.stats.intensity.value;
      }
    }
  }

  return { controlBuffTurns, intensityBuffTurns, controlBuffMultiplier, intensityBuffMultiplier };
}

/**
 * Get condition multiplier from game's recipeConditionEffects.
 */
function getConditionMultiplier(
  condition: CraftingCondition | undefined,
  effectType: 'control' | 'intensity' | 'pool' | 'stability'
): number {
  if (!condition) return 1.0;
  
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
  
  const recipeConditionEffects = window.modAPI?.gameData?.recipeConditionEffects;
  if (recipeConditionEffects && recipeConditionEffects.length > 0) {
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
  
  return 1.0;
}

/**
 * Extract mastery bonuses from a technique's mastery array.
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
 */
function convertGameTechniques(
  techniques: CraftingTechnique[] | undefined
): SkillDefinition[] {
  if (!techniques || techniques.length === 0) {
    console.warn('[CraftBuddy] No techniques provided');
    return [];
  }

  const skills: SkillDefinition[] = [];

  for (const tech of techniques) {
    if (!tech) continue;

    const qiCost = tech.poolCost || 0;
    const stabilityCost = tech.stabilityCost || 0;
    const toxicityCost = tech.toxicityCost || 0;
    const techType = tech.type || 'support';
    const techName = tech.name || 'Unknown';
    const cooldown = tech.cooldown || 0;
    const preventsMaxStabilityDecay = tech.noMaxStabilityLoss === true;
    const mastery = extractMasteryBonuses(tech.mastery);

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
          baseCompletionGain = effect.amount?.value || 0;
          if (effect.amount?.stat) scalingStat = effect.amount.stat;
          break;
        case 'perfection':
          basePerfectionGain = effect.amount?.value || 0;
          if (effect.amount?.stat) scalingStat = effect.amount.stat;
          break;
        case 'stability':
          stabilityGain = effect.amount?.value || 0;
          break;
        case 'maxStability':
          maxStabilityChange = effect.amount?.value || 0;
          break;
        case 'cleanseToxicity':
          toxicityCleanse = effect.amount?.value || 0;
          break;
        case 'createBuff':
          const buff = effect.buff;
          const buffName = (buff?.name || '').toLowerCase();
          
          if (buffName.includes('control') || buffName.includes('inner focus')) {
            buffType = BuffType.CONTROL;
            if (buff?.stats?.control?.value) {
              buffMultiplier = 1 + (buff.stats.control.value || 0.4);
            }
          } else if (buffName.includes('intensity') || buffName.includes('inner fire')) {
            buffType = BuffType.INTENSITY;
            if (buff?.stats?.intensity?.value) {
              buffMultiplier = 1 + (buff.stats.intensity.value || 0.4);
            }
          }
          buffDuration = effect.stacks?.value || 2;
          break;
      }
    }

    const scalesWithIntensity = techType === 'fusion' || scalingStat === 'intensity';
    const scalesWithControl = techType === 'refine' || scalingStat === 'control';
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

  console.log(`[CraftBuddy] Loaded ${skills.length} techniques from game`);
  return skills;
}

/**
 * Build optimizer config from game entity stats.
 */
function buildConfigFromEntity(entity: CraftingEntity): OptimizerConfig {
  const stats = entity.stats;
  
  let baseControl = stats?.control || 10;
  let baseIntensity = stats?.intensity || 10;
  let maxQi = stats?.maxpool || 100;
  
  // @ts-ignore
  const entityMaxToxicity = stats?.maxtoxicity || 0;
  
  // @ts-ignore
  const realmModifier = entity?.realmModifier || entity?.craftingModifier || 1.0;
  if (realmModifier !== 1.0) {
    baseControl = Math.floor(baseControl * realmModifier);
    baseIntensity = Math.floor(baseIntensity * realmModifier);
  }
  
  const skills = convertGameTechniques(entity.techniques);
  
  let defaultBuffMultiplier = 1.4;
  for (const skill of skills) {
    if (skill.buffMultiplier && skill.buffMultiplier !== 1.0) {
      defaultBuffMultiplier = skill.buffMultiplier;
      break;
    }
  }
  
  console.log(`[CraftBuddy] Config: control=${baseControl}, intensity=${baseIntensity}, maxQi=${maxQi}`);
  
  return {
    maxQi,
    maxStability: targetStability,
    baseIntensity,
    baseControl,
    minStability: 10,
    skills,
    defaultBuffMultiplier,
    maxToxicity: maxToxicity || entityMaxToxicity,
    craftingType: currentCraftingType,
  };
}

/**
 * Update recommendation based on current crafting state.
 */
function updateRecommendation(
  entity: CraftingEntity,
  progressState: ProgressState
): void {
  // Store for rendering
  lastEntity = entity;
  lastProgressState = progressState;
  
  const pool = entity?.stats?.pool || 0;
  const stability = progressState?.stability || 0;
  const completion = progressState?.completion || 0;
  const perfection = progressState?.perfection || 0;
  const condition = progressState?.condition;
  const buffs = entity?.buffs;
  
  nextConditions = progressState?.nextConditions || [];
  
  currentCompletion = completion;
  currentPerfection = perfection;
  currentStability = stability;
  
  // @ts-ignore
  const gameToxicity = progressState?.toxicity ?? entity?.stats?.toxicity ?? 0;
  currentToxicity = gameToxicity;

  const { 
    controlBuffTurns, 
    intensityBuffTurns,
    controlBuffMultiplier,
    intensityBuffMultiplier 
  } = extractBuffInfo(buffs);
  
  const techniques = entity?.techniques || [];
  currentCooldowns = new Map();
  for (const tech of techniques) {
    if (tech && tech.currentCooldown && tech.currentCooldown > 0) {
      const key = tech.name.toLowerCase().replace(/\s+/g, '_');
      currentCooldowns.set(key, tech.currentCooldown);
    }
  }

  currentConfig = buildConfigFromEntity(entity);
  
  // @ts-ignore
  const gameMaxStability = progressState?.maxStability;
  if (gameMaxStability !== undefined && gameMaxStability > 0) {
    currentMaxStability = gameMaxStability;
  } else if (currentMaxStability <= 0 || currentMaxStability > targetStability) {
    currentMaxStability = targetStability;
  }

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

  const controlMultiplier = getConditionMultiplier(condition, 'control');
  const forecastedMultipliers: number[] = nextConditions.map(cond => 
    getConditionMultiplier(cond, 'control')
  );

  const lookaheadDepth = currentSettings.lookaheadDepth;
  currentRecommendation = findBestSkill(
    state,
    currentConfig,
    targetCompletion,
    targetPerfection,
    controlMultiplier,
    false,
    lookaheadDepth,
    forecastedMultipliers
  );
  
  console.log(`[CraftBuddy] Updated: Pool=${pool}, Stability=${stability}/${currentMaxStability}, Completion=${completion}/${targetCompletion}, Perfection=${perfection}/${targetPerfection}`);
  if (currentRecommendation?.recommendation) {
    console.log(`[CraftBuddy] Recommended: ${currentRecommendation.recommendation.skill.name}`);
  }
}

/**
 * Create the CraftBuddy harmony type config that wraps existing behavior.
 */
function createCraftBuddyHarmonyConfig(originalConfig: HarmonyTypeConfig | undefined, harmonyType: RecipeHarmonyType): HarmonyTypeConfig {
  return {
    name: originalConfig?.name || harmonyType,
    description: originalConfig?.description || '',
    
    initEffect: (harmonyData, entity: CraftingEntity) => {
      console.log(`[CraftBuddy] initEffect called for ${harmonyType}`);
      
      // Call original initEffect if it exists
      if (originalConfig?.initEffect) {
        originalConfig.initEffect(harmonyData, entity);
      }
      
      // Initialize our state
      currentRecommendation = null;
      currentCompletion = 0;
      currentPerfection = 0;
      currentStability = 0;
      currentMaxStability = targetStability;
      currentToxicity = 0;
      currentCooldowns = new Map();
      nextConditions = [];
      
      // Build initial config from entity
      currentConfig = buildConfigFromEntity(entity);
      lastEntity = entity;
      
      console.log(`[CraftBuddy] Initialized for ${harmonyType} crafting with ${entity.techniques?.length || 0} techniques`);
    },
    
    processEffect: (harmonyData, technique: CraftingTechnique, progressState: ProgressState, entity: CraftingEntity, state: GameCraftingState) => {
      console.log(`[CraftBuddy] processEffect called after ${technique.name}`);
      
      // Call original processEffect if it exists
      if (originalConfig?.processEffect) {
        originalConfig.processEffect(harmonyData, technique, progressState, entity, state);
      }
      
      // Track max stability decay
      // @ts-ignore
      const gameMaxStability = progressState?.maxStability ?? state?.maxStability;
      if (gameMaxStability === undefined || gameMaxStability <= 0) {
        const preventsDecay = technique?.noMaxStabilityLoss === true;
        if (!preventsDecay && currentMaxStability > 10) {
          currentMaxStability = Math.max(10, currentMaxStability - 1);
        }
        const effects = technique?.effects || [];
        for (const effect of effects) {
          if (effect?.kind === 'maxStability') {
            const change = effect.amount?.value || 0;
            currentMaxStability = Math.max(10, currentMaxStability + change);
          }
        }
      }
      
      // Update our recommendation
      updateRecommendation(entity, progressState);
    },
    
    renderComponent: (harmonyData) => {
      // Render original component if it exists
      const originalComponent = originalConfig?.renderComponent ? originalConfig.renderComponent(harmonyData) : null;
      
      // Create settings change handler
      const handleSettingsChange = (newSettings: CraftBuddySettings) => {
        currentSettings = newSettings;
      };
      
      // Create our recommendation panel
      const craftBuddyPanel = React.createElement(
        'div',
        {
          key: 'craftbuddy-panel',
          style: {
            position: 'absolute',
            top: '10px',
            right: '10px',
            zIndex: 1000,
            pointerEvents: 'auto',
          }
        },
        React.createElement(RecommendationPanel, {
          result: currentRecommendation,
          currentCompletion,
          currentPerfection,
          targetCompletion,
          targetPerfection,
          currentStability,
          currentMaxStability,
          settings: currentSettings,
          onSettingsChange: handleSettingsChange,
          targetStability,
          nextConditions,
          currentToxicity,
          maxToxicity,
          craftingType: currentCraftingType,
        })
      );
      
      // Return both the original component and our panel
      if (originalComponent) {
        return React.createElement(
          React.Fragment,
          null,
          originalComponent,
          craftBuddyPanel
        );
      }
      
      return craftBuddyPanel;
    },
  };
}

/**
 * Register CraftBuddy for all harmony types by wrapping existing configs.
 */
const harmonyTypes: RecipeHarmonyType[] = ['forge', 'alchemical', 'inscription', 'resonance'];

for (const harmonyType of harmonyTypes) {
  try {
    // Get the existing harmony config if any
    const existingConfig = window.modAPI?.gameData?.harmonyConfigs?.[harmonyType];
    
    // Create our wrapped config
    const craftBuddyConfig = createCraftBuddyHarmonyConfig(existingConfig, harmonyType);
    
    // Register it
    window.modAPI.actions.addHarmonyType(harmonyType, craftBuddyConfig);
    console.log(`[CraftBuddy] Registered harmony type wrapper for ${harmonyType}`);
  } catch (e) {
    console.error(`[CraftBuddy] Failed to register harmony type for ${harmonyType}:`, e);
  }
}

/**
 * Register lifecycle hooks for crafting events.
 */
try {
  window.modAPI.hooks.onDeriveRecipeDifficulty((recipe, recipeStats, gameFlags) => {
    console.log('[CraftBuddy] onDeriveRecipeDifficulty called for:', recipe?.name);
    
    if (recipeStats) {
      targetCompletion = recipeStats.completion || 100;
      targetPerfection = recipeStats.perfection || 100;
      targetStability = recipeStats.stability || 60;
      
      const conditionType = recipeStats.conditionType;
      if (conditionType) {
        conditionEffectsCache = conditionType;
      }
      
      console.log(`[CraftBuddy] Targets: completion=${targetCompletion}, perfection=${targetPerfection}, stability=${targetStability}`);
    }
    
    // @ts-ignore
    const recipeHarmonyType = recipe?.harmonyType || recipe?.type;
    if (recipeHarmonyType && ['forge', 'alchemical', 'inscription', 'resonance'].includes(recipeHarmonyType)) {
      currentCraftingType = recipeHarmonyType as typeof currentCraftingType;
    }
    
    const recipeStatsAny = recipeStats as any;
    if (recipeStatsAny?.maxToxicity) {
      maxToxicity = recipeStatsAny.maxToxicity;
    } else if (currentCraftingType === 'alchemical') {
      maxToxicity = 100;
    } else {
      maxToxicity = 0;
    }
    
    // Reset state
    currentRecommendation = null;
    currentCompletion = 0;
    currentPerfection = 0;
    currentStability = 0;
    currentMaxStability = targetStability;
    currentToxicity = 0;
    currentCooldowns = new Map();
    currentConfig = null;
    nextConditions = [];
    
    return recipeStats;
  });
  
  console.log('[CraftBuddy] Lifecycle hooks registered');
} catch (e) {
  console.error('[CraftBuddy] Failed to register lifecycle hooks:', e);
}

/**
 * Export debug functions to the window.
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
  getSettings: () => currentSettings,
  getLastEntity: () => lastEntity,
  getLastProgressState: () => lastProgressState,
  
  setTargets: (completion: number, perfection: number, stability?: number) => {
    targetCompletion = completion;
    targetPerfection = perfection;
    if (stability !== undefined) targetStability = stability;
    console.log(`[CraftBuddy] Targets set to: completion=${completion}, perfection=${perfection}, stability=${targetStability}`);
  },
  
  setLookaheadDepth: (depth: number) => {
    currentSettings = saveSettings({ lookaheadDepth: Math.max(1, Math.min(6, depth)) });
    console.log(`[CraftBuddy] Lookahead depth set to: ${currentSettings.lookaheadDepth}`);
  },
  
  togglePanel: () => {
    currentSettings = saveSettings({ panelVisible: !currentSettings.panelVisible });
    return currentSettings.panelVisible;
  },
  
  toggleCompact: () => {
    currentSettings = saveSettings({ compactMode: !currentSettings.compactMode });
    return currentSettings.compactMode;
  },
  
  logGameData: () => {
    console.log('[CraftBuddy] === Game Data Sources ===');
    console.log('recipeConditionEffects:', window.modAPI?.gameData?.recipeConditionEffects);
    console.log('craftingTechniques:', window.modAPI?.gameData?.craftingTechniques);
    console.log('harmonyConfigs:', window.modAPI?.gameData?.harmonyConfigs);
    console.log('Current config:', currentConfig);
    console.log('Condition effects cache:', conditionEffectsCache);
    console.log('Current settings:', currentSettings);
    console.log('Last entity:', lastEntity);
    console.log('Last progressState:', lastProgressState);
  },
  
  // Force update recommendation with stored entity/state
  forceUpdate: () => {
    if (lastEntity && lastProgressState) {
      updateRecommendation(lastEntity, lastProgressState);
      console.log('[CraftBuddy] Forced update');
    } else {
      console.log('[CraftBuddy] No entity/state stored yet');
    }
  },
};

/**
 * Register keyboard shortcuts.
 */
try {
  document.addEventListener('keydown', (event: KeyboardEvent) => {
    if (event.ctrlKey && event.shiftKey) {
      switch (event.key.toLowerCase()) {
        case 'c':
          event.preventDefault();
          currentSettings = saveSettings({ panelVisible: !currentSettings.panelVisible });
          console.log(`[CraftBuddy] Panel visibility: ${currentSettings.panelVisible}`);
          break;
        case 'm':
          event.preventDefault();
          currentSettings = saveSettings({ compactMode: !currentSettings.compactMode });
          console.log(`[CraftBuddy] Compact mode: ${currentSettings.compactMode}`);
          break;
      }
    }
  });
  console.log('[CraftBuddy] Keyboard shortcuts registered');
} catch (e) {
  console.warn('[CraftBuddy] Failed to register keyboard shortcuts:', e);
}

/**
 * Create title screen indicator.
 */
function createTitleScreenIndicator(): void {
  try {
    if (document.getElementById('craftbuddy-indicator')) {
      return;
    }

    const indicator = document.createElement('div');
    indicator.id = 'craftbuddy-indicator';
    indicator.innerHTML = '🔮 AFNM-CraftBuddy v1.9.0 Loaded';
    
    Object.assign(indicator.style, {
      position: 'fixed',
      top: '10px',
      right: '10px',
      padding: '8px 12px',
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      color: '#FFD700',
      fontFamily: 'sans-serif',
      fontSize: '12px',
      fontWeight: 'bold',
      borderRadius: '4px',
      border: '1px solid rgba(255, 215, 0, 0.5)',
      zIndex: '9999',
      pointerEvents: 'none',
      textShadow: '0 0 5px rgba(255, 215, 0, 0.5)',
      opacity: '1',
      transition: 'opacity 1s ease',
    });

    document.body.appendChild(indicator);
    console.log('[CraftBuddy] Title screen indicator created');

    setTimeout(() => {
      if (indicator) {
        indicator.style.opacity = '0';
        setTimeout(() => {
          if (indicator && indicator.parentNode) {
            indicator.parentNode.removeChild(indicator);
          }
        }, 1000);
      }
    }, 5000);
  } catch (e) {
    console.warn('[CraftBuddy] Failed to create title screen indicator:', e);
  }
}

createTitleScreenIndicator();

console.log('[CraftBuddy] Mod loaded successfully!');
console.log('[CraftBuddy] Debug: window.craftBuddyDebug.logGameData() to inspect data sources');

/**
 * Poll for Redux store and crafting state.
 * This is a fallback approach since harmony type wrappers don't work for existing types.
 */
let pollingInterval: ReturnType<typeof setInterval> | null = null;
let craftingPanelElement: HTMLElement | null = null;

function findReduxStore(): any {
  // Try common Redux store locations
  const w = window as any;
  return w.__REDUX_STORE__ || w.store || w.__store || w.reduxStore || null;
}

function getCraftingStateFromStore(store: any): any {
  if (!store || typeof store.getState !== 'function') return null;
  try {
    const state = store.getState();
    return state?.crafting || null;
  } catch (e) {
    return null;
  }
}

function createOrUpdateCraftingPanel(): void {
  if (!craftingPanelElement) {
    craftingPanelElement = document.createElement('div');
    craftingPanelElement.id = 'craftbuddy-panel';
    Object.assign(craftingPanelElement.style, {
      position: 'fixed',
      top: '80px',
      right: '10px',
      width: '320px',
      padding: '12px',
      backgroundColor: 'rgba(20, 20, 30, 0.95)',
      color: '#fff',
      fontFamily: 'sans-serif',
      fontSize: '13px',
      borderRadius: '8px',
      border: '1px solid rgba(255, 215, 0, 0.4)',
      zIndex: '10000',
      boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
      display: 'none',
    });
    document.body.appendChild(craftingPanelElement);
    console.log('[CraftBuddy] Crafting panel created');
  }
}

function updatePanelContent(): void {
  if (!craftingPanelElement || !currentRecommendation) return;
  
  const rec = currentRecommendation.recommendation;
  if (!rec) {
    craftingPanelElement.innerHTML = `
      <div style="color: #FFD700; font-weight: bold; margin-bottom: 8px;">🔮 CraftBuddy</div>
      <div style="color: #aaa;">${currentRecommendation.targetsMet ? '✓ Targets met!' : 'No valid actions available'}</div>
    `;
    return;
  }
  
  const typeColors: Record<string, string> = { fusion: '#00ff00', refine: '#00ffff', stabilize: '#ffa500', support: '#eb34db' };
  const color = typeColors[rec.skill.type] || '#fff';
  
  craftingPanelElement.innerHTML = `
    <div style="color: #FFD700; font-weight: bold; margin-bottom: 8px;">🔮 CraftBuddy Recommends</div>
    <div style="margin-bottom: 6px; color: #aaa; font-size: 11px;">
      Completion: ${currentCompletion}/${targetCompletion} | Perfection: ${currentPerfection}/${targetPerfection}
    </div>
    <div style="padding: 8px; background: rgba(0,100,0,0.3); border: 1px solid rgba(0,255,0,0.4); border-radius: 4px; margin-bottom: 8px;">
      <div style="color: ${color}; font-weight: bold; font-size: 15px;">${rec.skill.name}</div>
      <div style="color: #90EE90; font-size: 12px; margin-top: 4px;">
        ${rec.expectedGains.completion > 0 ? `+${rec.expectedGains.completion} Completion ` : ''}
        ${rec.expectedGains.perfection > 0 ? `+${rec.expectedGains.perfection} Perfection ` : ''}
        ${rec.expectedGains.stability > 0 ? `+${rec.expectedGains.stability} Stability` : ''}
      </div>
      <div style="color: #888; font-size: 11px; margin-top: 4px; font-style: italic;">${rec.reasoning}</div>
    </div>
  `;
}

function startCraftingPolling(): void {
  if (pollingInterval) return;
  
  createOrUpdateCraftingPanel();
  
  pollingInterval = setInterval(() => {
    const store = findReduxStore();
    const craftingState = getCraftingStateFromStore(store);
    
    if (craftingState?.player && craftingState?.progressState) {
      // We have active crafting!
      if (craftingPanelElement) craftingPanelElement.style.display = 'block';
      
      const entity = craftingState.player as CraftingEntity;
      const progress = craftingState.progressState as ProgressState;
      
      // Update if state changed
      if (progress.completion !== currentCompletion || progress.perfection !== currentPerfection || progress.stability !== currentStability) {
        updateRecommendation(entity, progress);
        updatePanelContent();
      }
    } else {
      // No active crafting
      if (craftingPanelElement) craftingPanelElement.style.display = 'none';
    }
  }, 500);
  
  console.log('[CraftBuddy] Started crafting state polling');
}

// Start polling after a short delay to let the game initialize
setTimeout(startCraftingPolling, 2000);

// Add debug function to find Redux store
(window as any).craftBuddyDebug.findStore = () => {
  console.log('[CraftBuddy] Searching for Redux store...');
  const w = window as any;
  
  // Check common locations
  const locations = ['__REDUX_STORE__', 'store', '__store', 'reduxStore', '__PRELOADED_STATE__'];
  for (const loc of locations) {
    if (w[loc]) {
      console.log(`[CraftBuddy] Found: window.${loc}`, w[loc]);
    }
  }
  
  // Search all window properties
  const found: string[] = [];
  for (const key of Object.keys(w)) {
    const val = w[key];
    if (val && typeof val === 'object') {
      if (typeof val.getState === 'function' || typeof val.dispatch === 'function') {
        found.push(key);
        console.log(`[CraftBuddy] Potential store at window.${key}:`, val);
      }
      if (key.toLowerCase().includes('redux') || key.toLowerCase().includes('store')) {
        console.log(`[CraftBuddy] Named match window.${key}:`, val);
      }
    }
  }
  
  // Check modAPI for store access
  if (w.modAPI) {
    console.log('[CraftBuddy] modAPI available:', Object.keys(w.modAPI));
    if (w.modAPI.screenAPI) {
      console.log('[CraftBuddy] screenAPI available:', Object.keys(w.modAPI.screenAPI));
    }
  }
  
  return found;
};

console.log('[CraftBuddy] Debug: Use window.craftBuddyDebug.findStore() to search for Redux store');
