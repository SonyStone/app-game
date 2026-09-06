import { createHotContext as __vite__createHotContext } from "/@vite/client";import.meta.hot = __vite__createHotContext("/@fs/workspace/packages/solid-nest/src/BlockTree.tsx");import { template as _$template } from "/node_modules/.vite/deps/solid-js_web.js?v=d6dc7c40";
import { delegateEvents as _$delegateEvents } from "/node_modules/.vite/deps/solid-js_web.js?v=d6dc7c40";
import { setStyleProperty as _$setStyleProperty } from "/node_modules/.vite/deps/solid-js_web.js?v=d6dc7c40";
import { addEventListener as _$addEventListener } from "/node_modules/.vite/deps/solid-js_web.js?v=d6dc7c40";
import { setAttribute as _$setAttribute } from "/node_modules/.vite/deps/solid-js_web.js?v=d6dc7c40";
import { insert as _$insert } from "/node_modules/.vite/deps/solid-js_web.js?v=d6dc7c40";
import { style as _$style } from "/node_modules/.vite/deps/solid-js_web.js?v=d6dc7c40";
import { effect as _$effect } from "/node_modules/.vite/deps/solid-js_web.js?v=d6dc7c40";
import { createComponent as _$createComponent } from "/node_modules/.vite/deps/solid-js_web.js?v=d6dc7c40";
import { className as _$className } from "/node_modules/.vite/deps/solid-js_web.js?v=d6dc7c40";
import { use as _$use } from "/node_modules/.vite/deps/solid-js_web.js?v=d6dc7c40";
import { $$registry as _$$registry, $$refresh as _$$refresh, $$component as _$$component } from "/@solid-refresh";
const _REGISTRY = _$$registry();
var _tmpl$ = /* @__PURE__ */ _$template(`<div>`), _tmpl$2 = /* @__PURE__ */ _$template(`<div style=margin-top:-1px;padding-bottom:1px>`), _tmpl$3 = /* @__PURE__ */ _$template(`<div><div style="border:1px dashed yellow">`), _tmpl$4 = /* @__PURE__ */ _$template(`<div><div>`), _tmpl$5 = /* @__PURE__ */ _$template(`<div><div style=z-index:50>`), _tmpl$6 = /* @__PURE__ */ _$template(`<div style=position:relative;box-sizing:border-box><div tabindex=-1>`);
import { createEffect, createMemo, For, onCleanup, onMount, Show } from "/node_modules/.vite/deps/solid-js.js?v=d6dc7c40";
import { Dynamic } from "/node_modules/.vite/deps/solid-js_web.js?v=d6dc7c40";
import { createAnimations } from "/@fs/workspace/packages/solid-nest/src/createAnimations.ts";
import { spacerStyle, innerStyle, outerStyle, dropzoneStyle, placeholderStyle } from "/@fs/workspace/packages/solid-nest/src/calculateTransitionStyles.ts";
import { calculateSelectionMode, normaliseSelection, updateSelection } from "/@fs/workspace/packages/solid-nest/src/selection.ts";
import { createDnd } from "/@fs/workspace/packages/solid-nest/src/dnd/createDnd.ts";
import { notNull } from "/@fs/workspace/packages/solid-nest/src/util/notNull.ts";
import { Dropzone } from "/@fs/workspace/packages/solid-nest/src/components/Dropzone.tsx";
import { blockClass, injectCSS, spacerClass, spacingVar } from "/@fs/workspace/packages/solid-nest/src/styles.ts";
import { VirtualTree } from "/@fs/workspace/packages/solid-nest/src/virtual-tree.ts";
import { DragContainer } from "/@fs/workspace/packages/solid-nest/src/components/DragContainer.tsx";
import { Placeholder } from "/@fs/workspace/packages/solid-nest/src/components/Placeholder.tsx";
export const BlockTree = _$$component(_REGISTRY, "BlockTree", function BlockTree2(props) {
  const itemElements = /* @__PURE__ */ new Map();
  let focusElement;
  onMount(injectCSS);
  const options = createMemo(() => ({
    transitionDuration: props.transitionDuration ?? 200,
    dragRadius: {
      x: 1.2,
      y: 1.5
    },
    multiselect: props.multiselect ?? true,
    dragThreshold: props.dragThreshold ?? 10
  }));
  const selectedBlocks = () => props.selection?.blocks ?? [];
  const selectedPlace = createMemo(() => {
    const selection = props.selection;
    if (selection?.place) {
      return selection.place;
    }
    if (selection?.blocks) {
      const keys = new Set(selection.blocks);
      const process = (container) => {
        const parent = container.key;
        const blocks = container.getBlocks();
        let before = null;
        for (let i = blocks.length - 1; i >= 0; i--) {
          const block = blocks[i];
          const key = props.getKey(block);
          if (keys.has(key)) {
            return {
              parent,
              before
            };
          }
          const containers = props.getContainers?.(block) ?? [];
          for (const container2 of containers.toReversed()) {
            const result = process(container2);
            if (result) return result;
          }
          before = key;
        }
        return void 0;
      };
      return process(props.root);
    }
  });
  const inputTree = VirtualTree.create(() => props.root, (block) => props.getKey(block), (block) => props.getOptions?.(block) ?? {}, (block) => props.getContainers?.(block) ?? []);
  const getBlock = (key) => inputTree().findBlock(key);
  const blocksToDrag = (key) => {
    const selection_ = selectedBlocks();
    return normaliseSelection(inputTree(), selection_.includes(key) ? selection_ : [key]).map((key2) => getBlock(key2)).filter(notNull);
  };
  const dnd = createDnd(inputTree, options, itemElements, blocksToDrag, (ev) => props.onReorder?.(ev));
  const {
    treeWithDropzone,
    dragTree,
    dragState,
    dragPosition,
    onDragHandleClick
  } = dnd;
  const {
    tree,
    styles
  } = createAnimations(treeWithDropzone, itemElements, options);
  const containerHeight = createMemo(() => {
    if (dragState() != null && props.fixedHeightWhileDragging) {
      const root2 = itemElements.get(tree().root.id).getBoundingClientRect();
      return `${root2.height}px`;
    } else {
      return "auto";
    }
  });
  const dragContainerStyle = createMemo(() => {
    const rect = dragPosition();
    return {
      position: "fixed",
      left: "0",
      top: "0",
      width: `${rect.width}px`,
      height: `${rect.height}px`,
      transform: `translate(${rect.x}px, ${rect.y}px)`,
      "z-index": 1e4
    };
  });
  const handleDelete = (ev) => {
    if (!selectedBlocks().length) return;
    ev.preventDefault();
    props.onRemove?.({
      keys: selectedBlocks().slice()
    });
  };
  const handleKeyDown = (ev) => {
    if (ev.key === "Delete") {
      return handleDelete(ev);
    }
  };
  const handleCopy = (ev) => {
    const keys = normaliseSelection(tree(), selectedBlocks());
    const data = ev.clipboardData;
    if (!keys.length || !data) return;
    ev.preventDefault();
    const blocks = keys.map((key) => getBlock(key)).filter(notNull);
    props.onCopy?.({
      blocks,
      data
    });
  };
  const handleCut = (ev) => {
    const keys = normaliseSelection(tree(), selectedBlocks());
    const data = ev.clipboardData;
    if (!keys.length || !data) return;
    ev.preventDefault();
    const blocks = keys.map((key) => getBlock(key)).filter(notNull);
    props.onCut?.({
      blocks,
      data
    });
  };
  const handlePaste = (ev) => {
    const place = selectedPlace();
    const data = ev.clipboardData;
    if (!place || !data) return;
    ev.preventDefault();
    props.onPaste?.({
      place,
      data
    });
  };
  let removeClickHandler;
  onMount(() => {
    const ondown = () => removeClickHandler?.();
    document.addEventListener("pointerdown", ondown, {
      capture: true
    });
    onCleanup(() => document.removeEventListener("pointerdown", ondown, {
      capture: true
    }));
  });
  const handlePointerDown = (item) => (ev) => {
    if (!ev.isPrimary) return;
    ev.preventDefault();
    ev.stopPropagation();
    const mode = calculateSelectionMode(ev, options().multiselect);
    const nextSelection = updateSelection(tree(), selectedBlocks(), item.key, mode);
    const select = () => {
      const {
        mode: mode2,
        keys
      } = nextSelection;
      props.onSelectionChange?.({
        kind: "blocks",
        key: item.key,
        mode: mode2,
        blocks: keys
      });
    };
    if (nextSelection.onClick) {
      const handler = (ev2) => {
        ev2.preventDefault();
        ev2.stopPropagation();
        select();
      };
      ev.currentTarget?.addEventListener("click", handler, {
        once: true
      });
      removeClickHandler = () => ev.currentTarget?.removeEventListener("click", handler);
    } else {
      select();
    }
    if (ev.target instanceof HTMLElement && ev.currentTarget instanceof HTMLElement) {
      for (const el of ev.currentTarget.querySelectorAll("[data-drag-handle]")) {
        if (el.contains(ev.target)) {
          onDragHandleClick(ev, item.key);
          break;
        }
      }
    }
  };
  createEffect(() => {
    const selection = props.selection;
    if (!selection) return;
    const hasSelection = (selection.blocks?.length ?? 0) > 0 || selection.place != null;
    const hasFocus = document.activeElement === focusElement;
    if (hasSelection && !hasFocus) {
      focusElement.focus({
        preventScroll: true
      });
    }
  });
  const renderItem = (item, tree2, itemProps = {}, styles2) => {
    const inWrapParent = itemProps.parentLayout === "wrap";
    if (item.kind === "container") {
      const isWrap = item.layout === "wrap";
      return (() => {
        var _el$ = _tmpl$();
        _$use((el) => itemElements.set(item.id, el), _el$);
        _$className(_el$, blockClass);
        _$insert(_el$, _$createComponent(For, {
          get each() {
            return tree2().children(item.id);
          },
          children: (child) => renderItem(child, tree2, {
            parentLayout: item.layout
          }, styles2)
        }), null);
        _$insert(_el$, _$createComponent(Show, {
          when: !isWrap,
          get children() {
            return [(() => {
              var _el$2 = _tmpl$();
              _$className(_el$2, spacerClass);
              _$effect((_$p) => _$style(_el$2, spacerStyle(styles2?.().get(item.id)), _$p));
              return _el$2;
            })(), _tmpl$2()];
          }
        }), null);
        _$effect((_p$) => {
          var _v$ = item.kind, _v$2 = item.id, _v$3 = item.layout, _v$4 = {
            [spacingVar]: `${item.spacing}px`,
            ...isWrap ? {
              display: "flex",
              "flex-wrap": "wrap",
              gap: `${item.spacing}px`,
              "align-content": "flex-start",
              "align-items": "flex-start"
            } : {},
            ...inWrapParent ? {
              width: "100%"
            } : {},
            // DEBUG
            border: isWrap ? "2px solid red" : "2px solid blue"
          };
          _v$ !== _p$.e && _$setAttribute(_el$, "data-kind", _p$.e = _v$);
          _v$2 !== _p$.t && _$setAttribute(_el$, "data-id", _p$.t = _v$2);
          _v$3 !== _p$.a && _$setAttribute(_el$, "data-layout", _p$.a = _v$3);
          _p$.o = _$style(_el$, _v$4, _p$.o);
          return _p$;
        }, {
          e: void 0,
          t: void 0,
          a: void 0,
          o: void 0
        });
        return _el$;
      })();
    }
    if (item.kind === "block") {
      const hasContainers = tree2().children(item.id).some((c) => c.kind === "container");
      const wrapBlockStyle = inWrapParent ? hasContainers ? {
        width: "100%"
      } : {
        width: "90px",
        flex: "0 0 auto"
      } : {};
      const wrapInnerStyle = inWrapParent && !hasContainers ? {
        width: "90px"
      } : {};
      return (() => {
        var _el$4 = _tmpl$3(), _el$5 = _el$4.firstChild;
        _$addEventListener(_el$4, "pointerdown", handlePointerDown(item), true);
        _$className(_el$4, blockClass);
        _$use((el) => itemElements.set(item.id, el), _el$5);
        _$insert(_el$5, _$createComponent(Dynamic, {
          get component() {
            return props.children;
          },
          get key() {
            return item.key;
          },
          get block() {
            return item.block;
          },
          get selected() {
            return selectedBlocks().includes(item.key);
          },
          get dragging() {
            return itemProps.dragging === true;
          },
          get children() {
            return _$createComponent(For, {
              get each() {
                return tree2().children(item.id);
              },
              children: (child) => renderItem(child, tree2, {}, styles2)
            });
          }
        }));
        _$effect((_p$) => {
          var _v$5 = item.kind, _v$6 = {
            ...outerStyle(styles2?.().get(item.id)),
            ...wrapBlockStyle,
            // DEBUG
            border: inWrapParent ? "2px solid lime" : "2px solid orange"
          }, _v$7 = {
            ...innerStyle(styles2?.().get(item.id)),
            ...wrapInnerStyle
          };
          _v$5 !== _p$.e && _$setAttribute(_el$4, "data-kind", _p$.e = _v$5);
          _p$.t = _$style(_el$4, _v$6, _p$.t);
          _p$.a = _$style(_el$5, _v$7, _p$.a);
          return _p$;
        }, {
          e: void 0,
          t: void 0,
          a: void 0
        });
        return _el$4;
      })();
    }
    if (item.kind === "placeholder") {
      if (inWrapParent) return null;
      return (() => {
        var _el$6 = _tmpl$4(), _el$7 = _el$6.firstChild;
        _$className(_el$6, blockClass);
        _$use((el) => itemElements.set(item.id, el), _el$7);
        _$insert(_el$7, _$createComponent(Dynamic, {
          get component() {
            return props.placeholder ?? Placeholder;
          },
          get parent() {
            return item.parent;
          }
        }));
        _$effect((_p$) => {
          var _v$8 = item.kind, _v$9 = outerStyle(styles2?.().get(item.id)), _v$0 = placeholderStyle(styles2?.().get(item.id));
          _v$8 !== _p$.e && _$setAttribute(_el$6, "data-kind", _p$.e = _v$8);
          _p$.t = _$style(_el$6, _v$9, _p$.t);
          _p$.a = _$style(_el$7, _v$0, _p$.a);
          return _p$;
        }, {
          e: void 0,
          t: void 0,
          a: void 0
        });
        return _el$6;
      })();
    }
    if (item.kind === "gap") {
      return (() => {
        var _el$8 = _tmpl$5(), _el$9 = _el$8.firstChild;
        _$className(_el$8, blockClass);
        _$use((el) => itemElements.set(item.id, el), _el$9);
        _$insert(_el$9, _$createComponent(Dynamic, {
          get component() {
            return props.dropzone ?? Dropzone;
          }
        }));
        _$effect((_p$) => {
          var _v$1 = item.kind, _v$10 = outerStyle(styles2?.().get(item.id)), _v$11 = {
            height: `${item.height}px`,
            ...dropzoneStyle(styles2?.().get(item.id))
          };
          _v$1 !== _p$.e && _$setAttribute(_el$8, "data-kind", _p$.e = _v$1);
          _p$.t = _$style(_el$8, _v$10, _p$.t);
          _p$.a = _$style(_el$9, _v$11, _p$.a);
          return _p$;
        }, {
          e: void 0,
          t: void 0,
          a: void 0
        });
        return _el$8;
      })();
    }
  };
  const root = createMemo(() => tree().root);
  return (() => {
    var _el$0 = _tmpl$6(), _el$1 = _el$0.firstChild;
    _el$0.addEventListener("paste", handlePaste);
    _el$0.addEventListener("cut", handleCut);
    _el$0.addEventListener("copy", handleCopy);
    _el$0.$$keydown = handleKeyDown;
    _el$0.$$focusout = (ev) => {
      if (ev.relatedTarget === focusElement) return;
      props.onSelectionChange?.({
        kind: "deselect"
      });
    };
    var _ref$ = focusElement;
    typeof _ref$ === "function" ? _$use(_ref$, _el$1) : focusElement = _el$1;
    _$insert(_el$0, () => renderItem(root(), tree, {}, styles), null);
    _$insert(_el$0, _$createComponent(Show, {
      get when() {
        return dragTree();
      },
      keyed: true,
      children: (tree2) => {
        const blocks = tree2.children(tree2.root.id).map((item) => item.kind === "block" ? getBlock(item.key) : null).filter(notNull);
        const top = createMemo(() => {
          const state = dragState();
          return state && tree2.findItemById(state.topItem);
        });
        return (() => {
          var _el$10 = _tmpl$();
          _$insert(_el$10, _$createComponent(Dynamic, {
            get component() {
              return props.dragContainer ?? DragContainer;
            },
            blocks,
            get children() {
              return _$createComponent(Show, {
                get when() {
                  return top();
                },
                keyed: true,
                children: (top2) => renderItem(top2, () => tree2, {
                  dragging: true
                })
              });
            }
          }));
          _$effect((_$p) => _$style(_el$10, dragContainerStyle(), _$p));
          return _el$10;
        })();
      }
    }), null);
    _$effect((_p$) => {
      var _v$12 = {
        ["--solidnest-duration"]: `${options().transitionDuration}ms`
      }, _v$13 = containerHeight();
      _p$.e = _$style(_el$0, _v$12, _p$.e);
      _v$13 !== _p$.t && _$setStyleProperty(_el$0, "height", _p$.t = _v$13);
      return _p$;
    }, {
      e: void 0,
      t: void 0
    });
    return _el$0;
  })();
}, {
  location: "../../packages/solid-nest/src/BlockTree.tsx:115:7"
});
if (import.meta.hot) {
  _$$refresh("vite", import.meta.hot, _REGISTRY);
  import.meta.hot.accept();
}
_$delegateEvents(["pointerdown", "focusout", "keydown"]);

//# sourceMappingURL=data:application/json;base64,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QStHLFdBQUE7QUFBQSxxQkFBQUYsa0JBQ3JFbEosTUFBSTtBQUFBLG9CQUFDc0osT0FBSTtBQUFBLHlCQUFFN0QsSUFBSTtBQUFBLGdCQUFDO0FBQUEsZ0JBQUV1SCxPQUFLO0FBQUEsZ0JBQUE1RCxVQUNyQjNELFVBQU82QyxXQUFXN0MsTUFBSyxNQUFNWixPQUFNO0FBQUEsa0JBQUUwRyxVQUFVO0FBQUEsZ0JBQUssQ0FBQztBQUFBLGNBQUM7QUFBQTtBQUFBO0FBQUEvQixtQkFBQUMsU0FBQUMsUUFBQTBELFFBSGpEL0gsbUJBQW1CLEdBQUNvRSxHQUFBO0FBQUEsaUJBQUEyRDtBQUFBQSxRQUFBO0FBQUEsTUFRcEM7QUFBQSxJQUFDO0FBQUE1RCxhQUFBSSxTQUFBO0FBQUEsVUFBQTBELFFBN0JJO0FBQUEsUUFJTCxDQUFDLHNCQUFzQixHQUFHLEdBQUcxTCxRQUFRLEVBQUVDLGtCQUFrQjtBQUFBLE1BQzNELEdBQUMwTCxRQUhTeEksZ0JBQWdCO0FBQUM2RSxVQUFBUyxJQUFBWCxRQUFBK0MsT0FBQWEsT0FBQTFELElBQUFTLENBQUE7QUFBQWtELGdCQUFBM0QsSUFBQVcsS0FBQWlELG1CQUFBZixPQUFBLFVBQUE3QyxJQUFBVyxJQUFBZ0QsS0FBQTtBQUFBLGFBQUEzRDtBQUFBQSxJQUFBO0FBQUEsTUFBQVMsR0FBQTVHO0FBQUFBLE1BQUE4RyxHQUFBOUc7QUFBQUEsSUFBQTtBQUFBLFdBQUFnSjtBQUFBQSxFQUFBO0FBK0JqQyxHQUFDO0FBQUEsRUFBQWdCLFVBQUE7QUFBQTtBQUFBLElBQUFDLFlBQUFDLEtBQUE7QUFBQUMsYUFBQSxRQUFBRixZQUFBQyxLQUFBcE0sU0FBQTtBQUFBbU0sY0FBQUMsSUFBQUUsT0FBQTtBQUFBO0FBQUFDLGlCQUFBIiwibmFtZXMiOlsiY3JlYXRlRWZmZWN0IiwiY3JlYXRlTWVtbyIsIkZvciIsIm9uQ2xlYW51cCIsIm9uTW91bnQiLCJTaG93IiwiRHluYW1pYyIsImNyZWF0ZUFuaW1hdGlvbnMiLCJzcGFjZXJTdHlsZSIsImlubmVyU3R5bGUiLCJvdXRlclN0eWxlIiwiZHJvcHpvbmVTdHlsZSIsInBsYWNlaG9sZGVyU3R5bGUiLCJjYWxjdWxhdGVTZWxlY3Rpb25Nb2RlIiwibm9ybWFsaXNlU2VsZWN0aW9uIiwidXBkYXRlU2VsZWN0aW9uIiwiY3JlYXRlRG5kIiwibm90TnVsbCIsIkRyb3B6b25lIiwiYmxvY2tDbGFzcyIsImluamVjdENTUyIsInNwYWNlckNsYXNzIiwic3BhY2luZ1ZhciIsIlZpcnR1YWxUcmVlIiwiRHJhZ0NvbnRhaW5lciIsIlBsYWNlaG9sZGVyIiwiQmxvY2tUcmVlIiwiXyQkY29tcG9uZW50IiwiX1JFR0lTVFJZIiwicHJvcHMiLCJpdGVtRWxlbWVudHMiLCJNYXAiLCJmb2N1c0VsZW1lbnQiLCJvcHRpb25zIiwidHJhbnNpdGlvbkR1cmF0aW9uIiwiZHJhZ1JhZGl1cyIsIngiLCJ5IiwibXVsdGlzZWxlY3QiLCJkcmFnVGhyZXNob2xkIiwic2VsZWN0ZWRCbG9ja3MiLCJzZWxlY3Rpb24iLCJibG9ja3MiLCJzZWxlY3RlZFBsYWNlIiwicGxhY2UiLCJrZXlzIiwiU2V0IiwicHJvY2VzcyIsImNvbnRhaW5lciIsInBhcmVudCIsImtleSIsImdldEJsb2NrcyIsImJlZm9yZSIsImkiLCJsZW5ndGgiLCJibG9jayIsImdldEtleSIsImhhcyIsImNvbnRhaW5lcnMiLCJnZXRDb250YWluZXJzIiwidG9SZXZlcnNlZCIsInJlc3VsdCIsInVuZGVmaW5lZCIsInJvb3QiLCJpbnB1dFRyZWUiLCJjcmVhdGUiLCJnZXRPcHRpb25zIiwiZ2V0QmxvY2siLCJmaW5kQmxvY2siLCJibG9ja3NUb0RyYWciLCJzZWxlY3Rpb25fIiwiaW5jbHVkZXMiLCJtYXAiLCJmaWx0ZXIiLCJkbmQiLCJldiIsIm9uUmVvcmRlciIsInRyZWVXaXRoRHJvcHpvbmUiLCJkcmFnVHJlZSIsImRyYWdTdGF0ZSIsImRyYWdQb3NpdGlvbiIsIm9uRHJhZ0hhbmRsZUNsaWNrIiwidHJlZSIsInN0eWxlcyIsImNvbnRhaW5lckhlaWdodCIsImZpeGVkSGVpZ2h0V2hpbGVEcmFnZ2luZyIsImdldCIsImlkIiwiZ2V0Qm91bmRpbmdDbGllbnRSZWN0IiwiaGVpZ2h0IiwiZHJhZ0NvbnRhaW5lclN0eWxlIiwicmVjdCIsInBvc2l0aW9uIiwibGVmdCIsInRvcCIsIndpZHRoIiwidHJhbnNmb3JtIiwiaGFuZGxlRGVsZXRlIiwicHJldmVudERlZmF1bHQiLCJvblJlbW92ZSIsInNsaWNlIiwiaGFuZGxlS2V5RG93biIsImhhbmRsZUNvcHkiLCJkYXRhIiwiY2xpcGJvYXJkRGF0YSIsIm9uQ29weSIsImhhbmRsZUN1dCIsIm9uQ3V0IiwiaGFuZGxlUGFzdGUiLCJvblBhc3RlIiwicmVtb3ZlQ2xpY2tIYW5kbGVyIiwib25kb3duIiwiZG9jdW1lbnQiLCJhZGRFdmVudExpc3RlbmVyIiwiY2FwdHVyZSIsInJlbW92ZUV2ZW50TGlzdGVuZXIiLCJoYW5kbGVQb2ludGVyRG93biIsIml0ZW0iLCJpc1ByaW1hcnkiLCJzdG9wUHJvcGFnYXRpb24iLCJtb2RlIiwibmV4dFNlbGVjdGlvbiIsInNlbGVjdCIsIm9uU2VsZWN0aW9uQ2hhbmdlIiwia2luZCIsIm9uQ2xpY2siLCJoYW5kbGVyIiwiY3VycmVudFRhcmdldCIsIm9uY2UiLCJ0YXJnZXQiLCJIVE1MRWxlbWVudCIsImVsIiwicXVlcnlTZWxlY3RvckFsbCIsImNvbnRhaW5zIiwiaGFzU2VsZWN0aW9uIiwiaGFzRm9jdXMiLCJhY3RpdmVFbGVtZW50IiwiZm9jdXMiLCJwcmV2ZW50U2Nyb2xsIiwicmVuZGVySXRlbSIsIml0ZW1Qcm9wcyIsImluV3JhcFBhcmVudCIsInBhcmVudExheW91dCIsImlzV3JhcCIsImxheW91dCIsIl9lbCQiLCJfdG1wbCQiLCJfJHVzZSIsInNldCIsIl8kY2xhc3NOYW1lIiwiXyRpbnNlcnQiLCJfJGNyZWF0ZUNvbXBvbmVudCIsImVhY2giLCJjaGlsZHJlbiIsImNoaWxkIiwid2hlbiIsIl9lbCQyIiwiXyRlZmZlY3QiLCJfJHAiLCJfJHN0eWxlIiwiX3RtcGwkMiIsIl9wJCIsIl92JCIsIl92JDIiLCJfdiQzIiwiX3YkNCIsInNwYWNpbmciLCJkaXNwbGF5IiwiZ2FwIiwiYm9yZGVyIiwiZSIsIl8kc2V0QXR0cmlidXRlIiwidCIsImEiLCJvIiwiaGFzQ29udGFpbmVycyIsInNvbWUiLCJjIiwid3JhcEJsb2NrU3R5bGUiLCJmbGV4Iiwid3JhcElubmVyU3R5bGUiLCJfZWwkNCIsIl90bXBsJDMiLCJfZWwkNSIsImZpcnN0Q2hpbGQiLCJfJGFkZEV2ZW50TGlzdGVuZXIiLCJjb21wb25lbnQiLCJzZWxlY3RlZCIsImRyYWdnaW5nIiwiX3YkNSIsIl92JDYiLCJfdiQ3IiwiX2VsJDYiLCJfdG1wbCQ0IiwiX2VsJDciLCJwbGFjZWhvbGRlciIsIl92JDgiLCJfdiQ5IiwiX3YkMCIsIl9lbCQ4IiwiX3RtcGwkNSIsIl9lbCQ5IiwiZHJvcHpvbmUiLCJfdiQxIiwiX3YkMTAiLCJfdiQxMSIsIl9lbCQwIiwiX3RtcGwkNiIsIl9lbCQxIiwiJCRrZXlkb3duIiwiJCRmb2N1c291dCIsInJlbGF0ZWRUYXJnZXQiLCJfcmVmJCIsImtleWVkIiwic3RhdGUiLCJmaW5kSXRlbUJ5SWQiLCJ0b3BJdGVtIiwiX2VsJDEwIiwiZHJhZ0NvbnRhaW5lciIsIl92JDEyIiwiX3YkMTMiLCJfJHNldFN0eWxlUHJvcGVydHkiLCJsb2NhdGlvbiIsImltcG9ydCIsImhvdCIsIl8kJHJlZnJlc2giLCJhY2NlcHQiLCJfJGRlbGVnYXRlRXZlbnRzIl0sImlnbm9yZUxpc3QiOltdLCJzb3VyY2VzIjpbIkJsb2NrVHJlZS50c3giXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgQWNjZXNzb3IsIENvbXBvbmVudCwgY3JlYXRlRWZmZWN0LCBjcmVhdGVNZW1vLCBGb3IsIEpTWCwgb25DbGVhbnVwLCBvbk1vdW50LCBTaG93IH0gZnJvbSAnc29saWQtanMnXG5pbXBvcnQgeyBEeW5hbWljIH0gZnJvbSAnc29saWQtanMvd2ViJ1xuaW1wb3J0IHsgQmxvY2tJdGVtLCBJdGVtLCBJdGVtSWQgfSBmcm9tICcuL0l0ZW0nXG5pbXBvcnQge1xuICBDb3B5RXZlbnQsXG4gIEN1dEV2ZW50LFxuICBFdmVudEhhbmRsZXIsXG4gIEluc2VydEV2ZW50LFxuICBQYXN0ZUV2ZW50LFxuICBQbGFjZSxcbiAgUmVtb3ZlRXZlbnQsXG4gIFJlb3JkZXJFdmVudCxcbiAgU2VsZWN0aW9uRXZlbnQsXG59IGZyb20gJy4vZXZlbnRzJ1xuaW1wb3J0IHsgY3JlYXRlQW5pbWF0aW9ucyB9IGZyb20gJy4vY3JlYXRlQW5pbWF0aW9ucydcbmltcG9ydCB7XG4gIEFuaW1hdGlvblN0YXRlLFxuICBzcGFjZXJTdHlsZSxcbiAgaW5uZXJTdHlsZSxcbiAgb3V0ZXJTdHlsZSxcbiAgZHJvcHpvbmVTdHlsZSxcbiAgcGxhY2Vob2xkZXJTdHlsZSxcbn0gZnJvbSAnLi9jYWxjdWxhdGVUcmFuc2l0aW9uU3R5bGVzJ1xuaW1wb3J0IHsgY2FsY3VsYXRlU2VsZWN0aW9uTW9kZSwgbm9ybWFsaXNlU2VsZWN0aW9uLCB1cGRhdGVTZWxlY3Rpb24gfSBmcm9tICcuL3NlbGVjdGlvbidcbmltcG9ydCB7IGNyZWF0ZURuZCB9IGZyb20gJy4vZG5kL2NyZWF0ZURuZCdcbmltcG9ydCB7IG5vdE51bGwgfSBmcm9tICcuL3V0aWwvbm90TnVsbCdcbmltcG9ydCB7IERyb3B6b25lIH0gZnJvbSAnLi9jb21wb25lbnRzL0Ryb3B6b25lJ1xuaW1wb3J0IHsgYmxvY2tDbGFzcywgaW5qZWN0Q1NTLCBzcGFjZXJDbGFzcywgc3BhY2luZ1ZhciB9IGZyb20gJy4vc3R5bGVzJ1xuaW1wb3J0IHsgVmlydHVhbFRyZWUgfSBmcm9tICcuL3ZpcnR1YWwtdHJlZSdcbmltcG9ydCB7IERyYWdDb250YWluZXIsIERyYWdDb250YWluZXJQcm9wcyB9IGZyb20gJy4vY29tcG9uZW50cy9EcmFnQ29udGFpbmVyJ1xuaW1wb3J0IHsgUGxhY2Vob2xkZXIgfSBmcm9tICcuL2NvbXBvbmVudHMvUGxhY2Vob2xkZXInXG5cbmV4cG9ydCB0eXBlIEJsb2NrVHJlZVByb3BzPEssIFQ+ID0ge1xuICAvKiogVGhlIHJvb3QgY29udGFpbmVyLiAqL1xuICByb290OiBDb250YWluZXI8SywgVD5cbiAgLyoqIEdldHMgdGhlIGtleSBvZiBhIGJsb2NrLiAqL1xuICBnZXRLZXk6IChibG9jazogVCkgPT4gS1xuICAvKiogR2V0cyB0aGUgY29uZmlndXJhdGlvbiBvcHRpb25zIGZvciBhIGJsb2NrLiAqL1xuICBnZXRPcHRpb25zPzogKGJsb2NrOiBUKSA9PiBCbG9ja09wdGlvbnMgfCBudWxsIHwgdW5kZWZpbmVkXG4gIC8qKiBHZXRzIHRoZSBjb25maWd1cmF0aW9uIG9wdGlvbnMgZm9yIGEgYmxvY2suICovXG4gIGdldENvbnRhaW5lcnM/OiAoYmxvY2s6IFQpID0+IENvbnRhaW5lcjxLLCBUPltdIHwgbnVsbCB8IHVuZGVmaW5lZFxuICAvKipcbiAgICogVGhlIGN1cnJlbnQgc2VsZWN0aW9uLCB3aGljaCBjYW4gYmUgZWl0aGVyOlxuICAgKiAtIEEgc2V0IG9mIGJsb2NrcywgaW4gdGhlIG9yZGVyIHRoZXkgd2VyZSBzZWxlY3RlZFxuICAgKiAtIEFuIGluc2VydGlvbiBwb2ludCBiZXR3ZWVuIGJsb2Nrc1xuICAgKi9cbiAgc2VsZWN0aW9uPzogU2VsZWN0aW9uPEs+XG4gIC8qKiBGaXJlZCB3aGVuIGEgYmxvY2sgaXMgc2VsZWN0ZWQgb3IgZGVzZWxlY3RlZC4gKi9cbiAgb25TZWxlY3Rpb25DaGFuZ2U/OiAoZXZlbnQ6IFNlbGVjdGlvbkV2ZW50PEs+KSA9PiB2b2lkXG4gIC8qKiBGaXJlZCB3aGVuIGJsb2NrcyBhcmUgaW5zZXJ0ZWQuICovXG4gIG9uSW5zZXJ0PzogRXZlbnRIYW5kbGVyPEluc2VydEV2ZW50PEssIFQ+PlxuICAvKiogRmlyZWQgd2hlbiBibG9ja3MgYXJlIHJlb3JkZXJlZC4gKi9cbiAgb25SZW9yZGVyPzogRXZlbnRIYW5kbGVyPFJlb3JkZXJFdmVudDxLPj5cbiAgLyoqIEZpcmVkIHdoZW4gYmxvY2tzIGFyZSByZW1vdmVkLiAqL1xuICBvblJlbW92ZT86IEV2ZW50SGFuZGxlcjxSZW1vdmVFdmVudDxLPj5cbiAgLyoqIEZpcmVkIHdoZW4gYmxvY2tzIGFyZSBjb3BpZWQuICovXG4gIG9uQ29weT86IEV2ZW50SGFuZGxlcjxDb3B5RXZlbnQ8VD4+XG4gIC8qKiBGaXJlZCB3aGVuIGJsb2NrcyBhcmUgY3V0LiAqL1xuICBvbkN1dD86IEV2ZW50SGFuZGxlcjxDdXRFdmVudDxUPj5cbiAgLyoqIEZpcmVkIHdoZW4gYmxvY2tzIGFyZSBwYXN0ZWQuICovXG4gIG9uUGFzdGU/OiBFdmVudEhhbmRsZXI8UGFzdGVFdmVudDxLPj5cbiAgLyoqIE9wdGlvbmFsIGN1c3RvbSBkcm9wem9uZSBjb21wb25lbnQuICovXG4gIGRyb3B6b25lPzogQ29tcG9uZW50PHt9PlxuICAvKiogT3B0aW9uYWwgY3VzdG9tIHBsYWNlaG9sZGVyIGNvbXBvbmVudC4gKi9cbiAgcGxhY2Vob2xkZXI/OiBDb21wb25lbnQ8eyBwYXJlbnQ6IEsgfT5cbiAgLyoqIE9wdGlvbmFsIGN1c3RvbSBkcmFnIGNvbnRhaW5lciBjb21wb25lbnQuICovXG4gIGRyYWdDb250YWluZXI/OiBDb21wb25lbnQ8RHJhZ0NvbnRhaW5lclByb3BzPFQ+PlxuICAvKiogRHVyYXRpb24gb2YgdHJhbnNpdGlvbiBhbmltYXRpb25zLCBpbiBtaWxsaXNlY29uZHMuICovXG4gIHRyYW5zaXRpb25EdXJhdGlvbj86IG51bWJlclxuICAvKiogRGlzdGFuY2UgdGhlIGN1cnNvciBtdXN0IG1vdmUsIGluIHBpeGVscywgZm9yIGEgZHJhZyB0byBiZSBkZXRlY3RlZC4gKi9cbiAgZHJhZ1RocmVzaG9sZD86IG51bWJlclxuICAvKipcbiAgICogRm9yY2VzIHRoZSBjb250YWluZXIgdG8gbWFpbnRhaW4gYSBmaXhlZCBoZWlnaHQgd2hpbGUgZHJhZ2dpbmcgaXMgaW4gcHJvZ3Jlc3M7XG4gICAqIHVzZWZ1bCBmb3IgcHJldmVudGluZyBvZGQgYmVoYXZpb3VyIHdoZW4gdGhlIGNvbXBvbmVudCBpcyBpbnNpZGUgYSBzY3JvbGxhYmxlIGVsZW1lbnQuXG4gICAqL1xuICBmaXhlZEhlaWdodFdoaWxlRHJhZ2dpbmc/OiBib29sZWFuXG4gIC8qKiBXaGV0aGVyIHRvIGFsbG93IG11dGxpcGxlIGJsb2NrcyB0byBiZSBzZWxlY3RlZCBhdCBvbmNlOyBkZWZhdWx0cyB0byBgdHJ1ZWAuICovXG4gIG11bHRpc2VsZWN0PzogYm9vbGVhblxuICAvKiogQ29tcG9uZW50IHVzZWQgdG8gcmVuZGVyIGJsb2Nrcy4gKi9cbiAgY2hpbGRyZW46IENvbXBvbmVudDxCbG9ja1Byb3BzPEssIFQ+PlxufVxuXG4vKiogQ29uZmlndXJlcyBob3cgYSBibG9jayBpcyByZW5kZXJlZCBhbmQgaW50ZXJhY3RzIHdpdGggb3RoZXIgYmxvY2tzLiAqL1xuZXhwb3J0IHR5cGUgQmxvY2tPcHRpb25zID0ge1xuICAvKipcbiAgICogVGhlIGJsb2NrJ3MgdGFnLCB1c2VkIHRvIGRldGVybWluZSB3aGljaCBwYXJlbnQgYmxvY2tzIGl0IGNhbiBiZSBkcmFnZ2VkIGludG8uXG4gICAqIEJsb2NrcyB3aXRob3V0IGEgdGFnIGNhbiBiZSBhY2NlcHRlZCBieSBhbnkgcGFyZW50LlxuICAgKiAqL1xuICB0YWc/OiBzdHJpbmdcbn1cblxuZXhwb3J0IHR5cGUgQ29udGFpbmVyPEssIFQ+ID0ge1xuICAvKiogVGhlIGNvbnRhaW5lcidzIHVuaXF1ZSBrZXkuICovXG4gIGtleTogS1xuICAvKiogVGhlIHNwYWNpbmcgYmV0d2VlbiBjaGlsZCBibG9ja3MsIGluIHBpeGVscy4gKi9cbiAgc3BhY2luZz86IG51bWJlclxuICAvKiogVGhlIHNldCBvZiB0YWdzIHRoYXQgdGhpcyBibG9jayBhY2NlcHRzIGFzIGNoaWxkcmVuLiAqL1xuICBhY2NlcHRzPzogc3RyaW5nW11cbiAgLyoqIExheW91dCBtb2RlOiAnbGlzdCcgKHZlcnRpY2FsLCBkZWZhdWx0KSBvciAnd3JhcCcgKGZsZXgtd3JhcCBncmlkKS4gKi9cbiAgbGF5b3V0PzogJ2xpc3QnIHwgJ3dyYXAnXG4gIC8qKiBHZXRzIHRoZSBibG9ja3MgaW4gdGhpcyBjb250YWluZXIuICovXG4gIGdldEJsb2NrczogKCkgPT4gVFtdXG59XG5cbmV4cG9ydCB0eXBlIFNlbGVjdGlvbjxLPiA9IHsgYmxvY2tzPzogS1tdOyBwbGFjZT86IFBsYWNlPEs+IH1cblxuZXhwb3J0IHR5cGUgQmxvY2tQcm9wczxLLCBUPiA9IHtcbiAga2V5OiBLXG4gIGJsb2NrOiBUXG4gIHNlbGVjdGVkOiBib29sZWFuXG4gIGRyYWdnaW5nOiBib29sZWFuXG4gIGNoaWxkcmVuOiBKU1guRWxlbWVudFxufVxuXG5leHBvcnQgZnVuY3Rpb24gQmxvY2tUcmVlPEssIFQ+KHByb3BzOiBCbG9ja1RyZWVQcm9wczxLLCBUPikge1xuICBjb25zdCBpdGVtRWxlbWVudHMgPSBuZXcgTWFwPEl0ZW1JZCwgSFRNTEVsZW1lbnQ+KClcbiAgbGV0IGZvY3VzRWxlbWVudCE6IEhUTUxEaXZFbGVtZW50XG5cbiAgb25Nb3VudChpbmplY3RDU1MpXG5cbiAgY29uc3Qgb3B0aW9ucyA9IGNyZWF0ZU1lbW8oKCkgPT4gKHtcbiAgICB0cmFuc2l0aW9uRHVyYXRpb246IHByb3BzLnRyYW5zaXRpb25EdXJhdGlvbiA/PyAyMDAsXG4gICAgZHJhZ1JhZGl1czogeyB4OiAxLjIsIHk6IDEuNSB9LFxuICAgIG11bHRpc2VsZWN0OiBwcm9wcy5tdWx0aXNlbGVjdCA/PyB0cnVlLFxuICAgIGRyYWdUaHJlc2hvbGQ6IHByb3BzLmRyYWdUaHJlc2hvbGQgPz8gMTAsXG4gIH0pKVxuXG4gIGNvbnN0IHNlbGVjdGVkQmxvY2tzID0gKCkgPT4gcHJvcHMuc2VsZWN0aW9uPy5ibG9ja3MgPz8gW11cblxuICBjb25zdCBzZWxlY3RlZFBsYWNlID0gY3JlYXRlTWVtbygoKSA9PiB7XG4gICAgY29uc3Qgc2VsZWN0aW9uID0gcHJvcHMuc2VsZWN0aW9uXG4gICAgaWYgKHNlbGVjdGlvbj8ucGxhY2UpIHtcbiAgICAgIHJldHVybiBzZWxlY3Rpb24ucGxhY2VcbiAgICB9XG4gICAgaWYgKHNlbGVjdGlvbj8uYmxvY2tzKSB7XG4gICAgICBjb25zdCBrZXlzID0gbmV3IFNldChzZWxlY3Rpb24uYmxvY2tzKVxuICAgICAgY29uc3QgcHJvY2VzcyA9IChjb250YWluZXI6IENvbnRhaW5lcjxLLCBUPik6IFBsYWNlPEs+IHwgdW5kZWZpbmVkID0+IHtcbiAgICAgICAgY29uc3QgcGFyZW50ID0gY29udGFpbmVyLmtleVxuICAgICAgICBjb25zdCBibG9ja3MgPSBjb250YWluZXIuZ2V0QmxvY2tzKClcblxuICAgICAgICBsZXQgYmVmb3JlOiBLIHwgbnVsbCA9IG51bGxcbiAgICAgICAgZm9yIChsZXQgaSA9IGJsb2Nrcy5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xuICAgICAgICAgIGNvbnN0IGJsb2NrID0gYmxvY2tzW2ldIVxuICAgICAgICAgIGNvbnN0IGtleSA9IHByb3BzLmdldEtleShibG9jaylcbiAgICAgICAgICBpZiAoa2V5cy5oYXMoa2V5KSkge1xuICAgICAgICAgICAgcmV0dXJuIHsgcGFyZW50LCBiZWZvcmUgfVxuICAgICAgICAgIH1cbiAgICAgICAgICBjb25zdCBjb250YWluZXJzID0gcHJvcHMuZ2V0Q29udGFpbmVycz8uKGJsb2NrKSA/PyBbXVxuICAgICAgICAgIGZvciAoY29uc3QgY29udGFpbmVyIG9mIGNvbnRhaW5lcnMudG9SZXZlcnNlZCgpKSB7XG4gICAgICAgICAgICBjb25zdCByZXN1bHQgPSBwcm9jZXNzKGNvbnRhaW5lcilcbiAgICAgICAgICAgIGlmIChyZXN1bHQpIHJldHVybiByZXN1bHRcbiAgICAgICAgICB9XG4gICAgICAgICAgYmVmb3JlID0ga2V5XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHVuZGVmaW5lZFxuICAgICAgfVxuICAgICAgcmV0dXJuIHByb2Nlc3MocHJvcHMucm9vdClcbiAgICB9XG4gIH0pXG5cbiAgY29uc3QgaW5wdXRUcmVlID0gVmlydHVhbFRyZWUuY3JlYXRlPEssIFQ+KFxuICAgICgpID0+IHByb3BzLnJvb3QsXG4gICAgYmxvY2sgPT4gcHJvcHMuZ2V0S2V5KGJsb2NrKSxcbiAgICBibG9jayA9PiBwcm9wcy5nZXRPcHRpb25zPy4oYmxvY2spID8/IHt9LFxuICAgIGJsb2NrID0+IHByb3BzLmdldENvbnRhaW5lcnM/LihibG9jaykgPz8gW10sXG4gIClcblxuICBjb25zdCBnZXRCbG9jayA9IChrZXk6IEspID0+IGlucHV0VHJlZSgpLmZpbmRCbG9jayhrZXkpXG5cbiAgY29uc3QgYmxvY2tzVG9EcmFnID0gKGtleTogSykgPT4ge1xuICAgIGNvbnN0IHNlbGVjdGlvbl8gPSBzZWxlY3RlZEJsb2NrcygpXG4gICAgcmV0dXJuIG5vcm1hbGlzZVNlbGVjdGlvbihpbnB1dFRyZWUoKSwgc2VsZWN0aW9uXy5pbmNsdWRlcyhrZXkpID8gc2VsZWN0aW9uXyA6IFtrZXldKVxuICAgICAgLm1hcChrZXkgPT4gZ2V0QmxvY2soa2V5KSlcbiAgICAgIC5maWx0ZXIobm90TnVsbClcbiAgfVxuXG4gIGNvbnN0IGRuZCA9IGNyZWF0ZURuZChpbnB1dFRyZWUsIG9wdGlvbnMsIGl0ZW1FbGVtZW50cywgYmxvY2tzVG9EcmFnLCBldiA9PiBwcm9wcy5vblJlb3JkZXI/LihldikpXG4gIGNvbnN0IHsgdHJlZVdpdGhEcm9wem9uZSwgZHJhZ1RyZWUsIGRyYWdTdGF0ZSwgZHJhZ1Bvc2l0aW9uLCBvbkRyYWdIYW5kbGVDbGljayB9ID0gZG5kXG5cbiAgY29uc3QgeyB0cmVlLCBzdHlsZXMgfSA9IGNyZWF0ZUFuaW1hdGlvbnModHJlZVdpdGhEcm9wem9uZSwgaXRlbUVsZW1lbnRzLCBvcHRpb25zKVxuXG4gIGNvbnN0IGNvbnRhaW5lckhlaWdodCA9IGNyZWF0ZU1lbW8oKCkgPT4ge1xuICAgIGlmIChkcmFnU3RhdGUoKSAhPSBudWxsICYmIHByb3BzLmZpeGVkSGVpZ2h0V2hpbGVEcmFnZ2luZykge1xuICAgICAgY29uc3Qgcm9vdCA9IGl0ZW1FbGVtZW50cy5nZXQodHJlZSgpLnJvb3QuaWQpIS5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKVxuICAgICAgcmV0dXJuIGAke3Jvb3QuaGVpZ2h0fXB4YFxuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4gJ2F1dG8nXG4gICAgfVxuICB9KVxuXG4gIGNvbnN0IGRyYWdDb250YWluZXJTdHlsZSA9IGNyZWF0ZU1lbW8oKCkgPT4ge1xuICAgIGNvbnN0IHJlY3QgPSBkcmFnUG9zaXRpb24oKVxuXG4gICAgcmV0dXJuIHtcbiAgICAgIHBvc2l0aW9uOiAnZml4ZWQnIGFzIGNvbnN0LFxuICAgICAgbGVmdDogJzAnLFxuICAgICAgdG9wOiAnMCcsXG4gICAgICB3aWR0aDogYCR7cmVjdC53aWR0aH1weGAsXG4gICAgICBoZWlnaHQ6IGAke3JlY3QuaGVpZ2h0fXB4YCxcbiAgICAgIHRyYW5zZm9ybTogYHRyYW5zbGF0ZSgke3JlY3QueH1weCwgJHtyZWN0Lnl9cHgpYCxcbiAgICAgICd6LWluZGV4JzogMTAwMDAsXG4gICAgfVxuICB9KVxuXG4gIGNvbnN0IGhhbmRsZURlbGV0ZSA9IChldjogS2V5Ym9hcmRFdmVudCkgPT4ge1xuICAgIGlmICghc2VsZWN0ZWRCbG9ja3MoKS5sZW5ndGgpIHJldHVyblxuXG4gICAgZXYucHJldmVudERlZmF1bHQoKVxuICAgIHByb3BzLm9uUmVtb3ZlPy4oeyBrZXlzOiBzZWxlY3RlZEJsb2NrcygpLnNsaWNlKCkgfSlcbiAgfVxuXG4gIGNvbnN0IGhhbmRsZUtleURvd24gPSAoZXY6IEtleWJvYXJkRXZlbnQpID0+IHtcbiAgICBpZiAoZXYua2V5ID09PSAnRGVsZXRlJykge1xuICAgICAgcmV0dXJuIGhhbmRsZURlbGV0ZShldilcbiAgICB9XG4gIH1cblxuICBjb25zdCBoYW5kbGVDb3B5ID0gKGV2OiBDbGlwYm9hcmRFdmVudCkgPT4ge1xuICAgIGNvbnN0IGtleXMgPSBub3JtYWxpc2VTZWxlY3Rpb24odHJlZSgpLCBzZWxlY3RlZEJsb2NrcygpKVxuICAgIGNvbnN0IGRhdGEgPSBldi5jbGlwYm9hcmREYXRhXG4gICAgaWYgKCFrZXlzLmxlbmd0aCB8fCAhZGF0YSkgcmV0dXJuXG5cbiAgICBldi5wcmV2ZW50RGVmYXVsdCgpXG4gICAgY29uc3QgYmxvY2tzID0ga2V5cy5tYXAoa2V5ID0+IGdldEJsb2NrKGtleSkpLmZpbHRlcihub3ROdWxsKVxuICAgIHByb3BzLm9uQ29weT8uKHsgYmxvY2tzLCBkYXRhIH0pXG4gIH1cblxuICBjb25zdCBoYW5kbGVDdXQgPSAoZXY6IENsaXBib2FyZEV2ZW50KSA9PiB7XG4gICAgY29uc3Qga2V5cyA9IG5vcm1hbGlzZVNlbGVjdGlvbih0cmVlKCksIHNlbGVjdGVkQmxvY2tzKCkpXG4gICAgY29uc3QgZGF0YSA9IGV2LmNsaXBib2FyZERhdGFcbiAgICBpZiAoIWtleXMubGVuZ3RoIHx8ICFkYXRhKSByZXR1cm5cblxuICAgIGV2LnByZXZlbnREZWZhdWx0KClcbiAgICBjb25zdCBibG9ja3MgPSBrZXlzLm1hcChrZXkgPT4gZ2V0QmxvY2soa2V5KSkuZmlsdGVyKG5vdE51bGwpXG4gICAgcHJvcHMub25DdXQ/Lih7IGJsb2NrcywgZGF0YSB9KVxuICB9XG5cbiAgY29uc3QgaGFuZGxlUGFzdGUgPSAoZXY6IENsaXBib2FyZEV2ZW50KSA9PiB7XG4gICAgY29uc3QgcGxhY2UgPSBzZWxlY3RlZFBsYWNlKClcbiAgICBjb25zdCBkYXRhID0gZXYuY2xpcGJvYXJkRGF0YVxuICAgIGlmICghcGxhY2UgfHwgIWRhdGEpIHJldHVyblxuXG4gICAgZXYucHJldmVudERlZmF1bHQoKVxuICAgIHByb3BzLm9uUGFzdGU/Lih7IHBsYWNlLCBkYXRhIH0pXG4gIH1cblxuICBsZXQgcmVtb3ZlQ2xpY2tIYW5kbGVyOiAoKCkgPT4gdm9pZCkgfCB1bmRlZmluZWRcblxuICBvbk1vdW50KCgpID0+IHtcbiAgICBjb25zdCBvbmRvd24gPSAoKSA9PiByZW1vdmVDbGlja0hhbmRsZXI/LigpXG4gICAgZG9jdW1lbnQuYWRkRXZlbnRMaXN0ZW5lcigncG9pbnRlcmRvd24nLCBvbmRvd24sIHsgY2FwdHVyZTogdHJ1ZSB9KVxuICAgIG9uQ2xlYW51cCgoKSA9PiBkb2N1bWVudC5yZW1vdmVFdmVudExpc3RlbmVyKCdwb2ludGVyZG93bicsIG9uZG93biwgeyBjYXB0dXJlOiB0cnVlIH0pKVxuICB9KVxuXG4gIGNvbnN0IGhhbmRsZVBvaW50ZXJEb3duID0gKGl0ZW06IEJsb2NrSXRlbTxLLCBUPikgPT4gKGV2OiBQb2ludGVyRXZlbnQpID0+IHtcbiAgICBpZiAoIWV2LmlzUHJpbWFyeSkgcmV0dXJuXG5cbiAgICBldi5wcmV2ZW50RGVmYXVsdCgpXG4gICAgZXYuc3RvcFByb3BhZ2F0aW9uKClcblxuICAgIGNvbnN0IG1vZGUgPSBjYWxjdWxhdGVTZWxlY3Rpb25Nb2RlKGV2LCBvcHRpb25zKCkubXVsdGlzZWxlY3QpXG4gICAgY29uc3QgbmV4dFNlbGVjdGlvbiA9IHVwZGF0ZVNlbGVjdGlvbih0cmVlKCksIHNlbGVjdGVkQmxvY2tzKCksIGl0ZW0ua2V5LCBtb2RlKVxuXG4gICAgY29uc3Qgc2VsZWN0ID0gKCkgPT4ge1xuICAgICAgY29uc3QgeyBtb2RlLCBrZXlzIH0gPSBuZXh0U2VsZWN0aW9uXG4gICAgICBwcm9wcy5vblNlbGVjdGlvbkNoYW5nZT8uKHsga2luZDogJ2Jsb2NrcycsIGtleTogaXRlbS5rZXksIG1vZGUsIGJsb2Nrczoga2V5cyB9KVxuICAgIH1cblxuICAgIGlmIChuZXh0U2VsZWN0aW9uLm9uQ2xpY2spIHtcbiAgICAgIGNvbnN0IGhhbmRsZXIgPSAoZXY6IEV2ZW50KSA9PiB7XG4gICAgICAgIGV2LnByZXZlbnREZWZhdWx0KClcbiAgICAgICAgZXYuc3RvcFByb3BhZ2F0aW9uKClcbiAgICAgICAgc2VsZWN0KClcbiAgICAgIH1cbiAgICAgIGV2LmN1cnJlbnRUYXJnZXQ/LmFkZEV2ZW50TGlzdGVuZXIoJ2NsaWNrJywgaGFuZGxlciwgeyBvbmNlOiB0cnVlIH0pXG4gICAgICByZW1vdmVDbGlja0hhbmRsZXIgPSAoKSA9PiBldi5jdXJyZW50VGFyZ2V0Py5yZW1vdmVFdmVudExpc3RlbmVyKCdjbGljaycsIGhhbmRsZXIpXG4gICAgfSBlbHNlIHtcbiAgICAgIHNlbGVjdCgpXG4gICAgfVxuXG4gICAgaWYgKGV2LnRhcmdldCBpbnN0YW5jZW9mIEhUTUxFbGVtZW50ICYmIGV2LmN1cnJlbnRUYXJnZXQgaW5zdGFuY2VvZiBIVE1MRWxlbWVudCkge1xuICAgICAgZm9yIChjb25zdCBlbCBvZiBldi5jdXJyZW50VGFyZ2V0LnF1ZXJ5U2VsZWN0b3JBbGwoJ1tkYXRhLWRyYWctaGFuZGxlXScpKSB7XG4gICAgICAgIGlmIChlbC5jb250YWlucyhldi50YXJnZXQpKSB7XG4gICAgICAgICAgb25EcmFnSGFuZGxlQ2xpY2soZXYsIGl0ZW0ua2V5KVxuICAgICAgICAgIGJyZWFrXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBjcmVhdGVFZmZlY3QoKCkgPT4ge1xuICAgIGNvbnN0IHNlbGVjdGlvbiA9IHByb3BzLnNlbGVjdGlvblxuICAgIGlmICghc2VsZWN0aW9uKSByZXR1cm5cblxuICAgIGNvbnN0IGhhc1NlbGVjdGlvbiA9IChzZWxlY3Rpb24uYmxvY2tzPy5sZW5ndGggPz8gMCkgPiAwIHx8IHNlbGVjdGlvbi5wbGFjZSAhPSBudWxsXG4gICAgY29uc3QgaGFzRm9jdXMgPSBkb2N1bWVudC5hY3RpdmVFbGVtZW50ID09PSBmb2N1c0VsZW1lbnRcblxuICAgIGlmIChoYXNTZWxlY3Rpb24gJiYgIWhhc0ZvY3VzKSB7XG4gICAgICBmb2N1c0VsZW1lbnQuZm9jdXMoeyBwcmV2ZW50U2Nyb2xsOiB0cnVlIH0pXG4gICAgfVxuICB9KVxuXG4gIGNvbnN0IHJlbmRlckl0ZW0gPSAoXG4gICAgaXRlbTogSXRlbTxLLCBUPixcbiAgICB0cmVlOiBBY2Nlc3NvcjxWaXJ0dWFsVHJlZTxLLCBUPj4sXG4gICAgaXRlbVByb3BzOiB7IGRyYWdnaW5nPzogYm9vbGVhbjsgcGFyZW50TGF5b3V0PzogJ2xpc3QnIHwgJ3dyYXAnIH0gPSB7fSxcbiAgICBzdHlsZXM/OiBBY2Nlc3NvcjxNYXA8c3RyaW5nLCBBbmltYXRpb25TdGF0ZT4+LFxuICApID0+IHtcbiAgICBjb25zdCBpbldyYXBQYXJlbnQgPSBpdGVtUHJvcHMucGFyZW50TGF5b3V0ID09PSAnd3JhcCdcblxuICAgIGlmIChpdGVtLmtpbmQgPT09ICdjb250YWluZXInKSB7XG4gICAgICBjb25zdCBpc1dyYXAgPSBpdGVtLmxheW91dCA9PT0gJ3dyYXAnXG4gICAgICByZXR1cm4gKFxuICAgICAgICA8ZGl2XG4gICAgICAgICAgcmVmPXtlbCA9PiBpdGVtRWxlbWVudHMuc2V0KGl0ZW0uaWQsIGVsKX1cbiAgICAgICAgICBjbGFzcz17YmxvY2tDbGFzc31cbiAgICAgICAgICBkYXRhLWtpbmQ9e2l0ZW0ua2luZH1cbiAgICAgICAgICBkYXRhLWlkPXtpdGVtLmlkfVxuICAgICAgICAgIGRhdGEtbGF5b3V0PXtpdGVtLmxheW91dH1cbiAgICAgICAgICBzdHlsZT17e1xuICAgICAgICAgICAgW3NwYWNpbmdWYXJdOiBgJHtpdGVtLnNwYWNpbmd9cHhgLFxuICAgICAgICAgICAgLi4uKGlzV3JhcCA/IHsgZGlzcGxheTogJ2ZsZXgnLCAnZmxleC13cmFwJzogJ3dyYXAnLCBnYXA6IGAke2l0ZW0uc3BhY2luZ31weGAsICdhbGlnbi1jb250ZW50JzogJ2ZsZXgtc3RhcnQnLCAnYWxpZ24taXRlbXMnOiAnZmxleC1zdGFydCcgfSA6IHt9KSxcbiAgICAgICAgICAgIC4uLihpbldyYXBQYXJlbnQgPyB7IHdpZHRoOiAnMTAwJScgfSA6IHt9KSxcbiAgICAgICAgICAgIC8vIERFQlVHXG4gICAgICAgICAgICBib3JkZXI6IGlzV3JhcCA/ICcycHggc29saWQgcmVkJyA6ICcycHggc29saWQgYmx1ZScsXG4gICAgICAgICAgfX1cbiAgICAgICAgPlxuICAgICAgICAgIDxGb3IgZWFjaD17dHJlZSgpLmNoaWxkcmVuKGl0ZW0uaWQpfT57Y2hpbGQgPT4gcmVuZGVySXRlbShjaGlsZCwgdHJlZSwgeyBwYXJlbnRMYXlvdXQ6IGl0ZW0ubGF5b3V0IH0sIHN0eWxlcyl9PC9Gb3I+XG4gICAgICAgICAgPFNob3cgd2hlbj17IWlzV3JhcH0+XG4gICAgICAgICAgICA8ZGl2IGNsYXNzPXtzcGFjZXJDbGFzc30gc3R5bGU9e3NwYWNlclN0eWxlKHN0eWxlcz8uKCkuZ2V0KGl0ZW0uaWQpKX0gLz5cbiAgICAgICAgICAgIHsvKiBUaGlzIGVsZW1lbnQgZm9yY2VzIHRoZSBjb250YWluZXIgdG8gYWRhcHQgaXRzIGhlaWdodCBiYXNlZCBvbiB0aGUgc3BhY2VyIGluc2lkZSBgcmVuZGVySXRlbXNgICovfVxuICAgICAgICAgICAgPGRpdiBzdHlsZT17eyAnbWFyZ2luLXRvcCc6ICctMXB4JywgJ3BhZGRpbmctYm90dG9tJzogJzFweCcgfX0gLz5cbiAgICAgICAgICA8L1Nob3c+XG4gICAgICAgIDwvZGl2PlxuICAgICAgKVxuICAgIH1cblxuICAgIGlmIChpdGVtLmtpbmQgPT09ICdibG9jaycpIHtcbiAgICAgIC8vIENoZWNrIGlmIHRoaXMgYmxvY2sgY29udGFpbnMgc3ViLWNvbnRhaW5lcnMgKGkuZS4gaXQncyBhIGdyb3VwKVxuICAgICAgY29uc3QgaGFzQ29udGFpbmVycyA9IHRyZWUoKS5jaGlsZHJlbihpdGVtLmlkKS5zb21lKGMgPT4gYy5raW5kID09PSAnY29udGFpbmVyJylcbiAgICAgIGNvbnN0IHdyYXBCbG9ja1N0eWxlOiBKU1guQ1NTUHJvcGVydGllcyA9IGluV3JhcFBhcmVudFxuICAgICAgICA/IChoYXNDb250YWluZXJzXG4gICAgICAgICAgICA/IHsgd2lkdGg6ICcxMDAlJyB9XG4gICAgICAgICAgICA6IHsgd2lkdGg6ICc5MHB4JywgZmxleDogJzAgMCBhdXRvJyB9KVxuICAgICAgICA6IHt9XG4gICAgICBjb25zdCB3cmFwSW5uZXJTdHlsZTogSlNYLkNTU1Byb3BlcnRpZXMgPSBpbldyYXBQYXJlbnQgJiYgIWhhc0NvbnRhaW5lcnNcbiAgICAgICAgPyB7IHdpZHRoOiAnOTBweCcgfVxuICAgICAgICA6IHt9XG4gICAgICByZXR1cm4gKFxuICAgICAgICA8ZGl2XG4gICAgICAgICAgY2xhc3M9e2Jsb2NrQ2xhc3N9XG4gICAgICAgICAgZGF0YS1raW5kPXtpdGVtLmtpbmR9XG4gICAgICAgICAgc3R5bGU9e3sgLi4ub3V0ZXJTdHlsZShzdHlsZXM/LigpLmdldChpdGVtLmlkKSksIC4uLndyYXBCbG9ja1N0eWxlLFxuICAgICAgICAgICAgLy8gREVCVUdcbiAgICAgICAgICAgIGJvcmRlcjogaW5XcmFwUGFyZW50ID8gJzJweCBzb2xpZCBsaW1lJyA6ICcycHggc29saWQgb3JhbmdlJyxcbiAgICAgICAgICB9fVxuICAgICAgICAgIG9uUG9pbnRlckRvd249e2hhbmRsZVBvaW50ZXJEb3duKGl0ZW0pfVxuICAgICAgICA+XG4gICAgICAgICAgPGRpdiByZWY9e2VsID0+IGl0ZW1FbGVtZW50cy5zZXQoaXRlbS5pZCwgZWwpfSBzdHlsZT17ey4uLmlubmVyU3R5bGUoc3R5bGVzPy4oKS5nZXQoaXRlbS5pZCkpLCAuLi53cmFwSW5uZXJTdHlsZSxcbiAgICAgICAgICAgIC8vIERFQlVHXG4gICAgICAgICAgICBib3JkZXI6ICcxcHggZGFzaGVkIHllbGxvdycsXG4gICAgICAgICAgfX0+XG4gICAgICAgICAgICA8RHluYW1pY1xuICAgICAgICAgICAgICBjb21wb25lbnQ9e3Byb3BzLmNoaWxkcmVufVxuICAgICAgICAgICAgICBrZXk9e2l0ZW0ua2V5fVxuICAgICAgICAgICAgICBibG9jaz17aXRlbS5ibG9ja31cbiAgICAgICAgICAgICAgc2VsZWN0ZWQ9e3NlbGVjdGVkQmxvY2tzKCkuaW5jbHVkZXMoaXRlbS5rZXkpfVxuICAgICAgICAgICAgICBkcmFnZ2luZz17aXRlbVByb3BzLmRyYWdnaW5nID09PSB0cnVlfVxuICAgICAgICAgICAgPlxuICAgICAgICAgICAgICA8Rm9yIGVhY2g9e3RyZWUoKS5jaGlsZHJlbihpdGVtLmlkKX0+e2NoaWxkID0+IHJlbmRlckl0ZW0oY2hpbGQsIHRyZWUsIHt9LCBzdHlsZXMpfTwvRm9yPlxuICAgICAgICAgICAgPC9EeW5hbWljPlxuICAgICAgICAgIDwvZGl2PlxuICAgICAgICA8L2Rpdj5cbiAgICAgIClcbiAgICB9XG5cbiAgICBpZiAoaXRlbS5raW5kID09PSAncGxhY2Vob2xkZXInKSB7XG4gICAgICBpZiAoaW5XcmFwUGFyZW50KSByZXR1cm4gbnVsbFxuICAgICAgcmV0dXJuIChcbiAgICAgICAgPGRpdiBjbGFzcz17YmxvY2tDbGFzc30gZGF0YS1raW5kPXtpdGVtLmtpbmR9IHN0eWxlPXtvdXRlclN0eWxlKHN0eWxlcz8uKCkuZ2V0KGl0ZW0uaWQpKX0+XG4gICAgICAgICAgPGRpdiByZWY9e2VsID0+IGl0ZW1FbGVtZW50cy5zZXQoaXRlbS5pZCwgZWwpfSBzdHlsZT17cGxhY2Vob2xkZXJTdHlsZShzdHlsZXM/LigpLmdldChpdGVtLmlkKSl9PlxuICAgICAgICAgICAgPER5bmFtaWMgY29tcG9uZW50PXtwcm9wcy5wbGFjZWhvbGRlciA/PyBQbGFjZWhvbGRlcn0gcGFyZW50PXtpdGVtLnBhcmVudH0gLz5cbiAgICAgICAgICA8L2Rpdj5cbiAgICAgICAgPC9kaXY+XG4gICAgICApXG4gICAgfVxuXG4gICAgLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIEB0eXBlc2NyaXB0LWVzbGludC9uby11bm5lY2Vzc2FyeS1jb25kaXRpb25cbiAgICBpZiAoaXRlbS5raW5kID09PSAnZ2FwJykge1xuICAgICAgcmV0dXJuIChcbiAgICAgICAgPGRpdiBjbGFzcz17YmxvY2tDbGFzc30gZGF0YS1raW5kPXtpdGVtLmtpbmR9IHN0eWxlPXtvdXRlclN0eWxlKHN0eWxlcz8uKCkuZ2V0KGl0ZW0uaWQpKX0+XG4gICAgICAgICAgPGRpdlxuICAgICAgICAgICAgcmVmPXtlbCA9PiBpdGVtRWxlbWVudHMuc2V0KGl0ZW0uaWQsIGVsKX1cbiAgICAgICAgICAgIHN0eWxlPXt7ICd6LWluZGV4JzogNTAsIGhlaWdodDogYCR7aXRlbS5oZWlnaHR9cHhgLCAuLi5kcm9wem9uZVN0eWxlKHN0eWxlcz8uKCkuZ2V0KGl0ZW0uaWQpKSB9fVxuICAgICAgICAgID5cbiAgICAgICAgICAgIDxEeW5hbWljIGNvbXBvbmVudD17cHJvcHMuZHJvcHpvbmUgPz8gRHJvcHpvbmV9IC8+XG4gICAgICAgICAgPC9kaXY+XG4gICAgICAgIDwvZGl2PlxuICAgICAgKVxuICAgIH1cbiAgfVxuXG4gIGNvbnN0IHJvb3QgPSBjcmVhdGVNZW1vKCgpID0+IHRyZWUoKS5yb290KVxuXG4gIHJldHVybiAoXG4gICAgPGRpdlxuICAgICAgb25Gb2N1c091dD17ZXYgPT4ge1xuICAgICAgICBpZiAoZXYucmVsYXRlZFRhcmdldCA9PT0gZm9jdXNFbGVtZW50KSByZXR1cm5cbiAgICAgICAgcHJvcHMub25TZWxlY3Rpb25DaGFuZ2U/Lih7IGtpbmQ6ICdkZXNlbGVjdCcgfSlcbiAgICAgIH19XG4gICAgICBvbktleURvd249e2hhbmRsZUtleURvd259XG4gICAgICBvbkNvcHk9e2hhbmRsZUNvcHl9XG4gICAgICBvbkN1dD17aGFuZGxlQ3V0fVxuICAgICAgb25QYXN0ZT17aGFuZGxlUGFzdGV9XG4gICAgICBzdHlsZT17e1xuICAgICAgICBwb3NpdGlvbjogJ3JlbGF0aXZlJyxcbiAgICAgICAgaGVpZ2h0OiBjb250YWluZXJIZWlnaHQoKSxcbiAgICAgICAgJ2JveC1zaXppbmcnOiAnYm9yZGVyLWJveCcsXG4gICAgICAgIFsnLS1zb2xpZG5lc3QtZHVyYXRpb24nXTogYCR7b3B0aW9ucygpLnRyYW5zaXRpb25EdXJhdGlvbn1tc2AsXG4gICAgICB9fVxuICAgID5cbiAgICAgIDxkaXYgcmVmPXtmb2N1c0VsZW1lbnR9IHRhYkluZGV4PXstMX0gLz5cbiAgICAgIHtyZW5kZXJJdGVtKHJvb3QoKSwgdHJlZSwge30sIHN0eWxlcyl9XG4gICAgICB7LyogRHJhZyBnaG9zdCAqL31cbiAgICAgIDxTaG93IHdoZW49e2RyYWdUcmVlKCl9IGtleWVkPlxuICAgICAgICB7dHJlZSA9PiB7XG4gICAgICAgICAgY29uc3QgYmxvY2tzID0gdHJlZVxuICAgICAgICAgICAgLmNoaWxkcmVuKHRyZWUucm9vdC5pZClcbiAgICAgICAgICAgIC5tYXAoaXRlbSA9PiAoaXRlbS5raW5kID09PSAnYmxvY2snID8gZ2V0QmxvY2soaXRlbS5rZXkpIDogbnVsbCkpXG4gICAgICAgICAgICAuZmlsdGVyKG5vdE51bGwpXG4gICAgICAgICAgY29uc3QgdG9wID0gY3JlYXRlTWVtbygoKSA9PiB7XG4gICAgICAgICAgICBjb25zdCBzdGF0ZSA9IGRyYWdTdGF0ZSgpXG4gICAgICAgICAgICByZXR1cm4gc3RhdGUgJiYgdHJlZS5maW5kSXRlbUJ5SWQoc3RhdGUudG9wSXRlbSlcbiAgICAgICAgICB9KVxuICAgICAgICAgIHJldHVybiAoXG4gICAgICAgICAgICA8ZGl2IHN0eWxlPXtkcmFnQ29udGFpbmVyU3R5bGUoKX0+XG4gICAgICAgICAgICAgIDxEeW5hbWljIGNvbXBvbmVudD17cHJvcHMuZHJhZ0NvbnRhaW5lciA/PyBEcmFnQ29udGFpbmVyfSBibG9ja3M9e2Jsb2Nrc30+XG4gICAgICAgICAgICAgICAgPFNob3cgd2hlbj17dG9wKCl9IGtleWVkPlxuICAgICAgICAgICAgICAgICAge3RvcCA9PiByZW5kZXJJdGVtKHRvcCwgKCkgPT4gdHJlZSwgeyBkcmFnZ2luZzogdHJ1ZSB9KX1cbiAgICAgICAgICAgICAgICA8L1Nob3c+XG4gICAgICAgICAgICAgIDwvRHluYW1pYz5cbiAgICAgICAgICAgIDwvZGl2PlxuICAgICAgICAgIClcbiAgICAgICAgfX1cbiAgICAgIDwvU2hvdz5cbiAgICA8L2Rpdj5cbiAgKVxufVxuIl0sImZpbGUiOiIvd29ya3NwYWNlL3BhY2thZ2VzL3NvbGlkLW5lc3Qvc3JjL0Jsb2NrVHJlZS50c3gifQ==