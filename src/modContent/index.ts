/**
 * CraftBuddy - Main Mod Content
 * 
 * Integrates the crafting optimizer with the game using a DOM-based overlay
 * that detects crafting state and displays recommendations.
 * 
 * Approach: Since addHarmonyType doesn't override existing harmony types,
 * we use DOM observation to detect when crafting UI is visible and inject
 * our recommendation panel as an overlay.
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import { 
  CraftingEntity, 
  ProgressState, 
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

// DOM overlay elements
let overlayContainer: HTMLDivElement | null = null;
let reactRoot: ReactDOM.Root | null = null;
let isOverlayVisible = false;

// Polling interval for crafting state detection
let pollingInterval: number | null = null;
const POLL_INTERVAL_MS = 500;

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
  
  // Update the overlay
  renderOverlay();
}

/**
 * Create the overlay container for our panel.
 */
function createOverlayContainer(): void {
  if (overlayContainer) return;
  
  overlayContainer = document.createElement('div');
  overlayContainer.id = 'craftbuddy-overlay';
  Object.assign(overlayContainer.style, {
    position: 'fixed',
    top: '10px',
    right: '10px',
    zIndex: '10000',
    pointerEvents: 'auto',
  });
  
  document.body.appendChild(overlayContainer);
  reactRoot = ReactDOM.createRoot(overlayContainer);
  console.log('[CraftBuddy] Overlay container created');
}

/**
 * Render the recommendation panel in the overlay.
 */
function renderOverlay(): void {
  if (!overlayContainer || !reactRoot) {
    createOverlayContainer();
  }
  
  if (!reactRoot || !currentSettings.panelVisible) {
    if (reactRoot && overlayContainer) {
      overlayContainer.style.display = 'none';
    }
    return;
  }
  
  overlayContainer!.style.display = 'block';
  
  const handleSettingsChange = (newSettings: CraftBuddySettings) => {
    currentSettings = newSettings;
    renderOverlay();
  };
  
  const panel = React.createElement(RecommendationPanel, {
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
  });
  
  reactRoot.render(panel);
}

/**
 * Hide the overlay.
 */
function hideOverlay(): void {
  if (overlayContainer) {
    overlayContainer.style.display = 'none';
  }
  isOverlayVisible = false;
}

/**
 * Show the overlay.
 */
function showOverlay(): void {
  if (overlayContainer) {
    overlayContainer.style.display = 'block';
  }
  isOverlayVisible = true;
  renderOverlay();
}

/**
 * Try to find the Redux store from the window object or React fiber tree.
 * The game uses React 19 with a different fiber structure.
 */
function findReduxStore(): any {
  const win = window as any;
  
  // Check common locations for Redux store
  if (win.store) return win.store;
  if (win.__REDUX_STORE__) return win.__REDUX_STORE__;
  if (win.reduxStore) return win.reduxStore;
  if (win.__store__) return win.__store__;
  
  // Check if modAPI exposes any state access
  if (win.modAPI?.gameState) return { getState: () => win.modAPI.gameState };
  
  // Try to find store from React fiber tree
  try {
    const rootElement = document.getElementById('root') || document.getElementById('app');
    if (rootElement) {
      // Find React fiber key (React 18/19 format)
      const reactKey = Object.keys(rootElement).find(key => 
        key.startsWith('__reactContainer$') || 
        key.startsWith('__reactFiber$') ||
        key.startsWith('_reactRootContainer')
      );
      
      if (reactKey) {
        let fiber = (rootElement as any)[reactKey];
        
        // Traverse fiber tree looking for Redux Provider
        const visited = new Set();
        const queue = [fiber];
        
        while (queue.length > 0 && visited.size < 1000) {
          const current = queue.shift();
          if (!current || visited.has(current)) continue;
          visited.add(current);
          
          // Check for store in various locations
          if (current.memoizedState?.store) {
            return current.memoizedState.store;
          }
          if (current.stateNode?.store) {
            return current.stateNode.store;
          }
          // Check pendingProps for Provider
          if (current.pendingProps?.store) {
            return current.pendingProps.store;
          }
          if (current.memoizedProps?.store) {
            return current.memoizedProps.store;
          }
          // Check for context with store
          if (current.memoizedState?.memoizedState?.store) {
            return current.memoizedState.memoizedState.store;
          }
          
          // Add children and siblings to queue
          if (current.child) queue.push(current.child);
          if (current.sibling) queue.push(current.sibling);
          if (current.return) queue.push(current.return);
        }
      }
    }
  } catch (e) {
    console.warn('[CraftBuddy] Fiber traversal failed:', e);
  }
  
  return null;
}

// Cache the Redux store once found
let cachedStore: any = null;

/**
 * Try to extract crafting state from Redux store or DOM.
 */
function detectCraftingState(): { isActive: boolean; entity?: CraftingEntity; progress?: ProgressState } {
  // Method 1: Try to access Redux store - this is the best source
  if (!cachedStore) {
    cachedStore = findReduxStore();
  }
  
  if (cachedStore) {
    try {
      const state = cachedStore.getState();
      const craftingState = state?.crafting;
      
      // Check if we have an active crafting session with player and progressState
      if (craftingState?.player && craftingState?.progressState) {
        return { 
          isActive: true, 
          entity: craftingState.player as CraftingEntity,
          progress: craftingState.progressState as ProgressState
        };
      }
      
      // Also check nested paths
      const gameCrafting = state?.game?.crafting;
      if (gameCrafting?.player && gameCrafting?.progressState) {
        return {
          isActive: true,
          entity: gameCrafting.player as CraftingEntity,
          progress: gameCrafting.progressState as ProgressState
        };
      }
    } catch (e) {
      // Store access failed
    }
  }
  
  // Method 2: Check for crafting UI elements in the DOM
  const craftingPanel = document.querySelector('[class*="crafting"]') || 
                        document.querySelector('[class*="Crafting"]') ||
                        document.querySelector('[data-testid*="crafting"]');
  
  // Method 3: Look for specific crafting-related text/elements
  const stabilityElement = document.querySelector('[class*="stability"]') ||
                           Array.from(document.querySelectorAll('*')).find(el => 
                             el.textContent?.includes('Stability:') && el.children.length < 5
                           );
  
  const completionElement = document.querySelector('[class*="completion"]') ||
                            Array.from(document.querySelectorAll('*')).find(el => 
                              el.textContent?.includes('Completion:') && el.children.length < 5
                            );
  
  // Method 4: Check for technique buttons (crafting skills)
  const techniqueButtons = document.querySelectorAll('button');
  let hasCraftingButtons = false;
  techniqueButtons.forEach(btn => {
    const text = btn.textContent?.toLowerCase() || '';
    if (text.includes('fusion') || text.includes('refine') || text.includes('stabilize')) {
      hasCraftingButtons = true;
    }
  });
  
  const isActive = !!(craftingPanel || stabilityElement || completionElement || hasCraftingButtons);
  
  return { isActive };
}

/**
 * Parse crafting values from the DOM.
 */
function parseCraftingValuesFromDOM(): { 
  completion: number; 
  perfection: number; 
  stability: number;
  pool: number;
} | null {
  try {
    // Look for progress bars or text showing crafting values
    const allText = document.body.innerText;
    
    // Try to find patterns like "Completion: 45/100" or "45 / 100"
    const completionMatch = allText.match(/Completion[:\s]+(\d+)\s*[\/]\s*(\d+)/i);
    const perfectionMatch = allText.match(/Perfection[:\s]+(\d+)\s*[\/]\s*(\d+)/i);
    const stabilityMatch = allText.match(/Stability[:\s]+(\d+)\s*[\/]\s*(\d+)/i);
    const poolMatch = allText.match(/(?:Qi|Pool)[:\s]+(\d+)\s*[\/]\s*(\d+)/i);
    
    if (completionMatch || perfectionMatch || stabilityMatch) {
      return {
        completion: completionMatch ? parseInt(completionMatch[1]) : 0,
        perfection: perfectionMatch ? parseInt(perfectionMatch[1]) : 0,
        stability: stabilityMatch ? parseInt(stabilityMatch[1]) : 0,
        pool: poolMatch ? parseInt(poolMatch[1]) : 0,
      };
    }
  } catch (e) {
    console.warn('[CraftBuddy] Failed to parse DOM values:', e);
  }
  
  return null;
}

/**
 * Poll for crafting state changes.
 */
function pollCraftingState(): void {
  const { isActive, entity, progress } = detectCraftingState();
  
  if (isActive && !isOverlayVisible) {
    console.log('[CraftBuddy] Crafting detected, showing overlay');
    showOverlay();
  } else if (!isActive && isOverlayVisible) {
    console.log('[CraftBuddy] Crafting ended, hiding overlay');
    hideOverlay();
  }
  
  // If we have entity and progress from Redux, use them directly
  if (isActive && entity && progress) {
    // Check if state changed
    const newCompletion = progress.completion || 0;
    const newPerfection = progress.perfection || 0;
    const newStability = progress.stability || 0;
    
    if (newCompletion !== currentCompletion || 
        newPerfection !== currentPerfection ||
        newStability !== currentStability ||
        !lastEntity) {
      console.log(`[CraftBuddy] Redux state: Completion=${newCompletion}, Perfection=${newPerfection}, Stability=${newStability}`);
      updateRecommendation(entity, progress);
    }
    return;
  }
  
  // Fallback: If crafting is active but no Redux data, try to update values from DOM
  if (isActive) {
    const domValues = parseCraftingValuesFromDOM();
    if (domValues) {
      // Only update if values changed
      if (domValues.completion !== currentCompletion || 
          domValues.perfection !== currentPerfection ||
          domValues.stability !== currentStability) {
        console.log('[CraftBuddy] DOM values changed:', domValues);
        currentCompletion = domValues.completion;
        currentPerfection = domValues.perfection;
        currentStability = domValues.stability;
        renderOverlay();
      }
    }
  }
}

/**
 * Start polling for crafting state.
 */
function startPolling(): void {
  if (pollingInterval) return;
  
  pollingInterval = window.setInterval(pollCraftingState, POLL_INTERVAL_MS);
  console.log('[CraftBuddy] Started polling for crafting state');
}

/**
 * Stop polling.
 */
function stopPolling(): void {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
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
    
    // Force panel visible and show overlay when crafting starts
    currentSettings.panelVisible = true;
    isOverlayVisible = false; // Reset so showOverlay will work
    console.log('[CraftBuddy] Crafting starting, forcing panel visible');
    showOverlay();
    
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
    renderOverlay();
  },
  
  setLookaheadDepth: (depth: number) => {
    currentSettings = saveSettings({ lookaheadDepth: Math.max(1, Math.min(6, depth)) });
    console.log(`[CraftBuddy] Lookahead depth set to: ${currentSettings.lookaheadDepth}`);
  },
  
  togglePanel: () => {
    currentSettings = saveSettings({ panelVisible: !currentSettings.panelVisible });
    if (currentSettings.panelVisible) {
      showOverlay();
    } else {
      hideOverlay();
    }
    return currentSettings.panelVisible;
  },
  
  toggleCompact: () => {
    currentSettings = saveSettings({ compactMode: !currentSettings.compactMode });
    renderOverlay();
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
    
    // Check screenAPI
    const screenAPI = (window.modAPI as any)?.screenAPI;
    console.log('[CraftBuddy] screenAPI:', screenAPI);
    if (screenAPI) {
      console.log('[CraftBuddy] screenAPI keys:', Object.keys(screenAPI));
      // Try to use useSelector if available
      if (typeof screenAPI.useSelector === 'function') {
        try {
          // This might fail if not in React context
          const craftingState = screenAPI.useSelector((state: any) => state.crafting);
          console.log('[CraftBuddy] Crafting state from useSelector:', craftingState);
        } catch (e) {
          console.log('[CraftBuddy] useSelector failed (expected if not in React context):', e);
        }
      }
    }
  },
  
  // Find Redux store location
  findStore: () => {
    const win = window as any;
    console.log('[CraftBuddy] === Searching for Redux Store ===');
    
    // Check common locations
    const locations = [
      'store', '__REDUX_STORE__', 'reduxStore', '__store__', 
      'gameStore', 'appStore', '__STORE__', 'Store'
    ];
    
    for (const loc of locations) {
      if (win[loc]) {
        console.log(`[CraftBuddy] Found store at window.${loc}:`, win[loc]);
        if (typeof win[loc].getState === 'function') {
          const state = win[loc].getState();
          console.log(`[CraftBuddy] State keys:`, Object.keys(state || {}));
          if (state?.crafting) {
            console.log(`[CraftBuddy] Crafting state:`, state.crafting);
          }
        }
      }
    }
    
    // Check modAPI
    console.log('[CraftBuddy] modAPI:', win.modAPI);
    if (win.modAPI) {
      console.log('[CraftBuddy] modAPI keys:', Object.keys(win.modAPI));
      // Check for any state-related properties
      for (const key of Object.keys(win.modAPI)) {
        const val = win.modAPI[key];
        if (val && typeof val === 'object') {
          console.log(`[CraftBuddy] modAPI.${key} keys:`, Object.keys(val).slice(0, 20));
        }
      }
    }
    
    // Try React root with detailed fiber inspection
    const rootEl = document.getElementById('root') || document.getElementById('app');
    if (rootEl) {
      console.log('[CraftBuddy] Found root element:', rootEl.id);
      const reactKeys = Object.keys(rootEl).filter(k => k.startsWith('__react'));
      console.log('[CraftBuddy] React keys on root:', reactKeys);
      
      // Try to traverse fiber tree
      for (const key of reactKeys) {
        try {
          const fiber = (rootEl as any)[key];
          console.log(`[CraftBuddy] Fiber at ${key}:`, fiber?.tag, fiber?.type?.name || fiber?.type);
          
          // Look for store in first few levels
          let current = fiber;
          for (let i = 0; i < 10 && current; i++) {
            if (current.memoizedProps?.store) {
              console.log('[CraftBuddy] Found store in memoizedProps at depth', i);
              const store = current.memoizedProps.store;
              if (typeof store.getState === 'function') {
                const state = store.getState();
                console.log('[CraftBuddy] Store state keys:', Object.keys(state || {}));
                return store;
              }
            }
            if (current.pendingProps?.store) {
              console.log('[CraftBuddy] Found store in pendingProps at depth', i);
              return current.pendingProps.store;
            }
            current = current.child || current.sibling;
          }
        } catch (e) {
          console.warn('[CraftBuddy] Error inspecting fiber:', e);
        }
      }
    }
    
    const store = findReduxStore();
    if (store) {
      console.log('[CraftBuddy] findReduxStore() returned:', store);
      if (typeof store.getState === 'function') {
        const state = store.getState();
        console.log('[CraftBuddy] Store state keys:', Object.keys(state || {}));
      }
    } else {
      console.log('[CraftBuddy] No Redux store found');
    }
    return store;
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
  
  // Show overlay manually
  showPanel: () => {
    showOverlay();
    console.log('[CraftBuddy] Panel shown');
  },
  
  // Hide overlay manually
  hidePanel: () => {
    hideOverlay();
    console.log('[CraftBuddy] Panel hidden');
  },
  
  // Check crafting detection
  detectCrafting: () => {
    const result = detectCraftingState();
    console.log('[CraftBuddy] Crafting detection:', result);
    
    // Also log the raw Redux state for debugging
    if (cachedStore) {
      const state = cachedStore.getState();
      console.log('[CraftBuddy] Redux crafting state:', state?.crafting);
      console.log('[CraftBuddy] Has player:', !!state?.crafting?.player);
      console.log('[CraftBuddy] Has progressState:', !!state?.crafting?.progressState);
    }
    
    return result;
  },
  
  // Parse DOM values
  parseDOMValues: () => {
    const result = parseCraftingValuesFromDOM();
    console.log('[CraftBuddy] DOM values:', result);
    return result;
  },
  
  // Start/stop polling
  startPolling: () => {
    startPolling();
    console.log('[CraftBuddy] Polling started');
  },
  
  stopPolling: () => {
    stopPolling();
    console.log('[CraftBuddy] Polling stopped');
  },
  
  // Test with mock data
  testWithMockData: () => {
    console.log('[CraftBuddy] Testing with mock data...');
    
    // Create mock entity
    const mockEntity: any = {
      stats: {
        control: 16,
        intensity: 12,
        pool: 150,
        maxpool: 200,
      },
      techniques: [
        {
          name: 'Simple Fusion',
          poolCost: 0,
          stabilityCost: 10,
          type: 'fusion',
          effects: [{ kind: 'completion', amount: { value: 12, stat: 'intensity' } }],
        },
        {
          name: 'Stabilize',
          poolCost: 10,
          stabilityCost: 0,
          type: 'stabilize',
          noMaxStabilityLoss: true,
          effects: [{ kind: 'stability', amount: { value: 20 } }],
        },
      ],
      buffs: [],
    };
    
    // Create mock progress state
    const mockProgress: any = {
      stability: 45,
      completion: 30,
      perfection: 20,
      condition: 'neutral',
      nextConditions: ['positive', 'neutral'],
    };
    
    // Set targets
    targetCompletion = 100;
    targetPerfection = 100;
    targetStability = 60;
    currentMaxStability = 55;
    
    // Update with mock data
    updateRecommendation(mockEntity, mockProgress);
    showOverlay();
    
    console.log('[CraftBuddy] Mock test complete - panel should be visible');
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
          if (currentSettings.panelVisible) {
            showOverlay();
          } else {
            hideOverlay();
          }
          console.log(`[CraftBuddy] Panel visibility: ${currentSettings.panelVisible}`);
          break;
        case 'm':
          event.preventDefault();
          currentSettings = saveSettings({ compactMode: !currentSettings.compactMode });
          renderOverlay();
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
    indicator.innerHTML = '🔮 AFNM-CraftBuddy v1.11.0 Loaded';
    
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

// Initialize
createTitleScreenIndicator();
createOverlayContainer();
startPolling();

// Subscribe to Redux store for state changes
setTimeout(() => {
  const store = findReduxStore();
  if (store && typeof store.subscribe === 'function') {
    cachedStore = store;
    console.log('[CraftBuddy] Subscribing to Redux store for state changes');
    store.subscribe(() => {
      const state = store.getState();
      const craftingState = state?.crafting;
      
      // Check if crafting is active
      if (craftingState?.player && craftingState?.progressState) {
        const progress = craftingState.progressState;
        const entity = craftingState.player;
        
        // Check if state changed
        if (progress.completion !== currentCompletion || 
            progress.perfection !== currentPerfection ||
            progress.stability !== currentStability ||
            !lastEntity) {
          console.log(`[CraftBuddy] Redux update: Completion=${progress.completion}, Perfection=${progress.perfection}, Stability=${progress.stability}`);
          
          // Ensure panel is visible
          if (!isOverlayVisible) {
            currentSettings.panelVisible = true;
            showOverlay();
          }
          
          updateRecommendation(entity, progress);
        }
      }
    });
  }
}, 1000); // Wait 1 second for game to initialize

console.log('[CraftBuddy] Mod loaded successfully!');
console.log('[CraftBuddy] Debug: window.craftBuddyDebug.testWithMockData() to test the panel');
console.log('[CraftBuddy] Debug: window.craftBuddyDebug.showPanel() to show panel manually');
