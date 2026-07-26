// Gearbook asset access — parse the published JSONL files and build the
// reference catalog the batch matcher runs against. Runtime-agnostic: no fs,
// no fetch — callers hand in file contents as strings (or pre-parsed rows).
import { matchNormalize, matchTokens } from './match-normalize.js';
/** Parse a JSONL string, skipping blank/malformed lines. */
export function parseJsonl(text) {
    const out = [];
    for (const line of text.split('\n')) {
        if (!line.trim())
            continue;
        try {
            out.push(JSON.parse(line));
        }
        catch {
            /* skip malformed line */
        }
    }
    return out;
}
/** Build the batch-match catalog from parsed asset rows. */
export function buildMatchCatalog(cameras, lenses, aliases = []) {
    const aliasesBySlug = new Map();
    for (const a of aliases) {
        if (!a.gearbook_id || !a.alias)
            continue;
        let list = aliasesBySlug.get(a.gearbook_id);
        if (!list) {
            list = [];
            aliasesBySlug.set(a.gearbook_id, list);
        }
        list.push({ alias: a.alias, meta: a.via ? { via: a.via, ...(a.market ? { market: a.market } : {}) } : undefined });
    }
    const entries = [];
    for (const [rows, kind] of [
        [cameras, 'camera'],
        [lenses, 'lens'],
    ]) {
        for (const r of rows) {
            if (!r.name || !r.id)
                continue;
            // the record's own name doubles as an alias row in the asset — drop it
            const aliasList = (aliasesBySlug.get(r.id) ?? []).filter((a) => a.alias !== r.name);
            entries.push({
                id: r.id,
                kind,
                title: r.name,
                norm: matchNormalize(r.name),
                aliases: aliasList.map((a) => a.alias),
                aliasNorms: aliasList.map((a) => matchNormalize(a.alias)),
                aliasMeta: aliasList.map((a) => a.meta),
            });
        }
    }
    const byNorm = new Map();
    for (const e of entries) {
        if (!byNorm.has(e.norm))
            byNorm.set(e.norm, e);
        for (const n of e.aliasNorms)
            if (!byNorm.has(n))
                byNorm.set(n, e);
    }
    // Token index over titles AND aliases — the published name may differ from
    // what a seller writes, but an alias usually bridges it.
    const tokenIndex = new Map();
    entries.forEach((e, i) => {
        const toks = new Set(matchTokens(e.title));
        for (const a of e.aliasNorms)
            for (const t of a.split(' '))
                if (t)
                    toks.add(t);
        for (const tok of toks) {
            let list = tokenIndex.get(tok);
            if (!list) {
                list = [];
                tokenIndex.set(tok, list);
            }
            list.push(i);
        }
    });
    // Typo-correction vocabulary: title tokens only (alias rows include
    // generated variants that would skew frequencies).
    const vocab = new Map();
    for (const e of entries) {
        for (const t of matchTokens(e.title)) {
            if (!/\d/.test(t) && t.length >= 3)
                vocab.set(t, (vocab.get(t) ?? 0) + 1);
        }
    }
    return { entries, byNorm, tokenIndex, vocab };
}
/** Convenience: build the catalog straight from the three JSONL file contents. */
export function catalogFromJsonl(input) {
    return buildMatchCatalog(parseJsonl(input.camerasJsonl), parseJsonl(input.lensesJsonl), input.aliasesJsonl ? parseJsonl(input.aliasesJsonl) : []);
}
//# sourceMappingURL=gearbook.js.map