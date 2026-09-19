import { PropsProxyExample1 } from './example-1';
import { PropsProxyExample2 } from './example-2';
import { PropsProxyExample3 } from './example-3';
import { PropsProxyExample4 } from './example-4';
import { PropsProxyExample5 } from './example-5';
import { PropsProxyExample6 } from './example-6';
import { PropsProxyExample8 } from './example-8';

/** Historical API experiments, mounted only when explicitly expanded. */
export default function LegacyExamples() {
  return (
    <div class="pp-legacy-content">
      <PropsProxyExample1 />
      <PropsProxyExample2 />
      <PropsProxyExample3 />
      <PropsProxyExample4 />
      <PropsProxyExample5 />
      <PropsProxyExample6 />
      <PropsProxyExample8 />
    </div>
  );
}
