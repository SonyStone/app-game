import MatButton from '@packages/ui-components/button/MatButton';
import { Meta, Title } from '@solidjs/meta';
import { Outlet } from '@solidjs/router';

export default function Users() {
  return (
    <>
      <Title>Users</Title>
      <Meta name="example" content="whatever" />
      <MatButton variant="outlined" color="secondary" class="kjh">
        click me too!
      </MatButton>
      <MatButton variant="outlined" color="secondary" class="kjh">
        click me!
      </MatButton>

      <Outlet />
    </>
  );
}
