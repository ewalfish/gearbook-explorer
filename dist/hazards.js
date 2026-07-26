/**
 * The two things that make a working vintage camera unusable to a buyer.
 *
 * Both are derivable from facts the asset already carries — `data.format` and
 * `data.batteries` — which is exactly why they belong in the library rather
 * than in one consumer's product page. Encoding "126 film has not been made in
 * decades" once, next to the data that proves it, means the storefront, the
 * Explorer and any eBay description say the same true thing.
 *
 * This is derivation, not assertion. Nothing here adds a fact to the asset; it
 * reads two fields and states a consequence a buyer would otherwise have to
 * know already.
 *
 * Measured against real stock: 143 of 953 confidently-linked cameras — 15% —
 * carry at least one of these. Saying so plainly costs the occasional sale and
 * prevents the return that would otherwise follow it.
 */
/**
 * Formats no longer manufactured, with the year the last mainstream stock left
 * production. A camera taking one of these is not broken — the film is simply
 * gone, and a buyer expecting to shoot it will be disappointed.
 *
 * Deliberately EXCLUDES 120, 220 and 35mm/135: 120 is in full production, and
 * 220 is niche-but-obtainable rather than dead.
 */
const DEAD_FILM = {
    '126': { label: '126 cartridge', detail: 'Takes 126 Instamatic cartridges, discontinued in 1999. No mainstream film is made for it — respooling or a display piece.' },
    '110': { label: '110 cartridge', detail: 'Takes 110 pocket cartridges. Long discontinued by the major makers, though Lomography still produces a small range.' },
    '620': { label: '620 spool', detail: 'Takes 620 spools, discontinued in 1995. The film itself is 120 — it needs respooling onto a 620 spool to load.' },
    '828': { label: '828 roll', detail: 'Takes 828 roll film, discontinued in 1985. Effectively unobtainable; respooling from 35mm is the only route.' },
    '127': { label: '127 roll', detail: 'Takes 127 roll film. Out of mainstream production since 1995; small-batch stock appears occasionally.' },
    '116': { label: '116 roll', detail: 'Takes 116 roll film, discontinued in 1984. Unobtainable — a display and collector piece.' },
    '117': { label: '117 roll', detail: 'Takes 117 roll film, discontinued long ago. Unobtainable — a display and collector piece.' },
    aps: { label: 'APS', detail: 'Takes Advanced Photo System cartridges, discontinued in 2011. No film is produced and processing is very limited.' },
    disc: { label: 'Kodak Disc', detail: 'Takes Kodak Disc film, discontinued in 1999. Unobtainable — a display piece.' },
};
/**
 * Mercury cells. Banned by most of the world in the 1990s. The problem is not
 * merely availability: mercury cells held a flat 1.35V, and a modern 1.5V
 * alkaline makes the meter read wrong across the range rather than uniformly,
 * so a substitute needs an adapter or recalibration.
 */
const MERCURY = /\b(px\s?(?:1|13|14|21|23|27|400|625|640|675|825)|mr\s?9|mr\s?44|v625|hg\b|mercury)\b/i;
/** Every hazard implied by a record's own facts. Empty for most cameras. */
export function hazards(data) {
    const out = [];
    if (!data)
        return out;
    const fmt = String(data.format ?? '').trim().toLowerCase();
    const dead = DEAD_FILM[fmt];
    if (dead) {
        out.push({ kind: 'discontinued-film', label: dead.label, detail: dead.detail, because: String(data.format) });
    }
    const cells = (data.batteries ?? []).filter((b) => MERCURY.test(String(b)));
    if (cells.length) {
        out.push({
            kind: 'mercury-battery',
            label: `${cells[0]} mercury cell`,
            detail: `Designed around a ${cells.join(' / ')} mercury cell, banned since the 1990s. It works with an adapter or a 1.5V substitute, but the meter needs recalibrating — mercury cells held a flat 1.35V and alkalines do not.`,
            because: cells.join(', '),
        });
    }
    return out;
}
/** True when a buyer should be told something before purchasing. */
export const hasHazard = (data) => hazards(data).length > 0;
//# sourceMappingURL=hazards.js.map