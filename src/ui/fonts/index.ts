import interLatin from './Inter-Variable-latin.woff2';
import marcellusLatin from './Marcellus-Regular-latin.woff2';

const STYLE_ID = 'craftbuddy-fonts';

/**
 * Registers CraftBuddy's bundled faces once per document. The families use
 * CraftBuddy-specific names so they never replace the game's own fonts.
 */
export function ensureCraftBuddyFonts(doc: Document = document): void {
  if (doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = [
    `@font-face{font-family:'CraftBuddy Inter';src:url(${interLatin}) format('woff2');font-weight:100 900;font-style:normal;font-display:swap}`,
    `@font-face{font-family:'CraftBuddy Display';src:url(${marcellusLatin}) format('woff2');font-weight:400;font-style:normal;font-display:swap}`,
  ].join('\n');
  doc.head.appendChild(style);
}
