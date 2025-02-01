import { RouteDefinition } from '@solidjs/router';
import { Component, JSX } from 'solid-js';

export type Routes = Pick<RouteDefinition, 'path' | 'component'> & {
  name?: string | JSX.Element;
  Preview?: Component<{ name: string; path: string }>;
  children?: Routes[];
};
