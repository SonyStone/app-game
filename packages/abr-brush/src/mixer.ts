import { d, std } from 'typegpu';

/** Diameter-normalized reservoir dose. The exchange/depletion model still needs native calibration. */
export function mixerDose(remaining: number, flow: number, distanceInDiameters: number) {
  const exchange = Math.min(1, Math.max(0.01, distanceInDiameters));
  const dose = flow * exchange * 0.05;
  return {
    exchange,
    available: dose > 0 ? Math.min(1, remaining / dose) : Number(remaining > 0),
    remaining: Math.max(0, remaining - dose)
  };
}

/** Canvas uptake and retained pigment, all in premultiplied color. */
export function mixerPickup(oldPickup: d.v4f, canvas: d.v4f, controls: d.v4f) {
  'use gpu';
  const uptake = controls.x * controls.z;
  const retention = 1 - controls.w * controls.z * (1 - controls.x);
  return d.vec4f(
    mixerPickupChannel(oldPickup.x, canvas.x, canvas.a, uptake, retention),
    mixerPickupChannel(oldPickup.y, canvas.y, canvas.a, uptake, retention),
    mixerPickupChannel(oldPickup.z, canvas.z, canvas.a, uptake, retention),
    mixerPickupChannel(oldPickup.a, canvas.a, canvas.a, uptake, retention)
  );
}

/** Exchanges picked-up color with the loaded reservoir without manufacturing opaque paint. */
export function mixerReservoir(reservoir: d.v4f, pickup: d.v4f, controls: d.v4f) {
  'use gpu';
  const uptake = controls.x * controls.z;
  return d.vec4f(
    mixerReservoirChannel(reservoir.x, reservoir.a, pickup.x, pickup.a, uptake),
    mixerReservoirChannel(reservoir.y, reservoir.a, pickup.y, pickup.a, uptake),
    mixerReservoirChannel(reservoir.z, reservoir.a, pickup.z, pickup.a, uptake),
    reservoir.a + (1 - reservoir.a) * uptake * pickup.a
  );
}

/** Wet zero always uses loaded paint; Mix otherwise selects the pickup/reservoir proportion. */
export function mixerPaint(reservoir: d.v4f, pickup: d.v4f, wet: number, mix: number, available: number) {
  'use gpu';
  return std.mix(std.mul(reservoir, available), pickup, std.select(0, mix, wet > 0));
}

/** Deposits well output through coverage. Empty wells leave existing canvas pixels intact. */
export function mixerComposite(base: d.v4f, picked: d.v4f, coverage: number) {
  'use gpu';
  const paint = std.mul(picked, coverage);
  return std.add(paint, std.mul(base, 1 - paint.a));
}

/** Scalar well update for CPU raster loops; also used by the GPU vector wrapper. */
export function mixerPickupChannel(
  old: number,
  canvas: number,
  canvasAlpha: number,
  uptake: number,
  retention: number
) {
  'use gpu';
  return canvas * uptake + old * retention * (1 - canvasAlpha * uptake);
}

/** Straight-color exchange expressed on one premultiplied reservoir channel. */
export function mixerReservoirChannel(
  reservoir: number,
  reservoirAlpha: number,
  pickup: number,
  pickupAlpha: number,
  uptake: number
) {
  'use gpu';
  const amount = uptake * pickupAlpha;
  const alpha = reservoirAlpha + (1 - reservoirAlpha) * amount;
  const old = reservoir / std.max(0.00001, reservoirAlpha);
  return (old + ((pickup / std.max(0.00001, pickupAlpha) - old) * amount) / std.max(0.00001, alpha)) * alpha;
}
