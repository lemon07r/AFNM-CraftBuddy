import type { AutoCraftExecutor, AutoCraftExecutionRequest, AutoCraftRuntimeSnapshot } from './autoCraftController';

interface DomAutoCraftExecutorOptions {
  getRootElement: () => ParentNode;
  getStore?: () => DispatchStore | null;
  isElementVisible: (element: Element) => boolean;
  isIgnoredElement: (element: Element | null) => boolean;
}

interface ButtonCandidate {
  element: HTMLElement;
  searchText: string;
  sourceBoost?: number;
}

interface DispatchStore {
  dispatch: (action: { type: string; payload?: unknown }) => unknown;
  getState?: () => any;
}

const BUTTON_SELECTORS = ['button', '[role="button"]'].join(', ');
const CLICKABLE_SELECTORS = [
  BUTTON_SELECTORS,
  '[tabindex]:not([tabindex="-1"])',
  '[onclick]',
  'a[href]',
  '[data-testid*="button"]',
  '[class*="button"]',
  '[class*="Button"]',
].join(', ');
const FINISH_REGION_THRESHOLD_PX = 14_000;
const EXECUTE_TECHNIQUE_ACTION_TYPE = 'crafting/executeTechnique';
const WAIT_TECHNIQUE = {
  name: 'Wait',
  icon: 'wait.webp',
  poolCost: 0,
  stabilityCost: 10,
  successChance: 1,
  cooldown: 0,
  tooltip: 'Let the crafting process advance. Has no other effects.',
  effects: [],
  type: 'support',
  realm: 'mundane',
  currentCooldown: 0,
};

function normalizeText(value: string | undefined): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function isDispatchStore(value: unknown): value is DispatchStore {
  return !!value && typeof (value as DispatchStore).dispatch === 'function';
}

function cloneTechniquePayload(
  technique: Record<string, unknown>,
): Record<string, unknown> {
  return { ...technique };
}

function resolveDirectTechniquePayload(
  request: AutoCraftExecutionRequest,
  store: DispatchStore,
): Record<string, unknown> | null {
  if (request.kind === 'finish') {
    // CraftBuddy synthesizes "Finish Craft". The native crafting UI executes
    // that by using the built-in Wait technique until stability reaches zero.
    return cloneTechniquePayload(WAIT_TECHNIQUE);
  }

  if (request.kind !== 'skill') {
    return null;
  }

  const aliases = new Set(
    [
      request.actionName,
      request.skill?.name,
      (request.skill?.nativeTechnique as { name?: string } | undefined)?.name,
    ]
      .map((name) => normalizeText(name))
      .filter(Boolean),
  );

  const liveTechniques = store.getState?.()?.crafting?.player?.techniques;
  if (Array.isArray(liveTechniques)) {
    const liveTechnique = liveTechniques.find((technique) =>
      aliases.has(normalizeText((technique as { name?: string } | null)?.name)),
    );
    if (
      liveTechnique &&
      typeof liveTechnique === 'object' &&
      !Array.isArray(liveTechnique)
    ) {
      return cloneTechniquePayload(liveTechnique as Record<string, unknown>);
    }
  }

  const nativeTechnique = request.skill?.nativeTechnique;
  if (
    nativeTechnique &&
    typeof nativeTechnique === 'object' &&
    !Array.isArray(nativeTechnique)
  ) {
    return cloneTechniquePayload(nativeTechnique as Record<string, unknown>);
  }

  return null;
}

function dispatchTechniqueAction(
  options: DomAutoCraftExecutorOptions,
  request: AutoCraftExecutionRequest,
): boolean {
  const store = options.getStore?.();
  if (!isDispatchStore(store)) {
    return false;
  }

  const payload = resolveDirectTechniquePayload(request, store);
  if (!payload) {
    return false;
  }

  store.dispatch({
    type: EXECUTE_TECHNIQUE_ACTION_TYPE,
    payload,
  });

  return true;
}

function buildSearchAliases(request: AutoCraftExecutionRequest): string[] {
  const aliases = new Set<string>();
  aliases.add(request.actionName);

  if (request.kind === 'finish') {
    aliases.add('finish craft');
    aliases.add('finish');
    aliases.add('complete craft');
    aliases.add('finalize craft');
    aliases.add('perfect craft');
    aliases.add('craft success');
    aliases.add('wait');
    aliases.add('do nothing');
    aliases.add('advance craft');
    aliases.add('advance crafting process');
  }

  if (request.kind === 'item') {
    if (request.skill?.itemName) {
      aliases.add(request.skill.itemName.replace(/_/g, ' '));
    }
    aliases.add(request.actionName.replace(/^use\s+/i, ''));
  }

  if (request.skill?.name) {
    aliases.add(request.skill.name);
  }

  return Array.from(aliases)
    .map((alias) => normalizeText(alias))
    .filter(Boolean);
}

function scoreSearchText(searchText: string, aliases: string[]): number {
  let bestScore = 0;
  for (const alias of aliases) {
    if (searchText === alias) {
      bestScore = Math.max(bestScore, 100);
      continue;
    }
    if (searchText.startsWith(`${alias} `)) {
      bestScore = Math.max(bestScore, 92);
      continue;
    }
    if (searchText.includes(alias)) {
      bestScore = Math.max(bestScore, 80);
      continue;
    }

    const aliasTokens = alias.split(' ').filter(Boolean);
    if (
      aliasTokens.length > 1 &&
      aliasTokens.every((token) => searchText.includes(token))
    ) {
      bestScore = Math.max(bestScore, 68);
    }
  }

  return bestScore;
}

function scoreCandidate(
  candidate: ButtonCandidate,
  aliases: string[],
): number {
  return (
    scoreSearchText(candidate.searchText, aliases) + (candidate.sourceBoost ?? 0)
  );
}

function buildElementSearchText(
  element: HTMLElement,
  extraText?: string,
): string {
  return normalizeText(
    [
      element.textContent,
      element.getAttribute('aria-label'),
      element.getAttribute('title'),
      element.getAttribute('data-testid'),
      element.getAttribute('data-tooltip'),
      element.getAttribute('alt'),
      element.getAttribute('id'),
      element.getAttribute('name'),
      element.className,
      extraText,
    ].join(' '),
  );
}

function isDisabledElement(element: HTMLElement): boolean {
  if (element.hasAttribute('disabled')) return true;
  if (element.getAttribute('aria-disabled') === 'true') return true;
  return false;
}

function isProbablyClickableElement(element: HTMLElement): boolean {
  if (element.matches(CLICKABLE_SELECTORS)) return true;
  if (typeof element.onclick === 'function') return true;
  if (element.tabIndex >= 0) return true;

  const style = window.getComputedStyle(element);
  return style.cursor === 'pointer';
}

function rectArea(element: HTMLElement): number {
  const rect = element.getBoundingClientRect();
  return rect.width * rect.height;
}

function addCandidate(
  target: Map<HTMLElement, ButtonCandidate>,
  element: HTMLElement,
  extraText?: string,
  sourceBoost: number = 0,
): void {
  if (isDisabledElement(element)) return;

  const searchText = buildElementSearchText(element, extraText);
  if (!searchText) return;

  const existing = target.get(element);
  if (
    !existing ||
    sourceBoost > (existing.sourceBoost ?? 0) ||
    searchText.length > existing.searchText.length
  ) {
    target.set(element, {
      element,
      searchText,
      sourceBoost: Math.max(sourceBoost, existing?.sourceBoost ?? 0),
    });
  }
}

function findClickableAncestor(
  element: HTMLElement,
  options: DomAutoCraftExecutorOptions,
): HTMLElement | null {
  let current: HTMLElement | null = element;

  while (current) {
    if (
      !options.isIgnoredElement(current) &&
      options.isElementVisible(current) &&
      !isDisabledElement(current) &&
      isProbablyClickableElement(current)
    ) {
      return current;
    }
    current = current.parentElement;
  }

  return null;
}

function hasFinishCue(searchText: string): boolean {
  return (
    searchText.includes('finish') ||
    searchText.includes('complete craft') ||
    searchText.includes('complete') ||
    searchText.includes('perfect craft') ||
    searchText.includes('craft success') ||
    searchText.includes('success chance') ||
    searchText.includes('craft result') ||
    searchText.includes('final result') ||
    searchText.includes('output') ||
    searchText.includes('cauldron') ||
    searchText.includes('product')
  );
}

function getVisibleHtmlElements(
  options: DomAutoCraftExecutorOptions,
): HTMLElement[] {
  const rootElement = options.getRootElement();
  return Array.from(rootElement.querySelectorAll('*'))
    .filter((element): element is HTMLElement => element instanceof HTMLElement)
    .filter(
      (element) =>
        !options.isIgnoredElement(element) && options.isElementVisible(element),
    );
}

function normalizeImageHint(value: string | undefined): string | null {
  if (!value) return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  const withoutQuery = trimmed.split(/[?#]/, 1)[0];
  const normalizedPath = withoutQuery.replace(/\\/g, '/').toLowerCase();
  const fileName =
    normalizedPath.split('/').filter(Boolean).pop() || normalizedPath;

  return fileName || null;
}

function buildIconHints(request: AutoCraftExecutionRequest): string[] {
  const hints = new Set<string>();
  const nativeTechnique = request.skill?.nativeTechnique as
    | { icon?: string }
    | undefined;

  const possibleHints = [
    request.skill?.icon,
    nativeTechnique?.icon,
  ];
  possibleHints.forEach((hint) => {
    const normalized = normalizeImageHint(hint);
    if (normalized) {
      hints.add(normalized);
    }
  });

  return Array.from(hints);
}

function collectImageUrls(value: string | null | undefined): string[] {
  if (!value) return [];
  const matches = Array.from(value.matchAll(/url\((['"]?)(.*?)\1\)/gi));
  return matches.map((match) => match[2]).filter(Boolean);
}

function extractElementImageHints(element: HTMLElement): string[] {
  const hints = new Set<string>();
  const possibleValues = [
    element.getAttribute('src'),
    element.getAttribute('currentSrc'),
    element.getAttribute('data-src'),
    element.getAttribute('poster'),
    ...collectImageUrls(element.style.backgroundImage),
    ...collectImageUrls(window.getComputedStyle(element).backgroundImage),
  ];

  possibleValues.forEach((value) => {
    const normalized = normalizeImageHint(value ?? undefined);
    if (normalized) {
      hints.add(normalized);
    }
  });

  return Array.from(hints);
}

function elementMatchesIconHints(
  element: HTMLElement,
  iconHints: string[],
): boolean {
  if (iconHints.length === 0) return false;
  const elementHints = extractElementImageHints(element);
  return elementHints.some((hint) => iconHints.includes(hint));
}

function listNamedClickCandidates(
  options: DomAutoCraftExecutorOptions,
  aliases: string[],
): ButtonCandidate[] {
  const candidates = new Map<HTMLElement, ButtonCandidate>();

  getVisibleHtmlElements(options).forEach((element) => {
    const searchText = buildElementSearchText(element);
    if (scoreSearchText(searchText, aliases) <= 0) {
      return;
    }

    const clickableElement = findClickableAncestor(element, options);
    if (!clickableElement) {
      return;
    }

    addCandidate(candidates, clickableElement, searchText, 8);
  });

  return Array.from(candidates.values());
}

function listIconCandidates(
  options: DomAutoCraftExecutorOptions,
  request: AutoCraftExecutionRequest,
  iconHints: string[],
): ButtonCandidate[] {
  if (iconHints.length === 0) {
    return [];
  }

  const candidates = new Map<HTMLElement, ButtonCandidate>();
  getVisibleHtmlElements(options).forEach((element) => {
    if (!elementMatchesIconHints(element, iconHints)) {
      return;
    }

    const clickableElement = findClickableAncestor(element, options);
    if (!clickableElement) {
      return;
    }

    addCandidate(candidates, clickableElement, request.actionName, 18);
  });

  return Array.from(candidates.values());
}

function listActionCandidates(
  options: DomAutoCraftExecutorOptions,
  request: AutoCraftExecutionRequest,
  aliases: string[],
): ButtonCandidate[] {
  const iconHints = buildIconHints(request);
  const candidates = new Map<HTMLElement, ButtonCandidate>();

  listVisibleButtons(options).forEach((candidate) => {
    candidates.set(candidate.element, candidate);
  });
  listNamedClickCandidates(options, aliases).forEach((candidate) => {
    addCandidate(
      candidates,
      candidate.element,
      candidate.searchText,
      candidate.sourceBoost ?? 0,
    );
  });
  listIconCandidates(options, request, iconHints).forEach((candidate) => {
    addCandidate(
      candidates,
      candidate.element,
      candidate.searchText,
      candidate.sourceBoost ?? 0,
    );
  });

  return Array.from(candidates.values());
}

function scoreFinishCandidate(
  candidate: ButtonCandidate,
  aliases: string[],
): number {
  const searchText = candidate.searchText;
  let bestScore = scoreCandidate(candidate, aliases);

  if (searchText.includes('finish')) bestScore = Math.max(bestScore, 100);
  if (searchText.includes('complete craft')) bestScore = Math.max(bestScore, 94);
  if (searchText.includes('complete')) bestScore = Math.max(bestScore, 88);
  if (
    searchText.includes('perfect craft') ||
    searchText.includes('craft success')
  ) {
    bestScore = Math.max(bestScore, 80);
  }
  if (searchText.includes('success chance')) bestScore = Math.max(bestScore, 74);
  if (
    searchText.includes('craft result') ||
    searchText.includes('final result') ||
    searchText.includes('output')
  ) {
    bestScore = Math.max(bestScore, 68);
  }
  if (searchText.includes('wait')) bestScore = Math.max(bestScore, 96);
  if (searchText.includes('do nothing')) bestScore = Math.max(bestScore, 88);
  if (searchText.includes('cauldron') || searchText.includes('product')) {
    bestScore = Math.max(bestScore, 62);
  }
  if (searchText.includes('craft')) bestScore = Math.max(bestScore, 52);

  if (
    /(fusion|refine|stabilize|support|technique|crafting action [0-9]+)/.test(
      searchText,
    )
  ) {
    bestScore -= 28;
  }

  const areaBonus = Math.min(14, Math.round(rectArea(candidate.element) / 8000));
  return bestScore + areaBonus;
}

function listVisibleButtons({
  getRootElement,
  isElementVisible,
  isIgnoredElement,
}: DomAutoCraftExecutorOptions): ButtonCandidate[] {
  return Array.from(getRootElement().querySelectorAll(BUTTON_SELECTORS))
    .filter((element) => !isIgnoredElement(element) && isElementVisible(element))
    .map((element) => element as HTMLElement)
    .filter((element) => {
      if (element.hasAttribute('disabled')) return false;
      if (element.getAttribute('aria-disabled') === 'true') return false;
      return true;
    })
    .map((element) => ({
      element,
      searchText: buildElementSearchText(element),
    }))
    .filter((candidate) => candidate.searchText.length > 0);
}

function listFinishCandidates(
  options: DomAutoCraftExecutorOptions,
): ButtonCandidate[] {
  const candidates = new Map<HTMLElement, ButtonCandidate>();
  const allElements = getVisibleHtmlElements(options);

  allElements.forEach((element) => {
    if (!isProbablyClickableElement(element) || isDisabledElement(element)) {
      return;
    }

    const searchText = buildElementSearchText(element);
    if (hasFinishCue(searchText) || rectArea(element) >= FINISH_REGION_THRESHOLD_PX) {
      addCandidate(
        candidates,
        element,
        searchText || 'craft region',
      );
    }
  });

  allElements.forEach((element) => {
    const searchText = buildElementSearchText(element);
    if (!hasFinishCue(searchText)) {
      return;
    }

    const clickableElement = findClickableAncestor(element, options);
    if (!clickableElement) {
      return;
    }

    addCandidate(candidates, clickableElement, searchText);
  });

  return Array.from(candidates.values());
}

function dispatchClickSequence(element: HTMLElement): void {
  const rect = element.getBoundingClientRect();
  const mouseInit = {
    bubbles: true,
    cancelable: true,
    composed: true,
    clientX: rect.left + rect.width / 2,
    clientY: rect.top + rect.height / 2,
    button: 0,
    buttons: 1,
  };

  element.focus();

  if (typeof PointerEvent === 'function') {
    element.dispatchEvent(
      new PointerEvent('pointerdown', {
        ...mouseInit,
        pointerId: 1,
        pointerType: 'mouse',
        isPrimary: true,
      }),
    );
  }
  element.dispatchEvent(new MouseEvent('mousedown', mouseInit));

  if (typeof PointerEvent === 'function') {
    element.dispatchEvent(
      new PointerEvent('pointerup', {
        ...mouseInit,
        buttons: 0,
        pointerId: 1,
        pointerType: 'mouse',
        isPrimary: true,
      }),
    );
  }
  element.dispatchEvent(
    new MouseEvent('mouseup', {
      ...mouseInit,
      buttons: 0,
    }),
  );

  element.click();
}

function executeFinishAction(
  options: DomAutoCraftExecutorOptions,
  request: AutoCraftExecutionRequest,
  aliases: string[],
): void {
  if (dispatchTechniqueAction(options, request)) {
    return;
  }

  const candidates = [
    ...listActionCandidates(options, request, aliases),
    ...listFinishCandidates(options),
  ]
    .map((candidate) => ({
      ...candidate,
      score: scoreFinishCandidate(candidate, aliases),
    }))
    .filter((candidate) => candidate.score >= 60)
    .sort((a, b) => b.score - a.score);

  const candidate = candidates[0];
  if (!candidate) {
    throw new Error(
      'Could not find a visible game control or confirm keybinding for Finish Craft. Auto mode stopped before sending another input.',
    );
  }

  dispatchClickSequence(candidate.element);
}

export function createDomAutoCraftExecutor(
  options: DomAutoCraftExecutorOptions,
): AutoCraftExecutor {
  return {
    execute(request: AutoCraftExecutionRequest, _snapshot: AutoCraftRuntimeSnapshot) {
      const aliases = buildSearchAliases(request);
      if (request.kind === 'finish') {
        executeFinishAction(options, request, aliases);
        return;
      }

      if (request.kind === 'skill' && dispatchTechniqueAction(options, request)) {
        return;
      }

      const rawCandidates = listActionCandidates(options, request, aliases);
      const candidates = rawCandidates
        .map((candidate) => ({
          ...candidate,
          score: scoreCandidate(candidate, aliases),
        }))
        .filter((candidate) => candidate.score >= 80)
        .sort((a, b) => b.score - a.score);

      const candidate = candidates[0];
      if (!candidate) {
        throw new Error(
          `Could not find a visible game control for ${request.actionName}. Auto mode stopped before sending another input.`,
        );
      }

      dispatchClickSequence(candidate.element);
    },
  };
}
