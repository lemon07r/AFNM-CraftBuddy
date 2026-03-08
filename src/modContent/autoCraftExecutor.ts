import type { AutoCraftExecutor, AutoCraftExecutionRequest, AutoCraftRuntimeSnapshot } from './autoCraftController';

interface DomAutoCraftExecutorOptions {
  getRootElement: () => ParentNode;
  isElementVisible: (element: Element) => boolean;
  isIgnoredElement: (element: Element | null) => boolean;
}

interface ButtonCandidate {
  element: HTMLElement;
  searchText: string;
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

function normalizeText(value: string | undefined): string {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
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

function scoreCandidate(
  candidate: ButtonCandidate,
  aliases: string[],
): number {
  let bestScore = 0;
  for (const alias of aliases) {
    if (candidate.searchText === alias) {
      bestScore = Math.max(bestScore, 100);
      continue;
    }
    if (candidate.searchText.startsWith(`${alias} `)) {
      bestScore = Math.max(bestScore, 92);
      continue;
    }
    if (candidate.searchText.includes(alias)) {
      bestScore = Math.max(bestScore, 80);
      continue;
    }

    const aliasTokens = alias.split(' ').filter(Boolean);
    if (
      aliasTokens.length > 1 &&
      aliasTokens.every((token) => candidate.searchText.includes(token))
    ) {
      bestScore = Math.max(bestScore, 68);
    }
  }

  return bestScore;
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
): void {
  if (isDisabledElement(element)) return;

  const searchText = buildElementSearchText(element, extraText);
  if (!searchText) return;

  const existing = target.get(element);
  if (!existing || searchText.length > existing.searchText.length) {
    target.set(element, { element, searchText });
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
  const rootElement = options.getRootElement();
  const candidates = new Map<HTMLElement, ButtonCandidate>();
  const allElements = Array.from(rootElement.querySelectorAll('*'))
    .filter((element): element is HTMLElement => element instanceof HTMLElement)
    .filter(
      (element) =>
        !options.isIgnoredElement(element) && options.isElementVisible(element),
    );

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

export function createDomAutoCraftExecutor(
  options: DomAutoCraftExecutorOptions,
): AutoCraftExecutor {
  return {
    execute(request: AutoCraftExecutionRequest, _snapshot: AutoCraftRuntimeSnapshot) {
      const aliases = buildSearchAliases(request);
      const rawCandidates =
        request.kind === 'finish'
          ? listFinishCandidates(options)
          : listVisibleButtons(options);
      const candidates = rawCandidates
        .map((candidate) => ({
          ...candidate,
          score:
            request.kind === 'finish'
              ? scoreFinishCandidate(candidate, aliases)
              : scoreCandidate(candidate, aliases),
        }))
        .filter((candidate) => candidate.score >= (request.kind === 'finish' ? 60 : 80))
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
