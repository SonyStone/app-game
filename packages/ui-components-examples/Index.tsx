import { MatFormField } from '@packages/ui-components/form-field/MatFormField';
import { Title } from '@solidjs/meta';
import { Counter } from './TestContext';

export default function Index() {
  return (
    <>
      <Title>Index</Title>
      <MatFormField></MatFormField>

      <Counter></Counter>
    </>
  );
}
