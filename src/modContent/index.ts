/**
 * CraftBuddy - Main Mod Content
 * 
 * Integrates the crafting optimizer with the game using:
 * 1. Lifecycle hooks to capture crafting targets when crafting starts
 * 2. DOM injection to display the recommendation panel during crafting
 * 3. MutationObserver to detect crafting UI and inject our panel
 * 
 * IMPORTANT: This mod reads ALL values from the game API instead of using hardcoded defaults.
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import { 
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
import {
  CraftBuddySettings,
  getSettings,
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

// Panel container and React root
let panelContainer: HTMLDivElement | null = null;
let panelRoot: ReturnType<typeof ReactDOM.createRoot> | null = null;

// Crafting active flag
let isCraftingActive = false;

// Polling interval for state updates
let pollingInterval: number | null = null;

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
  
  console.log(`[CraftBuddy] Updated: Pool=${pool}, Stability=${stability}/${currentMaxStability}, Comp=${completion}, Perf=${perfection}`);
  
  // Re-render the panel
  renderPanel();
}

/**
 * Create and inject the panel container into the DOM.
 */
function createPanelContainer(): void {
  if (panelContainer) return;
  
  panelContainer = document.createElement('div');
  panelContainer.id = 'craftbuddy-panel-container';
  panelContainer.style.cssText = `
    position: fixed;
    top: 100px;
    right: 20px;
    z-index: 10000;
    pointer-events: auto;
  `;
  
  document.body.appendChild(panelContainer);
  panelRoot = ReactDOM.createRoot(panelContainer);
  
  console.log('[CraftBuddy] Panel container created');
}

/**
 * Remove the panel container from the DOM.
 */
function removePanelContainer(): void {
  if (panelRoot) {
    panelRoot.unmount();
    panelRoot = null;
  }
  
  if (panelContainer && panelContainer.parentNode) {
    panelContainer.parentNode.removeChild(panelContainer);
    panelContainer = null;
  }
  
  console.log('[CraftBuddy] Panel container removed');
}

/**
 * Render the recommendation panel.
 */
function renderPanel(): void {
  if (!panelRoot || !isCraftingActive) return;
  
  const handleSettingsChange = (newSettings: CraftBuddySettings) => {
    currentSettings = newSettings;
    renderPanel();
  };
  
  panelRoot.render(
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
}

/**
 * Start crafting session - called when crafting UI is detected.
 */
function startCraftingSession(): void {
  if (isCraftingActive) return;
  
  isCraftingActive = true;
  createPanelContainer();
  renderPanel();
  
  // Start polling for state updates
  startPolling();
  
  console.log('[CraftBuddy] Crafting session started');
}

/**
 * End crafting session - called when crafting UI is no longer detected.
 */
function endCraftingSession(): void {
  if (!isCraftingActive) return;
  
  isCraftingActive = false;
  stopPolling();
  removePanelContainer();
  
  // Reset state
  currentRecommendation = null;
  currentConfig = null;
  currentCompletion = 0;
  currentPerfection = 0;
  currentStability = 0;
  currentMaxStability = targetStability;
  currentToxicity = 0;
  currentCooldowns = new Map();
  nextConditions = [];
  
  console.log('[CraftBuddy] Crafting session ended');
}

/**
 * Poll for crafting state from the game's Redux store.
 */
function pollCraftingState(): void {
  try {
    // Try to access the Redux store through various methods
    // @ts-ignore - accessing internal game state
    const store = window.__REDUX_STORE__ || window.store || window.__store__;
    
    if (store && typeof store.getState === 'function') {
      const state = store.getState();
      const craftingState = state?.crafting;
      
      if (craftingState && craftingState.player && craftingState.progressState) {
        updateRecommendation(craftingState.player, craftingState.progressState);
      }
    }
  } catch (e) {
    // Silently ignore polling errors
  }
}

/**
 * Start polling for state updates.
 */
function startPolling(): void {
  if (pollingInterval) return;
  
  // Poll every 500ms
  pollingInterval = window.setInterval(pollCraftingState, 500);
  console.log('[CraftBuddy] Started polling for crafting state');
}

/**
 * Stop polling for state updates.
 */
function stopPolling(): void {
  if (pollingInterval) {
    window.clearInterval(pollingInterval);
    pollingInterval = null;
    console.log('[CraftBuddy] Stopped polling');
  }
}

/**
 * Check if crafting UI is currently visible.
 */
function isCraftingUIVisible(): boolean {
  // Look for crafting-specific elements in the DOM
  const craftingIndicators = [
    '[class*="crafting"]',
    '[class*="Crafting"]',
    '[data-testid*="crafting"]',
    '.crafting-panel',
    '.crafting-screen',
    '#crafting',
  ];
  
  for (const selector of craftingIndicators) {
    try {
      const element = document.querySelector(selector);
      if (element) {
        return true;
      }
    } catch (e) {
      // Invalid selector, skip
    }
  }
  
  // Also check for text content that indicates crafting
  const bodyText = document.body.innerText || '';
  if (bodyText.includes('Completion:') && bodyText.includes('Perfection:') && bodyText.includes('Stability:')) {
    return true;
  }
  
  return false;
}

/**
 * Set up MutationObserver to detect crafting UI.
 */
function setupCraftingDetection(): void {
  // Check periodically for crafting UI
  setInterval(() => {
    const craftingVisible = isCraftingUIVisible();
    
    if (craftingVisible && !isCraftingActive) {
      startCraftingSession();
    } else if (!craftingVisible && isCraftingActive) {
      endCraftingSession();
    }
  }, 1000);
  
  console.log('[CraftBuddy] Crafting detection set up');
}

/**
 * Register lifecycle hooks for crafting events.
 */
try {
  window.modAPI.hooks.onDeriveRecipeDifficulty((recipe, recipeStats, gameFlags) => {
    console.log('[CraftBuddy] Crafting started for recipe:', recipe?.name);
    
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
    
    // Start crafting session
    startCraftingSession();
    
    return recipeStats;
  });
  
  console.log('[CraftBuddy] Lifecycle hooks registered');
} catch (e) {
  console.error('[CraftBuddy] Failed to register lifecycle hooks:', e);
}

// Set up crafting detection
setupCraftingDetection();

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
    isCraftingActive,
  }),
  getCooldowns: () => Object.fromEntries(currentCooldowns),
  getNextConditions: () => nextConditions,
  getConditionEffects: () => conditionEffectsCache,
  getSettings: () => currentSettings,
  
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
    renderPanel();
    return currentSettings.panelVisible;
  },
  
  toggleCompact: () => {
    currentSettings = saveSettings({ compactMode: !currentSettings.compactMode });
    renderPanel();
    return currentSettings.compactMode;
  },
  
  // Manual controls for testing
  startSession: () => startCraftingSession(),
  endSession: () => endCraftingSession(),
  
  logGameData: () => {
    console.log('[CraftBuddy] === Game Data Sources ===');
    console.log('recipeConditionEffects:', window.modAPI?.gameData?.recipeConditionEffects);
    console.log('craftingTechniques:', window.modAPI?.gameData?.craftingTechniques);
    console.log('Current config:', currentConfig);
    console.log('Condition effects cache:', conditionEffectsCache);
    console.log('Current settings:', currentSettings);
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
          renderPanel();
          console.log(`[CraftBuddy] Panel visibility: ${currentSettings.panelVisible}`);
          break;
        case 'm':
          event.preventDefault();
          currentSettings = saveSettings({ compactMode: !currentSettings.compactMode });
          renderPanel();
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
    if (document.getElementById('craftbuddy-indicator')) return;

    const indicator = document.createElement('div');
    indicator.id = 'craftbuddy-indicator';
    indicator.innerHTML = '🔮 AFNM-CraftBuddy v1.7.0 Loaded';
    
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
console.log('[CraftBuddy] Using DOM injection approach for crafting UI');
console.log('[CraftBuddy] Debug: window.craftBuddyDebug.logGameData()');
