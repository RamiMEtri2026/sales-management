/**
 * Decimal-safe money helpers.
 * All authoritative financial math is performed in integer piasters (1 EGP = 100 piasters)
 * to avoid floating-point drift. Values are only converted back to a decimal number at the
 * boundary (display / persistence), never used as an accumulator.
 */

export const PIastres = 100;

export function toPiastres(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * PIastres);
}

export function fromPiastres(p: number): number {
  return p / PIastres;
}

export function round2(value: number): number {
  return fromPiastres(toPiastres(value));
}

export function addMoney(...values: number[]): number {
  return fromPiastres(values.reduce((s, v) => s + toPiastres(v), 0));
}

export function subMoney(a: number, b: number): number {
  return fromPiastres(toPiastres(a) - toPiastres(b));
}

export function mulMoney(amount: number, factor: number): number {
  return fromPiastres(Math.round(toPiastres(amount) * factor));
}

export function percentOf(amount: number, percent: number): number {
  return fromPiastres(Math.round((toPiastres(amount) * percent) / 100));
}

export function sumMoney(values: number[]): number {
  return fromPiastres(values.reduce((s, v) => s + toPiastres(v), 0));
}