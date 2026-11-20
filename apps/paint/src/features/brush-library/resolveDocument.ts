import { plainRoundRoute, resolveRoundBrush } from '@app-game/paint-core/composition/resolveRoundBrush';
import { defaultBrush, type Brush } from '@app-game/paint-core/brush';
import type { Coverage } from '@app-game/paint-core/paintbrush/asset';
import { compatibility } from '@app-game/paint-core/paintbrush/compatibility';
import type { BrushDocument } from '@app-game/paint-core/paintbrush/document';
import { photoshopExtensions, resolveAbr } from './abrDocument';
import { hostExtension, hostSettings } from './abrHost';
import { chooseRenderPath, paintDocumentFields, pressureBinding } from './nativeDocument';

/** Chooses a stroke renderer from the document. Host values fill groups omitted by the preset. */
export async function resolveDocument(
  document: BrushDocument,
  assets: ReadonlyMap<string, Coverage>,
  host = defaultBrush(),
  roundRoute: 'round' | 'abr' = plainRoundRoute
) {
  const native = chooseRenderPath(document);
  if (native.path === 'round') {
    const brush = resolveRoundBrush({ ...host, ...native.settings, engine: native.settings.engine }, roundRoute);
    return {
      path: roundRoute,
      status: native.status,
      reasons: roundRoute === 'round' ? ['Plain round route selects the native renderer'] : [],
      settings: roundRoute === 'round' ? native.settings : { ...native.settings, engine: brush.engine },
      brush,
      resources: []
    };
  }

  const reasons = native.reasons;
  const format = compatibility(document, [...photoshopExtensions, hostExtension, 'paint.native-settings.v1']);
  const d = document.definition;
  // These legacy Photoshop marking tools use the existing ABR fallback.
  const legacyTool =
    d.placement?.law === 'photoshop-v1' && ['photoshop.ClTl', 'photoshop.HBTl', 'photoshop.ABTl'].includes(d.tool);
  if (format.status === 'unavailable' && !legacyTool) {
    return { path: 'abr' as const, status: format.status, reasons: format.reasons };
  }
  try {
    const paint = (d.placement?.law ?? 'paint-distance-v1') === 'paint-distance-v1';
    const projection = paint ? paintDocumentFields(document) : undefined;
    if (projection && projection.status !== 'supported') {
      throw new Error(projection.reasons.join(', '));
    }
    const paintFields = projection?.settings;
    const ext = d.extensions?.[hostExtension];
    const savedHost = ext && hostSettings.parse(ext.value);
    const active = { ...host, ...savedHost, ...paintFields };
    const definition = paint
      ? {
          ...d,
          size: active.size,
          transfer: { ...d.transfer, flow: active.flow, opacity: active.opacity },
          dynamics: d.dynamics ?? [
            ...(active.pressureSize ? [pressureBinding('/size')] : []),
            ...(active.pressureFlow ? [pressureBinding('/transfer/flow')] : [])
          ]
        }
      : d;
    const prepared = await resolveAbr({ ...document, definition }, assets);
    const { engine, size, spacing, color, backgroundColor, opacity, flow, stroke, mixing } = prepared;
    const fields =
      savedHost ??
      paintFields ??
      Object.fromEntries(
        Object.entries({
          tool: 'brush',
          size,
          spacing,
          color,
          backgroundColor,
          opacity,
          flow,
          stroke,
          mixing
        }).filter(([, value]) => value !== undefined)
      );
    const settings: Partial<Brush> = { ...fields, engine };
    return {
      path: 'abr' as const,
      status: format.status === 'supported' ? ('supported' as const) : ('approximate' as const),
      reasons: [...new Set([...reasons, ...format.reasons])],
      settings,
      brush: { ...host, ...settings },
      resources: prepared.resources,
      prepared
    };
  } catch (cause) {
    return { path: 'abr' as const, status: 'unavailable' as const, reasons: [...reasons, String(cause)] };
  }
}
