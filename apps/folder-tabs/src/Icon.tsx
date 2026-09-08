import { Dynamic } from '@solidjs/web';
import ArrowDownLeftIcon from './icons/arrow-down-left.svg';
import ArrowDownIcon from './icons/arrow-down.svg';
import ArrowRightIcon from './icons/arrow-right.svg';
import ArrowUpRightIcon from './icons/arrow-up-right.svg';
import CloseIcon from './icons/close.svg';
import PauseIcon from './icons/pause.svg';
import PlayIcon from './icons/play.svg';
import PlusIcon from './icons/plus.svg';
import SearchIcon from './icons/search.svg';

/** Local SVG components render inline and inherit their control's text color. */
export function Icon(props: { name: keyof typeof icons }) {
  return <Dynamic component={icons[props.name]} class="icon" aria-hidden="true" />;
}

const icons = {
  arrowDown: ArrowDownIcon,
  arrowDownLeft: ArrowDownLeftIcon,
  arrowRight: ArrowRightIcon,
  arrowUpRight: ArrowUpRightIcon,
  search: SearchIcon,
  plus: PlusIcon,
  play: PlayIcon,
  pause: PauseIcon,
  x: CloseIcon
};
