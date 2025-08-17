const TIME = 0;
const DURATION = 100;
const INITIAL_VALUE = 0;
const DELTA_VALUE = 1;

/**
 * Linear interpolation function.
 * @param time current time (ms, s, frames, ...)
 * @param initial initial value
 * @param delta change in value (final value - initial value)
 * @param duration duration (same units as t)
 * @returns the calculated value at time t
 */
export function linear(
  time: number = TIME,
  initial: number = INITIAL_VALUE,
  delta: number = DELTA_VALUE,
  duration: number = DURATION
) {
  return (delta * time) / duration + initial;
}

/**
 * @param time current time (ms, s, frames, ...)
 * @param initial initial value
 * @param delta change in value (final value - initial value)
 * @param duration duration (same units as t)
 * @returns the calculated value at time t
 */
export function easeInQuad(
  time: number = TIME,
  initial: number = INITIAL_VALUE,
  delta: number = DELTA_VALUE,
  duration: number = DURATION
) {
  return delta * (time /= duration) * time + initial;
}

/**
 * @param time current time (ms, s, frames, ...)
 * @param initial initial value
 * @param delta change in value (final value - initial value)
 * @param duration duration (same units as t)
 * @returns the calculated value at time t
 */
export function easeOutQuad(
  time: number = TIME,
  initial: number = INITIAL_VALUE,
  delta: number = DELTA_VALUE,
  duration: number = DURATION
) {
  return -delta * (time /= duration) * (time - 2) + initial;
}

/**
 * @param time current time (ms, s, frames, ...)
 * @param initial initial value
 * @param delta change in value (final value - initial value)
 * @param duration duration (same units as t)
 * @returns the calculated value at time t
 */
export function easeInOutQuad(
  time: number = TIME,
  initial: number = INITIAL_VALUE,
  delta: number = DELTA_VALUE,
  duration: number = DURATION
) {
  if ((time /= duration / 2) < 1) {
    return (delta / 2) * time * time + initial;
  } else {
    return (-delta / 2) * (--time * (time - 2) - 1) + initial;
  }
}

/**
 * @param time current time (ms, s, frames, ...)
 * @param initial initial value
 * @param delta change in value (final value - initial value)
 * @param duration duration (same units as t)
 * @returns the calculated value at time t
 */
export function easeInCubic(
  time: number = TIME,
  initial: number = INITIAL_VALUE,
  delta: number = DELTA_VALUE,
  duration: number = DURATION
) {
  return delta * (time /= duration) * time * time + initial;
}

/**
 * @param time current time (ms, s, frames, ...)
 * @param initial initial value
 * @param delta change in value (final value - initial value)
 * @param duration duration (same units as t)
 * @returns the calculated value at time t
 */
export function easeOutCubic(
  time: number = TIME,
  initial: number = INITIAL_VALUE,
  delta: number = DELTA_VALUE,
  duration: number = DURATION
) {
  return delta * ((time = time / duration - 1) * time * time + 1) + initial;
}

/**
 * @param time current time (ms, s, frames, ...)
 * @param initial initial value
 * @param delta change in value (final value - initial value)
 * @param duration duration (same units as t)
 * @returns the calculated value at time t
 */
export function easeInOutCubic(
  time: number = TIME,
  initial: number = INITIAL_VALUE,
  delta: number = DELTA_VALUE,
  duration: number = DURATION
) {
  if ((time /= duration / 2) < 1) {
    return (delta / 2) * time * time * time + initial;
  } else {
    return (delta / 2) * ((time -= 2) * time * time + 2) + initial;
  }
}

/**
 * @param time current time (ms, s, frames, ...)
 * @param initial initial value
 * @param delta change in value (final value - initial value)
 * @param duration duration (same units as t)
 * @returns the calculated value at time t
 */
export function easeInQuart(
  time: number = TIME,
  initial: number = INITIAL_VALUE,
  delta: number = DELTA_VALUE,
  duration: number = DURATION
) {
  return delta * (time /= duration) * time * time * time + initial;
}

/**
 * @param time current time (ms, s, frames, ...)
 * @param initial initial value
 * @param delta change in value (final value - initial value)
 * @param duration duration (same units as t)
 * @returns the calculated value at time t
 */
export function easeOutQuart(
  time: number = TIME,
  initial: number = INITIAL_VALUE,
  delta: number = DELTA_VALUE,
  duration: number = DURATION
) {
  return -delta * ((time = time / duration - 1) * time * time * time - 1) + initial;
}

/**
 * @param time current time (ms, s, frames, ...)
 * @param initial initial value
 * @param delta change in value (final value - initial value)
 * @param duration duration (same units as t)
 * @returns the calculated value at time t
 */
export function easeInOutQuart(
  time: number = TIME,
  initial: number = INITIAL_VALUE,
  delta: number = DELTA_VALUE,
  duration: number = DURATION
) {
  if ((time /= duration / 2) < 1) {
    return (delta / 2) * time * time * time * time + initial;
  } else {
    return (-delta / 2) * ((time -= 2) * time * time * time - 2) + initial;
  }
}

/**
 * @param time current time (ms, s, frames, ...)
 * @param initial initial value
 * @param delta change in value (final value - initial value)
 * @param duration duration (same units as t)
 * @returns the calculated value at time t
 */
export function easeInQuint(
  time: number = TIME,
  initial: number = INITIAL_VALUE,
  delta: number = DELTA_VALUE,
  duration: number = DURATION
) {
  return delta * (time /= duration) * time * time * time * time + initial;
}

/**
 * @param time current time (ms, s, frames, ...)
 * @param initial initial value
 * @param delta change in value (final value - initial value)
 * @param duration duration (same units as t)
 * @returns the calculated value at time t
 */
export function easeOutQuint(
  time: number = TIME,
  initial: number = INITIAL_VALUE,
  delta: number = DELTA_VALUE,
  duration: number = DURATION
) {
  return delta * ((time = time / duration - 1) * time * time * time * time + 1) + initial;
}

/**
 * @param time current time (ms, s, frames, ...)
 * @param initial initial value
 * @param delta change in value (final value - initial value)
 * @param duration duration (same units as t)
 * @returns the calculated value at time t
 */
export function easeInOutQuint(
  time: number = TIME,
  initial: number = INITIAL_VALUE,
  delta: number = DELTA_VALUE,
  duration: number = DURATION
) {
  if ((time /= duration / 2) < 1) {
    return (delta / 2) * time * time * time * time * time + initial;
  } else {
    return (delta / 2) * ((time -= 2) * time * time * time * time + 2) + initial;
  }
}

/**
 * @param time current time (ms, s, frames, ...)
 * @param initial initial value
 * @param delta change in value (final value - initial value)
 * @param duration duration (same units as t)
 * @returns the calculated value at time t
 */
export function easeInSine(
  time: number = TIME,
  initial: number = INITIAL_VALUE,
  delta: number = DELTA_VALUE,
  duration: number = DURATION
) {
  return -delta * Math.cos((time / duration) * (Math.PI / 2)) + delta + initial;
}

/**
 * @param time current time (ms, s, frames, ...)
 * @param initial initial value
 * @param delta change in value (final value - initial value)
 * @param duration duration (same units as t)
 * @returns the calculated value at time t
 */
export function easeOutSine(
  time: number = TIME,
  initial: number = INITIAL_VALUE,
  delta: number = DELTA_VALUE,
  duration: number = DURATION
) {
  return delta * Math.sin((time / duration) * (Math.PI / 2)) + initial;
}

/**
 * @param time current time (ms, s, frames, ...)
 * @param initial initial value
 * @param delta change in value (final value - initial value)
 * @param duration duration (same units as t)
 * @returns the calculated value at time t
 */
export function easeInOutSine(
  time: number = TIME,
  initial: number = INITIAL_VALUE,
  delta: number = DELTA_VALUE,
  duration: number = DURATION
) {
  return (-delta / 2) * (Math.cos((Math.PI * time) / duration) - 1) + initial;
}

/**
 * @param time current time (ms, s, frames, ...)
 * @param initial initial value
 * @param delta change in value (final value - initial value)
 * @param duration duration (same units as t)
 * @returns the calculated value at time t
 */
export function easeInExpo(
  time: number = TIME,
  initial: number = INITIAL_VALUE,
  delta: number = DELTA_VALUE,
  duration: number = DURATION
) {
  if (time === 0) {
    return initial;
  } else {
    return delta * Math.pow(2, 10 * (time / duration - 1)) + initial;
  }
}

/**
 * @param time current time (ms, s, frames, ...)
 * @param initial initial value
 * @param delta change in value (final value - initial value)
 * @param duration duration (same units as t)
 * @returns the calculated value at time t
 */
export function easeOutExpo(
  time: number = TIME,
  initial: number = INITIAL_VALUE,
  delta: number = DELTA_VALUE,
  duration: number = DURATION
) {
  if (time === duration) {
    return initial + delta;
  } else {
    return delta * (-Math.pow(2, (-10 * time) / duration) + 1) + initial;
  }
}

/**
 * @param time current time (ms, s, frames, ...)
 * @param initial initial value
 * @param delta change in value (final value - initial value)
 * @param duration duration (same units as t)
 * @returns the calculated value at time t
 */
export function easeInOutExpo(
  time: number = TIME,
  initial: number = INITIAL_VALUE,
  delta: number = DELTA_VALUE,
  duration: number = DURATION
) {
  if (time === 0) {
    return initial;
  }
  if (time === duration) {
    return initial + delta;
  }
  if ((time /= duration / 2) < 1) {
    return (delta / 2) * Math.pow(2, 10 * (time - 1)) + initial;
  } else {
    return (delta / 2) * (-Math.pow(2, -10 * --time) + 2) + initial;
  }
}

/**
 * @param time current time (ms, s, frames, ...)
 * @param initial initial value
 * @param delta change in value (final value - initial value)
 * @param duration duration (same units as t)
 * @returns the calculated value at time t
 */
export function easeInCirc(
  time: number = TIME,
  initial: number = INITIAL_VALUE,
  delta: number = DELTA_VALUE,
  duration: number = DURATION
) {
  return -delta * (Math.sqrt(1 - (time /= duration) * time) - 1) + initial;
}

/**
 * @param time current time (ms, s, frames, ...)
 * @param initial initial value
 * @param delta change in value (final value - initial value)
 * @param duration duration (same units as t)
 * @returns the calculated value at time t
 */
export function easeOutCirc(
  time: number = TIME,
  initial: number = INITIAL_VALUE,
  delta: number = DELTA_VALUE,
  duration: number = DURATION
) {
  return delta * Math.sqrt(1 - (time = time / duration - 1) * time) + initial;
}

/**
 * @param time current time (ms, s, frames, ...)
 * @param initial initial value
 * @param delta change in value (final value - initial value)
 * @param duration duration (same units as t)
 * @returns the calculated value at time t
 */
export function easeInOutCirc(
  time: number = TIME,
  initial: number = INITIAL_VALUE,
  delta: number = DELTA_VALUE,
  duration: number = DURATION
) {
  if ((time /= duration / 2) < 1) {
    return (-delta / 2) * (Math.sqrt(1 - time * time) - 1) + initial;
  } else {
    return (delta / 2) * (Math.sqrt(1 - (time -= 2) * time) + 1) + initial;
  }
}

// 10% overshoot
const OVERTSHOOT = 1.70158;

/**
 * @param time current time (ms, s, frames, ...)
 * @param initial initial value
 * @param delta change in value (final value - initial value)
 * @param duration duration (same units as t)
 * @returns the calculated value at time t
 */
export function easeInElastic(
  time: number = TIME,
  initial: number = INITIAL_VALUE,
  delta: number = DELTA_VALUE,
  duration: number = DURATION
) {
  let s = OVERTSHOOT;
  let p = 0;
  let a = delta;
  if (time === 0) {
    return initial;
  } else if ((time /= duration) === 1) {
    return initial + delta;
  }
  if (!p) {
    p = duration * 0.3;
  }
  if (a < Math.abs(delta)) {
    a = delta;
    s = p / 4;
  } else {
    s = (p / (2 * Math.PI)) * Math.asin(delta / a);
  }
  return -(a * Math.pow(2, 10 * (time -= 1)) * Math.sin(((time * duration - s) * (2 * Math.PI)) / p)) + initial;
}

/**
 * @param time current time (ms, s, frames, ...)
 * @param initial initial value
 * @param delta change in value (final value - initial value)
 * @param duration duration (same units as t)
 * @returns the calculated value at time t
 */
export function easeOutElastic(
  time: number = TIME,
  initial: number = INITIAL_VALUE,
  delta: number = DELTA_VALUE,
  duration: number = DURATION
) {
  let s = OVERTSHOOT;
  let p = 0;
  let a = delta;
  if (time === 0) {
    return initial;
  } else if ((time /= duration) === 1) {
    return initial + delta;
  }
  if (!p) {
    p = duration * 0.3;
  }
  if (a < Math.abs(delta)) {
    a = delta;
    s = p / 4;
  } else {
    s = (p / (2 * Math.PI)) * Math.asin(delta / a);
  }
  return a * Math.pow(2, -10 * time) * Math.sin(((time * duration - s) * (2 * Math.PI)) / p) + delta + initial;
}

/**
 * @param time current time (ms, s, frames, ...)
 * @param initial initial value
 * @param delta change in value (final value - initial value)
 * @param duration duration (same units as t)
 * @returns the calculated value at time t
 */
export function easeInOutElastic(
  time: number = TIME,
  initial: number = INITIAL_VALUE,
  delta: number = DELTA_VALUE,
  duration: number = DURATION
) {
  let s = OVERTSHOOT;
  let p = 0;
  let a = delta;
  if (time === 0) {
    return initial;
  } else if ((time /= duration / 2) === 2) {
    return initial + delta;
  }
  if (!p) {
    p = duration * (0.3 * 1.5);
  }
  if (a < Math.abs(delta)) {
    a = delta;
    s = p / 4;
  } else {
    s = (p / (2 * Math.PI)) * Math.asin(delta / a);
  }
  if (time < 1) {
    return -0.5 * (a * Math.pow(2, 10 * (time -= 1)) * Math.sin(((time * duration - s) * (2 * Math.PI)) / p)) + initial;
  } else {
    return (
      a * Math.pow(2, -10 * (time -= 1)) * Math.sin(((time * duration - s) * (2 * Math.PI)) / p) * 0.5 + delta + initial
    );
  }
}

/**
 * @param time current time (ms, s, frames, ...)
 * @param initial initial value
 * @param delta change in value (final value - initial value)
 * @param duration duration (same units as t)
 * @returns the calculated value at time t
 */
export function easeInBack(
  time: number = TIME,
  initial: number = INITIAL_VALUE,
  delta: number = DELTA_VALUE,
  duration: number = DURATION,
  s: number = OVERTSHOOT
) {
  return delta * (time /= duration) * time * ((s + 1) * time - s) + initial;
}

/**
 * @param time current time (ms, s, frames, ...)
 * @param initial initial value
 * @param delta change in value (final value - initial value)
 * @param duration duration (same units as t)
 * @returns the calculated value at time t
 */
export function easeOutBack(
  time: number = TIME,
  initial: number = INITIAL_VALUE,
  delta: number = DELTA_VALUE,
  duration: number = DURATION,
  s: number = OVERTSHOOT
) {
  return delta * ((time = time / duration - 1) * time * ((s + 1) * time + s) + 1) + initial;
}

/**
 * @param time current time (ms, s, frames, ...)
 * @param initial initial value
 * @param delta change in value (final value - initial value)
 * @param duration duration (same units as t)
 * @returns the calculated value at time t
 */
export function easeInOutBack(
  t: number = 0,
  initial: number = INITIAL_VALUE,
  delta: number = DELTA_VALUE,
  duration: number = DURATION,
  s: number = OVERTSHOOT
) {
  if ((t /= duration / 2) < 1) {
    return (delta / 2) * (t * t * (((s *= 1.525) + 1) * t - s)) + initial;
  } else {
    return (delta / 2) * ((t -= 2) * t * (((s *= 1.525) + 1) * t + s) + 2) + initial;
  }
}

/**
 * @param time current time (ms, s, frames, ...)
 * @param initial initial value
 * @param delta change in value (final value - initial value)
 * @param duration duration (same units as t)
 * @returns the calculated value at time t
 */
export function easeInBounce(
  time: number = TIME,
  initial: number = INITIAL_VALUE,
  delta: number = DELTA_VALUE,
  duration: number = DURATION
) {
  const v = easeOutBounce(duration - time, 0, delta, duration);
  return delta - v + initial;
}

/**
 * @param time current time (ms, s, frames, ...)
 * @param initial initial value
 * @param delta change in value (final value - initial value)
 * @param duration duration (same units as t)
 * @returns the calculated value at time t
 */
export function easeOutBounce(
  time: number = TIME,
  initial: number = INITIAL_VALUE,
  delta: number = DELTA_VALUE,
  duration: number = DURATION
) {
  if ((time /= duration) < 1 / 2.75) {
    return delta * (7.5625 * time * time) + initial;
  } else if (time < 2 / 2.75) {
    return delta * (7.5625 * (time -= 1.5 / 2.75) * time + 0.75) + initial;
  } else if (time < 2.5 / 2.75) {
    return delta * (7.5625 * (time -= 2.25 / 2.75) * time + 0.9375) + initial;
  } else {
    return delta * (7.5625 * (time -= 2.625 / 2.75) * time + 0.984375) + initial;
  }
}

/**
 * @param time current time (ms, s, frames, ...)
 * @param initial initial value
 * @param delta change in value (final value - initial value)
 * @param duration duration (same units as t)
 * @returns the calculated value at time t
 */
export function easeInOutBounce(
  time: number = TIME,
  initial: number = INITIAL_VALUE,
  delta: number = DELTA_VALUE,
  duration: number = DURATION
) {
  let v;
  if (time < duration / 2) {
    v = easeInBounce(time * 2, 0, delta, duration);
    return v * 0.5 + initial;
  } else {
    v = easeOutBounce(time * 2 - duration, 0, delta, duration);
    return v * 0.5 + delta * 0.5 + initial;
  }
}
