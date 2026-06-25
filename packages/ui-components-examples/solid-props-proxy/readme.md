The problem is adding props to an already created DOM element or component.

To add props to an already created DOM element, we can use the `spread()` function.
SolidJs basically works this way:

```tsx
cosnt el = createElement('input')
spread(el, props)
return el
```

But after that, we can only override the props.
We cannot change the element or retrieve the original props.

And components are created this way:

```tsx
return component(props);
```

So we cannot change anything here.

Therefore, the only solution for now is to create a wrapper around that will store the original props, merge them with proxy one and reapply to the component

Mybe we can patch solidjs or something?

But not every component use spread function to set dom elements properties

We can use custom spread, like we did in the `example-1`, but if original props get changes, they overides proxy props.
