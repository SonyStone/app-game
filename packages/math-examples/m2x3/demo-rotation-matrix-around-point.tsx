import { GridSVG } from '@app-game/debug-layer/grid-svg';
import { Mat2x3 } from '@app-game/math/m2x3';
import { Degrees } from '@app-game/math/types';
import { degToRad } from '@app-game/math/utils/trigonometry';
import { Vec2 } from '@app-game/math/v2';
import { toObservable } from '@utils/toObservable';
import { animationFrames, map, merge, of, Subject, switchScan } from 'rxjs';
import { Accessor, createMemo, createSignal, from } from 'solid-js';
import { usePointMove } from './use-point-move';

export function DemoRotationMatrixAroundPoint() {
  const origin = usePointMove(Vec2.create(50, 50));

  const mat = new Mat2x3(new Float32Array(6)).identity();

  const [play, setPlay] = createSignal(false);
  const reset = new Subject<void>();
  const angle = from(
    merge(toObservable(play), reset).pipe(
      switchScan((acc, isPlay) => {
        if (isPlay === true) {
          return animationFrames().pipe(map(({ elapsed }) => ((acc + elapsed / 10) % 360) as Degrees));
        }
        if (isPlay === false) {
          return of(acc);
        }
        return of(0);
      }, 0)
    )
  ) as Accessor<Degrees>;

  const matCss = createMemo(() => mat.identity().rotateOrigin(degToRad(angle()), origin.translation()).toCssMatrix());

  return (
    <g class="translate-x-100px translate-y-300px">
      <GridSVG />
      <g class="translate-y-[-12px]">
        <circle class="hover:fill-red transition-colors" cy="0" r="10" onClick={() => setPlay(!play())} />
        <text class="pointer-events-none select-none" font-size="10" x="-9" y="2" fill="white">
          play
        </text>
      </g>
      <g class="translate-x-[24px] translate-y-[-12px]">
        <circle
          class="hover:fill-red transition-colors"
          cy="0"
          r="10"
          onClick={() => {
            reset.next();
            setPlay(false);
          }}
        />
      </g>
      <g
        style={{
          transform: matCss(),
          'transform-origin': '0 0'
        }}
      >
        <rect class="pointer-events-none select-none" x="0" y="0" width="100" height="100" fill="red" opacity={0.5} />
        <GridSVG color="blue" />
      </g>

      <circle
        class="hover:fill-red transition-colors"
        cx={origin.translation().x}
        cy={origin.translation().y}
        r="5"
        fill="black"
        onPointerDown={origin.handlePointerDown}
      />
    </g>
  );
}
