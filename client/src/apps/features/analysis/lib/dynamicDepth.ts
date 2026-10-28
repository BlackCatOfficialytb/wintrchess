// ponytail: depth cap derived from core count only; upgrade path —
// calibrate from measured engine nps over a few evaluated positions.
export function getDynamicDepthCap(multiThreaded: boolean): number {
    const cores = navigator.hardwareConcurrency;

    if (!cores) return 22;

    const score = cores * (multiThreaded ? 1.2 : 0.9);

    if (score >= 12) return 30;
    if (score >= 6) return 25;
    return 20;
}
