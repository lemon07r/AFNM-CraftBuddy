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
    .map((element) => {
      const searchText = normalizeText(
        [
          element.textContent,
          element.getAttribute('aria-label'),
          element.getAttribute('title'),
          element.getAttribute('data-testid'),
          element.className,
        ].join(' '),
      );

      return {
        element,
        searchText,
      };
    })
    .filter((candidate) => candidate.searchText.length > 0);
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
      const candidates = listVisibleButtons(options)
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
