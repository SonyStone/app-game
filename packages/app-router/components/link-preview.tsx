import type { JSX } from '@solidjs/web';
import { Component } from 'solid-js';

export const LinkPreview = (props: {
  path: string;
  name: string | JSX.Element;
  as:
    | Component<{
        name: string;
        path: string;
      }>
    | undefined;
}) => (props.as ? <props.as path={props.path} name={props.name as string} /> : <></>);
