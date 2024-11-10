use leptos::{
    ev,
    html::{button, div, span},
    prelude::*,
};
use wasm_bindgen::prelude::*;
use web_sys::HtmlElement;

/// A simple counter view.
// A component is really just a function call: it runs once to create the DOM and reactive system
pub fn counter(initial_value: i32, step: u32) -> impl IntoView {
    let count = RwSignal::new(Count::new(initial_value, step));
    Effect::new(move |_| {
        leptos::logging::log!("count = {:?}", count.get());
    });

    // the function name is the same as the HTML tag name
    let element = div()
        .class("flex gap-2 place-items-center")
        // children can be added with .child()
        // this takes any type that implements IntoView as its argument
        // for example, a string or an HtmlElement<_>
        // it can also take an array of types that impl IntoView
        // or a tuple of up to 26 objects that impl IntoView
        .child((
            button()
                // typed events found in leptos::ev
                // 1) prevent typos in event names
                // 2) allow for correct type inference in callbacks
                .class("p-2 rounded border")
                .on(ev::click, move |_| count.update(Count::clear))
                .child("Clear"),
            button()
                .class("p-2 rounded border")
                .on(ev::click, move |_| count.update(Count::decrease))
                .child("-1"),
            span()
                .class("p-2 rounded border")
                .child(("Value: ", move || count.get().value(), "!")),
            button()
                .class("p-2 rounded border")
                .on(ev::click, move |_| count.update(Count::increase))
                .child("+1"),
        ));

    element
}

#[derive(Debug, Clone)]
pub struct Count {
    value: i32,
    step: i32,
}

impl Count {
    pub fn new(value: i32, step: u32) -> Self {
        Count {
            value,
            step: step as i32,
        }
    }

    pub fn value(&self) -> i32 {
        leptos::logging::log!("value = {}", self.value);
        self.value
    }

    pub fn increase(&mut self) {
        self.value += self.step;
    }

    pub fn decrease(&mut self) {
        self.value += -self.step;
    }

    pub fn clear(&mut self) {
        self.value = 0;
    }
}

#[wasm_bindgen]
pub struct LeptosElement {
    element: HtmlElement,
    handler: Option<Box<dyn FnOnce()>>,
}

#[wasm_bindgen]
impl LeptosElement {
    pub fn new() -> Self {
        let parent: HtmlElement = document()
            .create_element("div")
            .unwrap()
            .dyn_into()
            .unwrap();
        let handler = mount_to(parent.clone(), || counter(0, 1));

        Self {
            element: parent,
            handler: Some(Box::new(move || drop(handler))),
        }
    }

    #[wasm_bindgen(getter)]
    pub fn element(&self) -> HtmlElement {
        self.element.clone()
    }
}

impl Default for LeptosElement {
    fn default() -> Self {
        Self::new()
    }
}

impl Drop for LeptosElement {
    fn drop(&mut self) {
        if let Some(handler) = self.handler.take() {
            handler();
        }
    }
}
