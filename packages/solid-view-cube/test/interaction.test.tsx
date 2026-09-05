import { render } from '@solidjs/web'
import { createSignal, flush } from 'solid-js'
import { afterEach, expect, it, vi } from 'vitest'
import { ViewCube } from '../src/ViewCube'
import { targets } from '../src/cubeGeometry'
import {
  presetOrientation,
  rollOrientation,
  sameOrientation,
  type ViewNavigation
} from '../src/orientation'
import { createPointerGesture } from '../src/pointerGesture'

const cleanup: (() => void)[] = []
afterEach(() => {
  cleanup.splice(0).forEach((dispose) => dispose())
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

async function mount() {
  const host = document.createElement('div')
  document.body.append(host)
  const [orientation, setOrientation] = createSignal(presetOrientation([0, 0, 1]))
  const [disabled, setDisabled] = createSignal(false)
  const onNavigate = vi.fn((request: ViewNavigation) => setOrientation(request.orientation))
  const onHome = vi.fn()
  cleanup.push(
    render(
      () => (
        <ViewCube
          orientation={orientation()}
          disabled={disabled()}
          onNavigate={onNavigate}
          onHome={onHome}
          animated
        />
      ),
      host
    )
  )
  flush()
  await Promise.resolve()
  return { host, orientation, setOrientation, setDisabled, onNavigate, onHome }
}

function button(host: HTMLElement, name: string) {
  const found = [...host.querySelectorAll('button')].find(
    (b) => (b.getAttribute('aria-label') ?? b.textContent) === name
  )
  if (!found) throw new Error(`Missing ${name}`)
  return found
}

it('supports native keyboard click activation and ignores non-primary clicks', async () => {
  const { host, onHome, onNavigate } = await mount()
  const home = button(host, 'Home')
  home.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 0 }))
  expect(onHome).toHaveBeenCalledTimes(1)
  home.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 2 }))
  home.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 2 }))
  expect(onHome).toHaveBeenCalledTimes(1)
  button(host, 'Rotate view clockwise').click()
  expect(onNavigate).toHaveBeenCalledTimes(1)
  expect(onNavigate.mock.calls[0]![0].source).toBe('roll')
})

it('reflects external orientation, keeps roll controls, and respects disabled/reduced motion', async () => {
  const { host, setOrientation, setDisabled, onNavigate } = await mount()
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: true }))
  )
  button(host, 'Rotate view clockwise').click()
  expect(onNavigate.mock.calls[0]![0].transition).toBe('instant')
  setDisabled(true)
  flush()
  await Promise.resolve()
  button(host, 'Rotate view clockwise').click()
  expect(onNavigate).toHaveBeenCalledTimes(1)
  setOrientation(presetOrientation([1, -1, 1]))
  flush()
  await Promise.resolve()
  expect(host.querySelector('[aria-label="Rotate view clockwise"]')).not.toBeNull()
  expect(host.querySelector('[aria-label="View adjacent face up"]')).toBeNull()
  vi.unstubAllGlobals()
})

it('keeps Back/Bottom controls out of keyboard navigation in Top view', async () => {
  const { host } = await mount()
  const bottom = button(host, 'Bottom view')
  expect(bottom.parentElement!.style.visibility).toBe('hidden')
  expect(button(host, 'Top view').parentElement!.style.visibility).toBe('visible')
})

function pointer(type: string, x: number, y: number, id = 1, primary = true, mouseButton = 0) {
  const event = new MouseEvent(type, {
    clientX: x,
    clientY: y,
    button: mouseButton,
    bubbles: true,
    cancelable: true
  })
  Object.defineProperties(event, { pointerId: { value: id }, isPrimary: { value: primary } })
  return event as PointerEvent
}

function gestureHarness() {
  let orientation = presetOrientation([0, 0, 1])
  const element = document.createElement('button')
  const capture = new Set<number>()
  element.setPointerCapture = (id) => {
    capture.add(id)
  }
  element.hasPointerCapture = (id) => capture.has(id)
  element.releasePointerCapture = (id) => {
    capture.delete(id)
  }
  const emit = vi.fn((request: ViewNavigation) => {
    orientation = request.orientation
  })
  const finish = vi.fn()
  const gesture = createPointerGesture({
    orientation: () => orientation,
    disabled: () => false,
    emit,
    finish
  })
  return { gesture, element, capture, emit, finish, orientation: () => orientation }
}

it('owns one pointer, suppresses click after drag, and releases capture on cancel/unmount', () => {
  const { gesture, element, capture, emit, finish } = gestureHarness()
  gesture.start(pointer('pointerdown', 0, 0, 1, true, 2), element, 160)
  expect(capture.size).toBe(0)
  gesture.start(pointer('pointerdown', 0, 0), element, 160)
  gesture.start(pointer('pointerdown', 0, 0, 2, false), element, 160)
  gesture.move(pointer('pointermove', 20, 0, 2, false))
  expect(emit).not.toHaveBeenCalled()
  gesture.move(pointer('pointermove', 20, 0))
  expect(emit.mock.calls.map(([request]) => 'phase' in request && request.phase)).toEqual([
    'start',
    'move'
  ])
  gesture.up(pointer('pointerup', 20, 0))
  expect(capture.size).toBe(0)
  expect(finish).toHaveBeenCalledTimes(1)
  expect(gesture.click(new MouseEvent('click', { detail: 1 }))).toBe(false)
  expect(gesture.click(new MouseEvent('click', { detail: 0 }))).toBe(true)
  gesture.start(pointer('pointerdown', 0, 0), element, 160)
  gesture.move(pointer('pointermove', 20, 0))
  gesture.cancel(pointer('pointercancel', 20, 0))
  expect(capture.size).toBe(0)
  expect(finish).toHaveBeenCalledTimes(1)
  gesture.start(pointer('pointerdown', 0, 0), element, 160)
  gesture.dispose()
  expect(capture.size).toBe(0)
})

it('allows a normal click below threshold and cancels when an external camera update wins', () => {
  const { gesture, element, orientation, capture, emit } = gestureHarness()
  gesture.start(pointer('pointerdown', 0, 0), element, 160)
  gesture.move(pointer('pointermove', 2, 1))
  gesture.up(pointer('pointerup', 2, 1))
  expect(emit).not.toHaveBeenCalled()
  expect(gesture.click(new MouseEvent('click', { detail: 1 }))).toBe(true)
  gesture.start(pointer('pointerdown', 0, 0), element, 160)
  gesture.move(pointer('pointermove', 20, 0))
  gesture.sync(orientation(), false)
  expect(capture.size).toBe(1)
  const external = rollOrientation(orientation(), 0.4)
  gesture.sync(external, false)
  expect(capture.size).toBe(0)
  expect(sameOrientation(orientation(), external)).toBe(true)
  expect(emit.mock.calls.at(-1)![0]).toMatchObject({ phase: 'cancel' })
})

it('roll drag holds direction fixed, emits lifecycle, and suppresses the quarter-turn click', async () => {
  const { host, orientation, setOrientation, onNavigate } = await mount()
  const initial = presetOrientation([1, -1, 1])
  setOrientation(initial)
  flush()
  await Promise.resolve()
  const control = button(host, 'Rotate view clockwise')
  control.dispatchEvent(pointer('pointerdown', 30, 0))
  control.dispatchEvent(pointer('pointermove', 20, 20))
  control.dispatchEvent(pointer('pointerup', 20, 20))
  control.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }))
  expect(onNavigate.mock.calls.map(([request]) => request.source)).toEqual([
    'roll-drag',
    'roll-drag',
    'roll-drag'
  ])
  expect(onNavigate.mock.calls.map(([request]) => 'phase' in request && request.phase)).toEqual([
    'start',
    'move',
    'end'
  ])
  flush()
  await Promise.resolve()
  expect(sameOrientation(orientation(), rollOrientation(initial, Math.PI / 4))).toBe(true)
})

it('roll capture cancels on disable and never snaps the user-selected angle', () => {
  const { gesture, element, orientation, emit, finish, capture } = gestureHarness()
  gesture.start(pointer('pointerdown', 20, 0), element, 160, {
    source: 'roll-drag',
    axis: orientation().direction,
    angle: (x, y) => Math.atan2(y, x)
  })
  gesture.move(pointer('pointermove', 20, 10))
  gesture.up(pointer('pointerup', 20, 10))
  expect(finish).not.toHaveBeenCalled()
  gesture.start(pointer('pointerdown', 20, 0), element, 160, {
    source: 'roll-drag',
    axis: orientation().direction,
    angle: (x, y) => Math.atan2(y, x)
  })
  gesture.move(pointer('pointermove', 20, 10))
  gesture.sync(orientation(), true)
  expect(capture.size).toBe(0)
  expect(emit.mock.calls.at(-1)![0]).toMatchObject({ source: 'roll-drag', phase: 'cancel' })
})

it('hides adjacent arrows at a rolled pole and throughout a drag', async () => {
  const { host, setOrientation } = await mount()
  setOrientation(rollOrientation(presetOrientation([0, 0, -1]), 0.35))
  flush()
  await Promise.resolve()
  expect(host.querySelector('[aria-label="View adjacent face up"]')).toBeNull()
  expect(button(host, 'Rotate view clockwise')).toBeTruthy()
  setOrientation(presetOrientation([0, 0, 1]))
  flush()
  await Promise.resolve()
  expect(host.querySelector('[aria-label="View adjacent face up"]')).not.toBeNull()
  const control = button(host, 'Rotate view clockwise')
  control.dispatchEvent(pointer('pointerdown', 30, 0))
  control.dispatchEvent(pointer('pointermove', 0, 30))
  flush()
  await Promise.resolve()
  expect(host.querySelector('[aria-label="View adjacent face up"]')).toBeNull()
  control.dispatchEvent(pointer('pointerup', 0, 30))
  flush()
  await Promise.resolve()
  expect(host.querySelector('[aria-label="View adjacent face up"]')).not.toBeNull()
})

it('free roll pauses through the center and resumes without a half-turn jump', async () => {
  const { host, orientation } = await mount()
  const control = button(host, 'Rotate view clockwise')
  const initial = orientation()
  control.dispatchEvent(pointer('pointerdown', 30, 0))
  control.dispatchEvent(pointer('pointermove', 20, 20))
  control.dispatchEvent(pointer('pointermove', 0, 0))
  control.dispatchEvent(pointer('pointermove', -20, -20))
  flush()
  await Promise.resolve()
  expect(sameOrientation(orientation(), rollOrientation(initial, Math.PI / 4))).toBe(true)
  control.dispatchEvent(pointer('pointermove', 0, -30))
  control.dispatchEvent(pointer('pointerup', 0, -30))
  flush()
  await Promise.resolve()
  expect(sameOrientation(orientation(), rollOrientation(initial, Math.PI / 2))).toBe(true)
})

it('highlights each corner across three faces, each edge across two, and a face only once', async () => {
  const { host, onNavigate } = await mount()
  for (const target of targets) {
    const zones = [...host.querySelectorAll<HTMLButtonElement>('[data-view-target]')].filter(
      (zone) => zone.dataset.viewTarget === target.id
    )
    for (const zone of zones) {
      zone.dispatchEvent(pointer('pointerenter', 0, 0))
      flush()
      await Promise.resolve()
      const highlighted = [...host.querySelectorAll('[data-highlighted]')]
      expect(highlighted).toHaveLength(target.direction.filter((value) => value !== 0).length)
      expect(
        highlighted.every((element) => element.getAttribute('data-view-target') === target.id)
      ).toBe(true)
      zone.dispatchEvent(pointer('pointerleave', 0, 0))
      flush()
      await Promise.resolve()
      expect(host.querySelector('[data-highlighted]')).toBeNull()
    }
  }
  expect(onNavigate).not.toHaveBeenCalled()
})

it('shares keyboard focus highlight and clears it on blur or disable', async () => {
  const { host, setDisabled } = await mount()
  const corner = button(host, 'Top Front Right view')
  // jsdom has no input-modality tracking; the browser decides :focus-visible.
  vi.spyOn(corner, 'matches').mockImplementation((selector) => selector === ':focus-visible')
  corner.focus()
  flush()
  await Promise.resolve()
  expect(host.querySelectorAll('[data-highlighted]')).toHaveLength(3)
  corner.blur()
  flush()
  await Promise.resolve()
  expect(host.querySelector('[data-highlighted]')).toBeNull()
  corner.dispatchEvent(pointer('pointerenter', 0, 0))
  setDisabled(true)
  flush()
  await Promise.resolve()
  expect(host.querySelector('[data-highlighted]')).toBeNull()
})
