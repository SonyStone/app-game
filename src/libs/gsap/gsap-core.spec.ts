import { describe, expect, it } from 'vitest';
import { gsap } from './gsap-core';

describe('gsap', () => {
  it('shuld work', () => {
    console.log(`gsap`, gsap);

    expect(gsap).toBeTruthy();
  });
});
