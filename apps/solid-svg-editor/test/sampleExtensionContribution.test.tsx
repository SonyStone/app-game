import { createRoot } from 'solid-js';
import { render } from 'solid-js/web';
import { describe, expect, it } from 'vitest';

import { createAppMenuItems, topBarMenuSlots } from '../src/editor/app-menu';
import { createCommandPaletteItems } from '../src/editor/command-palette';
import { createContextMenuItems } from '../src/editor/context-menu';
import type { SvgAttributeControlContext } from '../src/editor/kernel';
import { createSvgDocument } from '../src/editor/svg-document';
import { nodeSelectionTarget } from '../src/editor/selection-targets';
import {
  sampleExtensionContribution,
  sampleExtensionIds,
  sampleExtensionNodeIdAttribute,
  sampleExtensionResourceKind,
  sampleExtensionTokenAttribute
} from '../src/extensions/sampleExtensionContribution';
import { createEditorAppController } from '../src/features/shell/createEditorAppController';
import {
  createEditorAppContributions,
  createEditorAppRegistries,
  createEditorAppSvgCapabilities
} from '../src/features/shell/editorAppContributions';
import { EditorModalStack } from '../src/features/modals/EditorModalStack';
import {
  createViewportToolsFromRegistry,
  type DefaultViewportToolContext
} from '../src/features/viewport/tools/defaultViewportTools';
import { createElementNode, getAttribute, type SvgElementNode } from '../src/svg-model';

describe('sample extension contribution', () => {
  it('installs across the app contribution registries without conflicts', () => {
    const contributions = createEditorAppContributions([sampleExtensionContribution]);
    const registries = createEditorAppRegistries([sampleExtensionContribution]);

    expect(contributions.at(-1)).toBe(sampleExtensionContribution);
    expect(registries.issues).toEqual([]);
    expect(registries.actions.map((item) => item.id)).toContain(sampleExtensionIds.action);
    expect(registries.commands.map((item) => item.id)).toContain(sampleExtensionIds.command);
    expect(registries.appMenus.map((item) => item.id)).toContain(sampleExtensionIds.appMenu);
    expect(registries.appMenus.map((item) => item.id)).toContain(sampleExtensionIds.modalAppMenu);
    expect(registries.contextMenus.map((item) => item.id)).toContain(sampleExtensionIds.contextMenu);
    expect(registries.shortcuts.map((item) => item.id)).toContain(sampleExtensionIds.shortcut);
    expect(registries.modals.map((item) => item.id)).toContain(sampleExtensionIds.modal);
    expect(registries.svg.map((item) => item.id)).toContain(sampleExtensionIds.svg);
    expect(registries.tools.map((item) => item.id)).toContain(sampleExtensionIds.tool);
    expect(registries.renderers.map((item) => item.id)).toContain(sampleExtensionIds.renderer);
    expect(registries.viewportOverlays.map((item) => item.id)).toContain(sampleExtensionIds.overlay);
    expect(registries.settingsSections.map((item) => item.id)).toContain(sampleExtensionIds.settingsSection);
    expect(registries.panels.map((item) => item.id)).toContain(sampleExtensionIds.panel);
  });

  it('provides a real SVG capability with creation, bounds, and diagnostics', () => {
    const capabilities = createEditorAppSvgCapabilities([sampleExtensionContribution]);
    const badge = capabilities.createElement(sampleExtensionIds.element);
    const root = createElementNode('svg', [], [badge]);
    const invalidBadge = createElementNode(sampleExtensionIds.element, [
      { name: 'x', value: '5' },
      { name: 'y', value: '6' },
      { name: 'width', value: '30' },
      { name: 'height', value: '12' },
      { name: 'tone', value: 'danger' }
    ]);
    const document = createSvgDocument(createElementNode('svg', [], [invalidBadge]), capabilities);

    expect(capabilities.addableElements[0]?.name).toBe(sampleExtensionIds.element);
    expect(capabilities.getElement(sampleExtensionIds.resourceElement)?.resourceKind).toBe(sampleExtensionResourceKind);
    expect(capabilities.getAttribute(sampleExtensionTokenAttribute).resourceReferenceKind).toBe(
      sampleExtensionResourceKind
    );
    expect(badge.attrs).toEqual([
      { name: 'x', value: '24' },
      { name: 'y', value: '24' },
      { name: 'width', value: '96' },
      { name: 'height', value: '40' },
      { name: 'tone', value: 'info' }
    ]);
    expect(capabilities.getElementBounds(root, badge)).toEqual({ x: 24, y: 24, width: 96, height: 40 });
    expect(document.diagnostics).toContainEqual({
      kind: 'contribution.sample-extension.invalid-tone',
      severity: 'warning',
      nodeId: invalidBadge.id,
      message: 'Unsupported sample badge tone: danger',
      source: sampleExtensionIds.svg,
      data: { tone: 'danger' }
    });
  });

  it('indexes custom sample resources and reference diagnostics through installed capabilities', () => {
    const capabilities = createEditorAppSvgCapabilities([sampleExtensionContribution]);
    const token = createElementNode(sampleExtensionIds.resourceElement, [
      { name: 'id', value: 'brand-token' },
      { name: 'tone', value: 'success' }
    ]);
    const badge = createElementNode(sampleExtensionIds.element, [
      { name: 'x', value: '5' },
      { name: 'y', value: '6' },
      { name: 'width', value: '30' },
      { name: 'height', value: '12' },
      { name: 'tone', value: 'info' },
      { name: sampleExtensionTokenAttribute, value: 'url(#brand-token)' }
    ]);
    const missingReferenceBadge = createElementNode(sampleExtensionIds.element, [
      { name: 'x', value: '5' },
      { name: 'y', value: '6' },
      { name: 'width', value: '30' },
      { name: 'height', value: '12' },
      { name: 'tone', value: 'info' },
      { name: sampleExtensionTokenAttribute, value: 'url(#missing-token)' }
    ]);
    const document = createSvgDocument(createElementNode('svg', [], [token, badge]), capabilities);
    const missingReferenceDocument = createSvgDocument(
      createElementNode('svg', [], [missingReferenceBadge]),
      capabilities
    );
    const [reference] = document.resourceGraph.referencesFromNode(badge.id);

    expect(document.resources.byId.get('brand-token')).toMatchObject({
      id: 'brand-token',
      elementName: sampleExtensionIds.resourceElement,
      kind: sampleExtensionResourceKind
    });
    expect(reference).toEqual({
      nodeId: badge.id,
      attributeName: sampleExtensionTokenAttribute,
      targetId: 'brand-token',
      kind: sampleExtensionResourceKind
    });
    expect(reference && document.resourceGraph.resolveReference(reference).resource).toMatchObject({
      id: 'brand-token',
      nodeId: token.id,
      kind: sampleExtensionResourceKind
    });
    expect(document.resourceGraph.resolveResourceNode('brand-token')?.id).toBe(token.id);
    expect(document.diagnostics).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'broken-resource-reference',
          attributeName: sampleExtensionTokenAttribute
        })
      ])
    );
    expect(missingReferenceDocument.diagnostics).toContainEqual(
      expect.objectContaining({
        kind: 'broken-resource-reference',
        severity: 'error',
        nodeId: missingReferenceBadge.id,
        attributeName: sampleExtensionTokenAttribute,
        targetId: 'missing-token',
        referenceKind: sampleExtensionResourceKind
      })
    );
  });

  it('renders the sample custom attribute control through SVG capabilities', () => {
    const capabilities = createEditorAppSvgCapabilities([sampleExtensionContribution]);
    const badge = capabilities.createElement(sampleExtensionIds.element);
    const root = createElementNode('svg', [], [badge]);
    let updated = '';
    const control = capabilities.renderAttributeControl({
      root,
      node: badge,
      name: 'tone',
      value: 'info',
      capabilities,
      dispatchCommand: () => undefined,
      selectTarget: () => undefined,
      update: (value) => {
        updated = value;
      }
    } satisfies SvgAttributeControlContext);
    const container = document.createElement('div');
    document.body.append(container);

    if (!control) {
      throw new Error('Expected sample tone control');
    }

    const dispose = render(() => control, container);

    expect(container.querySelector('[data-testid="sample-extension-tone-info"]')?.getAttribute('aria-pressed')).toBe(
      'true'
    );

    requireElement(container, 'sample-extension-tone-success', HTMLButtonElement).click();

    expect(updated).toBe('success');

    dispose();
    container.remove();
  });

  it('runs sample commands through app and context menu contributions', () => {
    createRoot((disposeRoot) => {
      const app = createEditorAppController({ contributions: [sampleExtensionContribution] });

      app.kernel.documents.applyCode('<svg><sampleBadge x="1" y="2" width="3" height="4" tone="info"/></svg>');

      const badge = requireElementByName(app.kernel.documents.activeRoot(), sampleExtensionIds.element);
      app.kernel.selection.setSelectedTargets([nodeSelectionTarget(badge.id)]);

      const appMenuItem = requireContribution(
        createAppMenuItems(app.kernel, topBarMenuSlots.more),
        sampleExtensionIds.appMenu
      );

      if (appMenuItem.kind !== 'action') {
        throw new Error('Expected sample app menu action');
      }

      expect(appMenuItem.enabled).toBe(true);
      expect(appMenuItem.run()).toBe(true);
      expect(
        getAttribute(requireElementByName(app.kernel.documents.activeRoot(), sampleExtensionIds.element), 'tone', true)
      ).toBe('success');

      const contextItem = requireContribution(
        createContextMenuItems(app.kernel, nodeSelectionTarget(badge.id)),
        sampleExtensionIds.contextMenu
      );

      expect(contextItem.enabled).toBe(true);
      expect(contextItem.run()).toBe(true);
      expect(
        getAttribute(requireElementByName(app.kernel.documents.activeRoot(), sampleExtensionIds.element), 'tone', true)
      ).toBe('warning');

      disposeRoot();
    });
  });

  it('surfaces sample shortcut metadata through the command palette', () => {
    createRoot((disposeRoot) => {
      const app = createEditorAppController({ contributions: [sampleExtensionContribution] });

      app.kernel.documents.applyCode('<svg><sampleBadge x="1" y="2" width="3" height="4" tone="info"/></svg>');

      const badge = requireElementByName(app.kernel.documents.activeRoot(), sampleExtensionIds.element);
      app.kernel.selection.setSelectedTargets([nodeSelectionTarget(badge.id)]);

      const paletteItem = requireContribution(createCommandPaletteItems(app.kernel), sampleExtensionIds.command);

      if (paletteItem.kind !== 'command') {
        throw new Error('Expected sample command palette command');
      }

      expect(paletteItem.shortcutKeys).toEqual(['Ctrl+Shift+B']);
      expect(paletteItem.enabled).toBe(true);
      expect(paletteItem.run()).toBe(true);
      expect(
        getAttribute(requireElementByName(app.kernel.documents.activeRoot(), sampleExtensionIds.element), 'tone', true)
      ).toBe('success');

      disposeRoot();
    });
  });

  it('opens the sample modal from a registered app-menu action', () => {
    createRoot((disposeRoot) => {
      const app = createEditorAppController({ contributions: [sampleExtensionContribution] });
      const guideItem = requireContribution(
        createAppMenuItems(app.kernel, topBarMenuSlots.more),
        sampleExtensionIds.modalAppMenu
      );
      const container = document.createElement('div');

      if (guideItem.kind !== 'action') {
        throw new Error('Expected sample guide app menu action');
      }

      document.body.append(container);

      expect(guideItem.enabled).toBe(true);
      expect(app.kernel.ui.modal?.active()).toBeUndefined();
      expect(guideItem.run()).toBe(true);
      expect(app.kernel.ui.modal?.active()).toBe(sampleExtensionIds.modal);

      const disposeRender = render(() => <EditorModalStack kernel={app.kernel} />, container);

      expect(container.querySelector('[data-testid="sample-extension-modal"]')).not.toBeNull();
      expect(container.querySelector('[data-testid="sample-extension-modal-shortcut-state"]')?.textContent).toBe(
        'installed'
      );

      requireElement(container, 'sample-extension-modal-close', HTMLButtonElement).click();

      expect(app.kernel.ui.modal?.active()).toBeUndefined();

      disposeRender();
      container.remove();
      disposeRoot();
    });
  });

  it('runs renderer, tool, panel, settings, and overlay examples through the live kernel', () => {
    createRoot((disposeRoot) => {
      const app = createEditorAppController({ contributions: [sampleExtensionContribution] });
      app.kernel.documents.applyCode('<svg><sampleBadge x="1" y="2" width="3" height="4" tone="info"/></svg>');
      const badge = requireElementByName(app.kernel.documents.activeRoot(), sampleExtensionIds.element);
      app.kernel.selection.setSelectedTargets([nodeSelectionTarget(badge.id)]);
      const target = document.createElement('button');
      const child = document.createElement('span');
      const panel = requireContribution(app.kernel.registries.panels, sampleExtensionIds.panel);
      const settingsSection = requireContribution(
        app.kernel.registries.settingsSections,
        sampleExtensionIds.settingsSection
      );
      const overlay = requireContribution(app.kernel.registries.viewportOverlays, sampleExtensionIds.overlay);
      const sampleToolContribution = requireContribution(app.kernel.registries.tools, sampleExtensionIds.tool);
      const [sampleTool] = createViewportToolsFromRegistry(createViewportToolContextFixture(), [
        sampleToolContribution
      ]);
      const container = document.createElement('div');
      let prevented = false;

      if (!app.kernel.viewport.overlays) {
        throw new Error('Expected viewport overlay service');
      }

      target.setAttribute(sampleExtensionNodeIdAttribute, 'sample-node');
      target.append(child);
      document.body.append(container);

      const disposeRender = render(
        () => (
          <>
            {panel.render({ kernel: app.kernel })}
            {settingsSection.render({ kernel: app.kernel })}
            {overlay.render({ context: { kernel: app.kernel }, overlays: app.kernel.viewport.overlays })}
          </>
        ),
        container
      );

      expect(app.kernel.rendering.viewportRenderer?.selectionTargetFromEventTarget(child)).toEqual(
        nodeSelectionTarget('sample-node')
      );
      expect(
        sampleTool?.onSelectionTargetPointerDown?.(nodeSelectionTarget('sample-node'), {
          altKey: true,
          preventDefault: () => {
            prevented = true;
          }
        } as PointerEvent)
      ).toBe(true);
      expect(prevented).toBe(true);
      expect(container.querySelector('[data-testid="sample-extension-root-name"]')?.textContent).toBe('svg');
      expect(container.querySelector('[data-testid="sample-extension-capability-state"]')?.textContent).toBe(
        'installed'
      );
      expect(container.querySelector('[data-testid="sample-extension-selected-count"]')?.textContent).toBe('1');

      disposeRender();
      container.remove();
      disposeRoot();
    });
  });
});

function requireContribution<TContribution extends { readonly id: string }>(
  contributions: readonly TContribution[],
  id: string
): TContribution {
  const contribution = contributions.find((item) => item.id === id);

  if (!contribution) {
    throw new Error(`Expected contribution ${id}`);
  }

  return contribution;
}

function requireElement(container: ParentNode, testId: string, type: typeof HTMLElement): HTMLElement {
  const element = container.querySelector(`[data-testid="${testId}"]`);

  if (!(element instanceof type)) {
    throw new Error(`Expected ${testId}`);
  }

  return element;
}

function requireElementByName(root: SvgElementNode, name: string): SvgElementNode {
  const child = root.children.find((node): node is SvgElementNode => node.kind === 'element' && node.name === name);

  if (!child) {
    throw new Error(`Expected ${name}`);
  }

  return child;
}

function createViewportToolContextFixture(): DefaultViewportToolContext {
  return {
    activeDrag: () => undefined,
    clearContextMenu: () => undefined,
    handleViewportWheel: () => false,
    hasTouchPoint: () => false,
    beginTouchPoint: () => undefined,
    updateTouchPoint: () => undefined,
    finishTouchPoint: () => undefined,
    beginPanDrag: () => undefined,
    updatePanDrag: () => undefined,
    finishPanDrag: () => undefined,
    beginCanvasRotateDrag: () => undefined,
    updateCanvasRotateDrag: () => undefined,
    finishCanvasRotateDrag: () => undefined,
    handleCanvasSelectionPointerDown: () => false,
    handleNodeSelectionPointerDown: () => false,
    handleSelectionTargetPointerDown: () => false,
    updateMarqueeDrag: () => undefined,
    finishMarqueeDrag: () => undefined,
    updateMoveSelectionDrag: () => undefined,
    finishMoveSelectionDrag: () => undefined,
    beginElementHandleDrag: () => false,
    updateElementHandleDrag: () => undefined,
    finishElementHandleDrag: () => undefined,
    beginTransformBoxDrag: () => false,
    updateTransformBoxDrag: () => undefined,
    finishTransformBoxDrag: () => undefined,
    cancelActiveDrag: () => undefined
  } satisfies DefaultViewportToolContext;
}
