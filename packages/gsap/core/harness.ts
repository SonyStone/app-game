import { GSCache } from './GSCache';
import { isFunction, isObject } from './utils';

export const harnessPlugins: any = [];
export const harness = (targets: any[]) => {
  let target = targets[0];
  let harnessPlugin;
  let i;

  isObject(target) || isFunction(target) || (targets = [targets]);
  if (!(harnessPlugin = (target._gsap || {}).harness)) {
    // find the first target with a harness. We assume targets passed into an animation will be of similar type, meaning the same kind of harness can be used for them all (performance optimization)
    i = harnessPlugins.length;
    while (i-- && !harnessPlugins[i].targetTest(target)) {}
    harnessPlugin = harnessPlugins[i];
  }
  i = targets.length;
  while (i--) {
    (targets[i] &&
      (targets[i]._gsap ||
        (targets[i]._gsap = new GSCache(targets[i], harnessPlugin)))) ||
      targets.splice(i, 1);
  }
  return targets;
};
