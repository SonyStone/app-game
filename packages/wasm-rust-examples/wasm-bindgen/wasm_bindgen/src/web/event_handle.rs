use wasm_bindgen::prelude::Closure;
use wasm_bindgen::JsCast;
use web_sys::EventTarget;

pub struct EventListenerHandle<T: ?Sized> {
    target: EventTarget,
    event_type: &'static str,
    listener: Closure<T>,
}

pub fn add_event<U, E, F>(
    target: U,
    event_name: &'static str,
    handler: F,
) -> EventListenerHandle<dyn FnMut(E)>
where
    U: Into<EventTarget>,
    E: 'static + AsRef<web_sys::Event> + wasm_bindgen::convert::FromWasmAbi,
    F: 'static + FnMut(E),
{
    EventListenerHandle::new(target, event_name, Closure::new(handler))
}

impl<T: ?Sized> EventListenerHandle<T> {
    pub fn new<U>(target: U, event_type: &'static str, listener: Closure<T>) -> Self
    where
        U: Into<EventTarget>,
    {
        println!("Adding event listener");
        let target = target.into();
        target
            .add_event_listener_with_callback(event_type, listener.as_ref().unchecked_ref())
            .expect("Failed to add event listener");
        EventListenerHandle {
            target,
            event_type,
            listener,
        }
    }
}

impl<T: ?Sized> Drop for EventListenerHandle<T> {
    fn drop(&mut self) {
        println!("Dropping event listener");
        self.target
            .remove_event_listener_with_callback(
                self.event_type,
                self.listener.as_ref().unchecked_ref(),
            )
            .unwrap_or_else(|e| {
                web_sys::console::error_2(
                    &format!("Error removing event listener {}", self.event_type).into(),
                    &e,
                )
            });
    }
}
