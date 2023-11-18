import { addGlobal } from './globals';
import { harnessPlugins } from './harness';
import {
  addPluginModifier,
  getSetter,
  killPropTweensOf,
  PropTween,
  renderPropTweens,
} from './proptween';
import { wake } from './tiker';
import { addPropTween } from './timeline';
import {
  copyExcluding,
  emptyFunc,
  isFunction,
  merge,
  setDefaults,
} from './utils';

export const plugins: any = {};
export const reservedProps: any = {};

interface Plugin {
  name: string;
  default?: any;
  init?(target: any, vars: any, tween: any, index: any, targets: any): void;
  rawVars?: number;
  targetTest?: any;
  register?: any;
}

export const createPlugin = (config: Plugin) => {
  config = (!config.name && config.default) || config; //UMD packaging wraps things oddly, so for example MotionPathHelper becomes {MotionPathHelper:MotionPathHelper, default:MotionPathHelper}.
  let name = config.name;
  const isFunc = isFunction(config);
  const Plugin: any =
    name && !isFunc && config.init
      ? function (this: any) {
          this._props = [];
        }
      : config; //in case someone passes in an object that's not a plugin, like CustomEase

  const instanceDefaults = {
    init: emptyFunc,
    render: renderPropTweens,
    add: addPropTween,
    kill: killPropTweensOf,
    modifier: addPluginModifier,
    rawVars: 0,
  };

  const statics = {
    targetTest: 0,
    get: 0,
    getSetter: getSetter,
    aliases: {},
    register: 0,
  };

  wake();

  if (config !== Plugin) {
    if (plugins[name]) {
      return;
    }

    setDefaults(
      Plugin,
      setDefaults(copyExcluding(config, instanceDefaults), statics)
    ); //static methods

    merge(
      Plugin.prototype,
      merge(instanceDefaults, copyExcluding(config, statics))
    ); //instance methods

    plugins[(Plugin.prop = name)] = Plugin;

    if (config.targetTest) {
      harnessPlugins.push(Plugin);
      reservedProps[name] = 1;
    }

    name =
      (name === 'css' ? 'CSS' : name.charAt(0).toUpperCase() + name.substr(1)) +
      'Plugin'; //for the global name. "motionPath" should become MotionPathPlugin
  }

  addGlobal(name, Plugin);
  config.register?.(gsap, Plugin, PropTween);
};
