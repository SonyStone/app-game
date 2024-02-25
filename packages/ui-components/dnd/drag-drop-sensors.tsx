import { ParentComponent } from 'solid-js'

import { createPointerSensor } from './create-pointer-sensor'

export const DragDropSensors: ParentComponent = props => {
  createPointerSensor()
  return <>{props.children}</>
}
