import { type JSX } from 'solid-js';
import { markdownComponents } from '../markdown-components';
import PropsContent from './props.md?markdown';

export default function PropsPage(): JSX.Element {
  return <PropsContent components={markdownComponents} />;
}
