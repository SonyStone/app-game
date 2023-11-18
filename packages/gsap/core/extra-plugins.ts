// ---- EXTRA PLUGINS --------------------------------------------------------

import { forEachName, isString } from './utils';

const getPluginPropTween = (plugin: any, prop: any) => {
  let pt = plugin._pt;
  while (pt && pt.p !== prop && pt.op !== prop && pt.fp !== prop) {
    pt = pt._next;
  }
  return pt;
};

const addModifiers = (tween: any, modifiers: any) => {
  let targets = tween._targets,
    p,
    i,
    pt;
  for (p in modifiers) {
    i = targets.length;
    while (i--) {
      pt = tween._ptLookup[i][p];
      if (pt && (pt = pt.d)) {
        if (pt._pt) {
          // is a plugin
          pt = getPluginPropTween(pt, p);
        }
        pt && pt.modifier && pt.modifier(modifiers[p], tween, targets[i], p);
      }
    }
  }
};

export const buildModifierPlugin = (name: any, modifier?: any) => {
  return {
    name: name,
    rawVars: 1, //don't pre-process function-based values or "random()" strings.
    init(target: any, vars: any, tween: any) {
      tween._onInit = (tween: any) => {
        let temp: any, p;
        if (isString(vars)) {
          temp = {};
          forEachName(vars, (name: any) => (temp[name] = 1)); //if the user passes in a comma-delimited list of property names to roundProps, like "x,y", we round to whole numbers.
          vars = temp;
        }
        if (modifier) {
          temp = {};
          for (p in vars) {
            temp[p] = modifier(vars[p]);
          }
          vars = temp;
        }
        addModifiers(tween, vars);
      };
    },
  };
};
