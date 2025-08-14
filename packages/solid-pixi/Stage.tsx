import { Container } from 'pixi.js';
import type { JSXElement } from 'solid-js';
import { useApplication } from './Application';
import { insert } from './runtime';

export function Stage(props: { children: JSXElement }) {
  const application = useApplication();

  insert(application.stage, () => props.children);
  return application.stage as Container & JSXElement;
}
