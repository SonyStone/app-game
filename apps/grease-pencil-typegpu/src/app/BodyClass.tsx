import {
  createEffect,
  onCleanup,
  type ComponentProps,
} from 'solid-js'

export function BodyClass(props: Pick<ComponentProps<'body'>, 'class'>) {
  const previousClassName = document.body.className
  const previousMargin = document.body.style.margin
  const previousOverflow = document.body.style.overflow

  createEffect(() => {
    document.body.className = props.class ?? ''
    document.body.style.margin = '0'
    document.body.style.overflow = 'hidden'
  })

  onCleanup(() => {
    document.body.className = previousClassName
    document.body.style.margin = previousMargin
    document.body.style.overflow = previousOverflow
  })

  return null
}
