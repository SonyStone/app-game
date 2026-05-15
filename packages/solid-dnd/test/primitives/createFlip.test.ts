import { createRoot } from 'solid-js';
import { createFlip } from 'src/primitives/createFlip';
import { describe, expect, it, vi } from 'vitest';

// ============================================================================
// MARK: Helpers — Mock Element with controllable rect + animate
// ============================================================================

type MockRect = { x: number; y: number; width: number; height: number };

type MockAnimationHandle = {
  /** Resolve the `finished` promise (simulates animation completion). */
  finish: () => void;
  /** The mock Animation object returned by `el.animate()`. */
  animation: MockAnimation;
};

type MockAnimation = {
  finished: Promise<Animation>;
  cancel: ReturnType<typeof vi.fn>;
  _finish: () => void;
};

function createMockAnimation(): MockAnimation {
  let resolveFinished: ((value: Animation) => void) | undefined;
  const finished = new Promise<Animation>((resolve) => {
    resolveFinished = resolve;
  });

  const mockAnim: MockAnimation = {
    finished,
    cancel: vi.fn(() => {
      // When cancelled, the `finished` promise should reject
      // But in our mock we'll just leave it pending — that's fine for tests
    }),
    _finish: () => resolveFinished?.({} as Animation)
  };

  return mockAnim;
}

type MockElement = HTMLDivElement & {
  _setRect: (rect: MockRect) => void;
  _animationHandles: MockAnimation[];
};

function createMockElement(initialRect: MockRect): MockElement {
  const el = document.createElement('div') as MockElement;
  document.body.appendChild(el);
  let currentRect = { ...initialRect };

  el.getBoundingClientRect = vi.fn(
    () =>
      ({
        x: currentRect.x,
        y: currentRect.y,
        left: currentRect.x,
        top: currentRect.y,
        width: currentRect.width,
        height: currentRect.height,
        right: currentRect.x + currentRect.width,
        bottom: currentRect.y + currentRect.height,
        toJSON: () => ({})
      }) as DOMRect
  );

  el._animationHandles = [];

  el.animate = vi.fn(() => {
    const mockAnim = createMockAnimation();
    el._animationHandles.push(mockAnim);
    return mockAnim as unknown as Animation;
  });

  el._setRect = (rect: MockRect) => {
    currentRect = { ...rect };
  };

  return el;
}

/**
 * Run a test inside a SolidJS reactive root.
 */
function withRoot(fn: (dispose: () => void) => void): void {
  createRoot((dispose) => {
    fn(dispose);
    dispose();
  });
}

// ============================================================================
// MARK: Tests
// ============================================================================

describe('createFlip', () => {
  describe('basic FLIP cycle', () => {
    it('animate() is called on elements that moved', () => {
      withRoot(() => {
        const elA = createMockElement({ x: 0, y: 0, width: 200, height: 40 });
        const elB = createMockElement({ x: 0, y: 50, width: 200, height: 40 });
        const elements = new Map<string, HTMLElement>([
          ['a', elA],
          ['b', elB]
        ]);

        const flip = createFlip({ elements });

        // Capture first positions
        flip.captureFirst();

        // Simulate DOM reorder: A and B swap
        elA._setRect({ x: 0, y: 50, width: 200, height: 40 });
        elB._setRect({ x: 0, y: 0, width: 200, height: 40 });

        flip.playFromFirst();

        expect(elA.animate).toHaveBeenCalledOnce();
        expect(elB.animate).toHaveBeenCalledOnce();
      });
    });

    it('passes correct keyframes — translate from old to new position', () => {
      withRoot(() => {
        const elA = createMockElement({ x: 0, y: 0, width: 200, height: 40 });
        const elements = new Map<string, HTMLElement>([['a', elA]]);
        const flip = createFlip({ elements });

        flip.captureFirst();
        elA._setRect({ x: 0, y: 100, width: 200, height: 40 }); // moved down 100px
        flip.playFromFirst();

        // First call to animate()
        const [keyframes, options] = (elA.animate as ReturnType<typeof vi.fn>).mock.calls[0];

        // Inverse delta: first.y(0) - last.y(100) = -100
        expect(keyframes).toEqual([{ transform: 'translate(0px, -100px)' }, { transform: 'translate(0, 0)' }]);
        expect(options).toMatchObject({ duration: 200, easing: 'linear' });
      });
    });

    it('does not animate elements that did not move', () => {
      withRoot(() => {
        const elA = createMockElement({ x: 0, y: 0, width: 200, height: 40 });
        const elB = createMockElement({ x: 0, y: 50, width: 200, height: 40 });
        const elements = new Map<string, HTMLElement>([
          ['a', elA],
          ['b', elB]
        ]);

        const flip = createFlip({ elements });

        flip.captureFirst();
        // Only A moves, B stays
        elA._setRect({ x: 0, y: 50, width: 200, height: 40 });
        // B stays at y=50

        flip.playFromFirst();

        expect(elA.animate).toHaveBeenCalledOnce();
        expect(elB.animate).not.toHaveBeenCalled();
      });
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  describe('element lifecycle', () => {
    it('new elements (not in first snapshot) are not animated', () => {
      withRoot(() => {
        const elA = createMockElement({ x: 0, y: 0, width: 200, height: 40 });
        const elements = new Map<string, HTMLElement>([['a', elA]]);
        const flip = createFlip({ elements });

        flip.captureFirst();

        // Add new element after capture
        const elNew = createMockElement({ x: 0, y: 50, width: 200, height: 40 });
        elements.set('new', elNew);

        flip.playFromFirst();

        expect(elNew.animate).not.toHaveBeenCalled();
      });
    });

    it('removed elements (not in last snapshot) are not animated', () => {
      withRoot(() => {
        const elA = createMockElement({ x: 0, y: 0, width: 200, height: 40 });
        const elB = createMockElement({ x: 0, y: 50, width: 200, height: 40 });
        const elements = new Map<string, HTMLElement>([
          ['a', elA],
          ['b', elB]
        ]);
        const flip = createFlip({ elements });

        flip.captureFirst();

        // Remove element B before measuring last
        elements.delete('b');

        flip.playFromFirst();

        // B was removed, so only A would be considered (but A didn't move either)
        expect(elB.animate).not.toHaveBeenCalled();
      });
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  describe('isAnimating state', () => {
    it('starts as false', () => {
      withRoot(() => {
        const elements = new Map<string, HTMLElement>();
        const flip = createFlip({ elements });
        expect(flip.isAnimating()).toBe(false);
      });
    });

    it('becomes true when animation starts', () => {
      withRoot(() => {
        const elA = createMockElement({ x: 0, y: 0, width: 200, height: 40 });
        const elements = new Map<string, HTMLElement>([['a', elA]]);
        const flip = createFlip({ elements });

        flip.captureFirst();
        elA._setRect({ x: 0, y: 100, width: 200, height: 40 });
        flip.playFromFirst();

        expect(flip.isAnimating()).toBe(true);
      });
    });

    it('becomes false after all animations finish', async () => {
      const result = await new Promise<boolean>((resolve) => {
        createRoot(async (dispose) => {
          const elA = createMockElement({ x: 0, y: 0, width: 200, height: 40 });
          const elements = new Map<string, HTMLElement>([['a', elA]]);
          const flip = createFlip({ elements });

          flip.captureFirst();
          elA._setRect({ x: 0, y: 100, width: 200, height: 40 });
          flip.playFromFirst();

          expect(flip.isAnimating()).toBe(true);

          // Finish the animation
          const mockEl = elA as MockElement;
          mockEl._animationHandles[0]._finish();

          // Wait for Promise.all chain to settle (needs a few microtask rounds)
          await new Promise((r) => setTimeout(r, 10));

          const val = flip.isAnimating();
          dispose();
          resolve(val);
        });
      });

      expect(result).toBe(false);
    });

    it('stays false when no elements moved', () => {
      withRoot(() => {
        const elA = createMockElement({ x: 0, y: 0, width: 200, height: 40 });
        const elements = new Map<string, HTMLElement>([['a', elA]]);
        const flip = createFlip({ elements });

        flip.captureFirst();
        // Don't change any rects
        flip.playFromFirst();

        expect(flip.isAnimating()).toBe(false);
      });
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  describe('no-ops and edge cases', () => {
    it('playFromFirst without captureFirst → no-op', () => {
      withRoot(() => {
        const elA = createMockElement({ x: 0, y: 0, width: 200, height: 40 });
        const elements = new Map<string, HTMLElement>([['a', elA]]);
        const flip = createFlip({ elements });

        flip.playFromFirst(); // Should not throw or animate

        expect(elA.animate).not.toHaveBeenCalled();
        expect(flip.isAnimating()).toBe(false);
      });
    });

    it('empty elements map → no crash', () => {
      withRoot(() => {
        const elements = new Map<string, HTMLElement>();
        const flip = createFlip({ elements });

        flip.captureFirst();
        flip.playFromFirst();

        expect(flip.isAnimating()).toBe(false);
      });
    });

    it('captureFirst clears after playFromFirst (cannot play twice)', () => {
      withRoot(() => {
        const elA = createMockElement({ x: 0, y: 0, width: 200, height: 40 });
        const elements = new Map<string, HTMLElement>([['a', elA]]);
        const flip = createFlip({ elements });

        flip.captureFirst();
        elA._setRect({ x: 0, y: 100, width: 200, height: 40 });
        flip.playFromFirst();

        expect(elA.animate).toHaveBeenCalledOnce();

        // Second play without new captureFirst → no-op
        flip.playFromFirst();
        expect(elA.animate).toHaveBeenCalledOnce(); // still just once
      });
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  describe('rapid consecutive animations', () => {
    it('cancels previous animations when a new FLIP cycle starts', () => {
      withRoot(() => {
        const elA = createMockElement({ x: 0, y: 0, width: 200, height: 40 });
        const elements = new Map<string, HTMLElement>([['a', elA]]);
        const flip = createFlip({ elements });

        // First cycle
        flip.captureFirst();
        elA._setRect({ x: 0, y: 100, width: 200, height: 40 });
        flip.playFromFirst();

        const firstAnim = (elA as MockElement)._animationHandles[0];

        // Second cycle before first finishes
        flip.captureFirst();
        elA._setRect({ x: 0, y: 200, width: 200, height: 40 });
        flip.playFromFirst();

        // First animation should have been cancelled
        expect(firstAnim.cancel).toHaveBeenCalledOnce();
        // Two total animate() calls
        expect(elA.animate).toHaveBeenCalledTimes(2);
      });
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  describe('custom duration and easing', () => {
    it('passes custom duration to animate()', () => {
      withRoot(() => {
        const elA = createMockElement({ x: 0, y: 0, width: 200, height: 40 });
        const elements = new Map<string, HTMLElement>([['a', elA]]);
        const flip = createFlip({ elements, duration: 500, easing: 'ease-in-out' });

        flip.captureFirst();
        elA._setRect({ x: 0, y: 50, width: 200, height: 40 });
        flip.playFromFirst();

        const [, options] = (elA.animate as ReturnType<typeof vi.fn>).mock.calls[0];
        expect(options).toMatchObject({ duration: 500, easing: 'ease-in-out' });
      });
    });

    it('reads duration at call time (supports dynamic values via getter)', () => {
      withRoot(() => {
        const elA = createMockElement({ x: 0, y: 0, width: 200, height: 40 });
        const elements = new Map<string, HTMLElement>([['a', elA]]);
        const opts = { elements, duration: 200 };
        const flip = createFlip(opts);

        // Change duration before playing
        opts.duration = 350;

        flip.captureFirst();
        elA._setRect({ x: 0, y: 50, width: 200, height: 40 });
        flip.playFromFirst();

        const [, options] = (elA.animate as ReturnType<typeof vi.fn>).mock.calls[0];
        expect(options.duration).toBe(350);
      });
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  describe('3-item reorder scenario', () => {
    it('reordering A,B,C → C,A,B animates all three', () => {
      withRoot(() => {
        const elA = createMockElement({ x: 0, y: 0, width: 200, height: 40 });
        const elB = createMockElement({ x: 0, y: 50, width: 200, height: 40 });
        const elC = createMockElement({ x: 0, y: 100, width: 200, height: 40 });
        const elements = new Map<string, HTMLElement>([
          ['a', elA],
          ['b', elB],
          ['c', elC]
        ]);
        const flip = createFlip({ elements });

        flip.captureFirst();

        // Reorder: C, A, B
        elC._setRect({ x: 0, y: 0, width: 200, height: 40 });
        elA._setRect({ x: 0, y: 50, width: 200, height: 40 });
        elB._setRect({ x: 0, y: 100, width: 200, height: 40 });

        flip.playFromFirst();

        expect(elA.animate).toHaveBeenCalledOnce();
        expect(elB.animate).toHaveBeenCalledOnce();
        expect(elC.animate).toHaveBeenCalledOnce();

        // A: y went from 0 → 50, delta.dy = 0 - 50 = -50
        const [kfA] = (elA.animate as ReturnType<typeof vi.fn>).mock.calls[0];
        expect(kfA[0].transform).toBe('translate(0px, -50px)');

        // B: y went from 50 → 100, delta.dy = 50 - 100 = -50
        const [kfB] = (elB.animate as ReturnType<typeof vi.fn>).mock.calls[0];
        expect(kfB[0].transform).toBe('translate(0px, -50px)');

        // C: y went from 100 → 0, delta.dy = 100 - 0 = 100
        const [kfC] = (elC.animate as ReturnType<typeof vi.fn>).mock.calls[0];
        expect(kfC[0].transform).toBe('translate(0px, 100px)');
      });
    });
  });

  // ────────────────────────────────────────────────────────────────────────
  describe('animate() convenience method', () => {
    it('captures, runs fn, and plays animation', () => {
      withRoot(() => {
        const elA = createMockElement({ x: 0, y: 0, width: 200, height: 40 });
        const elB = createMockElement({ x: 0, y: 50, width: 200, height: 40 });
        const elements = new Map<string, HTMLElement>([
          ['a', elA],
          ['b', elB]
        ]);
        const flip = createFlip({ elements });

        let fnCalled = false;
        flip.animate(() => {
          fnCalled = true;
          // Simulate DOM reorder: swap A and B
          elA._setRect({ x: 0, y: 50, width: 200, height: 40 });
          elB._setRect({ x: 0, y: 0, width: 200, height: 40 });
        });

        expect(fnCalled).toBe(true);
        expect(elA.animate).toHaveBeenCalledOnce();
        expect(elB.animate).toHaveBeenCalledOnce();
      });
    });

    it('applies per-call duration override', () => {
      withRoot(() => {
        const elA = createMockElement({ x: 0, y: 0, width: 200, height: 40 });
        const elements = new Map<string, HTMLElement>([['a', elA]]);
        const flip = createFlip({ elements, duration: 200 });

        flip.animate(
          () => {
            elA._setRect({ x: 0, y: 50, width: 200, height: 40 });
          },
          { duration: 500 }
        );

        const [, options] = (elA.animate as ReturnType<typeof vi.fn>).mock.calls[0];
        expect(options.duration).toBe(500);
      });
    });

    it('restores original duration after per-call override', () => {
      withRoot(() => {
        const elA = createMockElement({ x: 0, y: 0, width: 200, height: 40 });
        const elements = new Map<string, HTMLElement>([['a', elA]]);
        const flip = createFlip({ elements, duration: 200 });

        // First call with override
        flip.animate(
          () => {
            elA._setRect({ x: 0, y: 50, width: 200, height: 40 });
          },
          { duration: 500 }
        );

        // Reset for second call
        (elA.animate as ReturnType<typeof vi.fn>).mockClear();
        elA._setRect({ x: 0, y: 0, width: 200, height: 40 });

        // Second call without override — should use original 200
        flip.animate(() => {
          elA._setRect({ x: 0, y: 50, width: 200, height: 40 });
        });

        const [, options] = (elA.animate as ReturnType<typeof vi.fn>).mock.calls[0];
        expect(options.duration).toBe(200);
      });
    });

    it('is a no-op when fn causes no movement', () => {
      withRoot(() => {
        const elA = createMockElement({ x: 0, y: 0, width: 200, height: 40 });
        const elements = new Map<string, HTMLElement>([['a', elA]]);
        const flip = createFlip({ elements });

        flip.animate(() => {
          // No rect change
        });

        expect(elA.animate).not.toHaveBeenCalled();
        expect(flip.isAnimating()).toBe(false);
      });
    });
  });
});
