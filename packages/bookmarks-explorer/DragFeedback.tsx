import { dragFeedbackAsFirstChildUrl, dragFeedbackAsSiblingUrl } from './assets';

export function DragFeedback(props: Partial<{ rect: DOMRect; hasSubnodes: boolean }>) {
  const dragFeedbackAsFirstChild = (
    <img
      src={dragFeedbackAsFirstChildUrl}
      alt="Drag Feedback as First Child"
      class="max-w-unset pointer-events-none select-none"
    />
  );
  const dragFeedbackAsSibling = (
    <img
      src={dragFeedbackAsSiblingUrl}
      alt="Drag Feedback as Sibling"
      class="-bottom-9px max-w-unset pointer-events-none absolute select-none"
    />
  );

  return (
    <div
      class="pointer-events-none absolute select-none bg-[rgba(135,189,242,0.2)]"
      style={
        props.rect
          ? {
              width: (props.hasSubnodes ? props.rect.width : 16) + 'px',
              height: props.rect.height + 'px',
              left: props.rect.left + 'px',
              top: props.rect.top + 'px'
            }
          : { display: 'none' }
      }
    >
      {props.hasSubnodes ? dragFeedbackAsFirstChild : dragFeedbackAsSibling}
    </div>
  );
}
