import { Timeline } from './timeline';
import { Tween } from './tween';
import { merge } from './utils';

export const globals: any = {
  TweenMax: Tween,
  TweenLite: Tween,
  TimelineLite: Timeline,
  TimelineMax: Timeline,
};

export let installScope: any = {};
export let install = (scope: any) =>
  (installScope = merge(scope, globals)) && gsap;

export const addGlobal = (name: string, obj: any) =>
  (name &&
    (globals[name] = obj) &&
    installScope &&
    (installScope[name] = obj)) ||
  globals;
