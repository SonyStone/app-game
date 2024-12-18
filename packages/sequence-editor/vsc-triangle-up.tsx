import { ComponentProps } from 'solid-js';

export default function VscTriangleUp(props: ComponentProps<'svg'>) {
  return (
    <svg
      stroke="currentColor"
      fill="currentColor"
      stroke-width="0"
      viewBox="0 0 16 16"
      height="1em"
      width="1em"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path d="M14 10.44l-.413.56H2.393L2 10.46 7.627 5h.827L14 10.44z"></path>
    </svg>
  );
}
