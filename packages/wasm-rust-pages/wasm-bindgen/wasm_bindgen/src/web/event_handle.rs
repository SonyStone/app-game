use wasm_bindgen::convert::FromWasmAbi;
use wasm_bindgen::prelude::Closure;
use wasm_bindgen::JsCast;
use web_sys::{AddEventListenerOptions, EventTarget};

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

pub struct JsCallback<E> {
    target: EventTarget,
    name: &'static str,
    is_capture: bool,
    closure: Closure<dyn FnMut(E)>,
}

impl<E: FromWasmAbi + 'static> JsCallback<E> {
    pub fn register<T: AsRef<EventTarget>, C: FnMut(E) + 'static>(
        target: &T,
        name: &'static str,
        is_capture: bool,
        closure: C,
    ) -> Self {
        let target = target.as_ref();
        let closure = Closure::new(closure);

        let options = AddEventListenerOptions::new();
        options.set_passive(false);
        options.set_capture(is_capture);
        target
            .add_event_listener_with_callback_and_add_event_listener_options(
                name,
                closure.as_ref().unchecked_ref(),
                &options,
            )
            .unwrap_or_else(|e| {
                web_sys::console::error_2(
                    &format!("Error removing event listener {}", name).into(),
                    &e,
                )
            });

        Self {
            target: target.clone(),
            name,
            is_capture,
            closure,
        }
    }
}

impl<E> Drop for JsCallback<E> {
    fn drop(&mut self) {
        self.target
            .remove_event_listener_with_callback_and_bool(
                self.name,
                self.closure.as_ref().unchecked_ref(),
                self.is_capture,
            )
            .unwrap_or_else(|e| {
                web_sys::console::error_2(
                    &format!("Error removing event listener {}", self.name).into(),
                    &e,
                )
            });
    }
}
