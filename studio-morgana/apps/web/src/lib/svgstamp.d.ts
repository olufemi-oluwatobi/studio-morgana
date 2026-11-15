export interface StampPart { name: string; area: number }
export interface StampResult { ok: boolean; name?: string; gt?: string; parts?: StampPart[]; svg?: string; notes: string[] }
export function svgToStamp(svg: string, opts?: { name?: string }): StampResult;
