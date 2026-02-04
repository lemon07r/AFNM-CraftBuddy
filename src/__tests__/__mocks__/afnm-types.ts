/**
 * Mock for afnm-types module
 * Provides minimal type definitions needed for testing optimizer logic
 */

// Mock types that match the real afnm-types interfaces
export interface CraftingCondition {}
export interface RecipeConditionEffect {}
export interface CraftingBuff {}
export interface CraftingEntity {}
export interface ProgressState {}
export interface CraftingState {}
export interface CraftingTechnique {}
export interface HarmonyTypeConfig {}

export type RecipeHarmonyType = 'forge' | 'alchemical' | 'inscription' | 'resonance';
