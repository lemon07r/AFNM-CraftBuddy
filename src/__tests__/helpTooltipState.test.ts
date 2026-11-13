import {
  nextHelpTooltipState,
  type HelpTooltipEvent,
  type HelpTooltipState,
} from '../utils/helpTooltipState';

function run(events: HelpTooltipEvent[]): HelpTooltipState {
  return events.reduce<HelpTooltipState>(nextHelpTooltipState, 'closed');
}

describe('nextHelpTooltipState', () => {
  it('opens on mouse hover and closes when the pointer leaves', () => {
    expect(run([{ type: 'pointerEnter', pointerType: 'mouse' }])).toBe(
      'transient',
    );
    expect(
      run([
        { type: 'pointerEnter', pointerType: 'mouse' },
        { type: 'pointerLeave', pointerType: 'mouse' },
      ]),
    ).toBe('closed');
  });

  it('keeps a hovered tooltip open when the mouse clicks it', () => {
    expect(
      run([
        { type: 'pointerEnter', pointerType: 'mouse' },
        { type: 'click' },
        { type: 'pointerLeave', pointerType: 'mouse' },
      ]),
    ).toBe('pinned');
  });

  it('opens on a single tap even when the browser reports a pointer enter', () => {
    expect(
      run([{ type: 'pointerEnter', pointerType: 'touch' }, { type: 'click' }]),
    ).toBe('pinned');
  });

  it('closes on a second tap', () => {
    expect(
      run([
        { type: 'pointerEnter', pointerType: 'touch' },
        { type: 'click' },
        { type: 'pointerLeave', pointerType: 'touch' },
        { type: 'pointerEnter', pointerType: 'touch' },
        { type: 'click' },
      ]),
    ).toBe('closed');
  });

  it('opens on keyboard focus and closes on dismissal', () => {
    expect(run([{ type: 'focusVisible' }])).toBe('transient');
    expect(run([{ type: 'click' }, { type: 'dismiss' }])).toBe('closed');
  });
});
