import type { RouteDefinition } from '@solidjs/router';
import type { JSX } from '@solidjs/web';
import type { Component } from 'solid-js';

export type Routes = Pick<RouteDefinition, 'path' | 'component'> & {
  name?: string | JSX.Element;
  Preview?: Component<{ name: string; path: string }>;
  children?: readonly Routes[];
};
