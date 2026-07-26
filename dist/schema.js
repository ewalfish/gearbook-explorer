/**
 * The gearbook asset CONTRACT.
 *
 * This file is the promise the published asset makes, and the means to check
 * it. The same artifact is used at three checkpoints:
 *
 *   forge     gate before publish     "we will not ship a broken asset"
 *   library   test on build           "what we ship matches what we promise"
 *   consumer  CI on the installed dep "what we got is what was promised"
 *
 * A shape change therefore goes loud in all three places on the same day,
 * instead of surfacing months later as a wrong spec on a product page.
 *
 * Deliberately dependency-free — no ajv, no zod. The forge is plain .mjs with
 * no build step, and a schema that cannot run there is a schema that does not
 * get run. `ASSET_SCHEMA` is emitted as standard JSON Schema for tooling that
 * wants it; `validateAsset` is the executable version.
 */
export const MARKETS = ['us', 'intl', 'eu', 'jp'];
/** How an alias came to exist. See `validateAsset` for why this matters. */
export const ALIAS_VIA = ['name', 'market', 'superseded', 'shorthand', 'punctuation', 'correction'];
export const CONFIDENCE = ['high', 'medium', 'low'];
/** Current contract version. Bumped only by a breaking asset change. */
export const ASSET_CONTRACT = 1;
/** JSON Schema for the row shapes, for editors and external tooling. */
export const ASSET_SCHEMA = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    title: `Gearbook asset contract v${ASSET_CONTRACT}`,
    $defs: {
        record: {
            type: 'object',
            required: ['id', 'name', 'recommended_name', 'gearbook_version', 'confidence', 'data'],
            properties: {
                id: { type: 'string', pattern: '^[0-9a-f]{16}$' },
                name: { type: 'string', minLength: 1 },
                recommended_name: { type: 'string', minLength: 1 },
                gearbook_version: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
                confidence: { enum: [...CONFIDENCE] },
                data: {
                    type: 'object',
                    properties: {
                        market_names: {
                            type: 'array', minItems: 2,
                            items: {
                                type: 'object', required: ['name', 'market'], additionalProperties: false,
                                properties: { name: { type: 'string' }, market: { enum: [...MARKETS] }, primary: { const: true } },
                            },
                        },
                    },
                },
            },
        },
        alias: {
            type: 'object',
            required: ['alias', 'gearbook_kind', 'gearbook_id', 'via'],
            additionalProperties: false,
            properties: {
                alias: { type: 'string', minLength: 1 },
                gearbook_kind: { enum: ['camera', 'lens'] },
                gearbook_id: { type: 'string', pattern: '^[0-9a-f]{16}$' },
                via: { enum: [...ALIAS_VIA] },
                market: { enum: [...MARKETS] },
            },
        },
        redirect: {
            type: 'object',
            required: ['from_id', 'from_name', 'gearbook_kind', 'to_id', 'to_name'],
            additionalProperties: false,
            properties: {
                from_id: { type: 'string', pattern: '^[0-9a-f]{16}$' },
                from_name: { type: 'string', minLength: 1 },
                gearbook_kind: { enum: ['camera', 'lens'] },
                to_id: { type: 'string', pattern: '^[0-9a-f]{16}$' },
                to_name: { type: 'string', minLength: 1 },
            },
        },
    },
};
const HEX16 = /^[0-9a-f]{16}$/;
const isStr = (v) => typeof v === 'string' && v.trim().length > 0;
/**
 * Check a whole asset. Structural rules AND the cross-file invariants that are
 * the actual reason this exists — a row can be individually well-formed and
 * still be part of a broken asset.
 */
export function validateAsset(input) {
    const issues = [];
    const add = (file, line, code, message) => issues.push({ file, line, code, message });
    const ids = new Map(); // `${kind}:${id}` -> name
    const names = new Set();
    for (const [file, rows, kind] of [
        ['cameras', input.cameras, 'camera'],
        ['lenses', input.lenses, 'lens'],
    ]) {
        rows.forEach((raw, i) => {
            const line = i + 1;
            const r = raw;
            if (!r || typeof r !== 'object')
                return add(file, line, 'row.not-object', 'row is not an object');
            if (!isStr(r.id) || !HEX16.test(r.id))
                add(file, line, 'id.shape', `id must be 16 hex chars, got ${JSON.stringify(r.id)}`);
            if (!isStr(r.name))
                add(file, line, 'name.missing', 'name is required');
            // The whole point of shipping it on every row: a consumer must never need
            // a fallback. An absent one here is a promise quietly broken.
            if (!isStr(r.recommended_name))
                add(file, line, 'recommended_name.missing', `recommended_name is required on every record (${String(r.name)})`);
            if (!CONFIDENCE.includes(r.confidence))
                add(file, line, 'confidence.enum', `confidence must be one of ${CONFIDENCE.join('|')}`);
            if (!r.data || typeof r.data !== 'object')
                add(file, line, 'data.missing', 'data object is required');
            if (isStr(r.id)) {
                const key = `${kind}:${r.id}`;
                if (ids.has(key))
                    add(file, line, 'id.duplicate', `duplicate id ${r.id}`);
                ids.set(key, String(r.name));
            }
            // `name` is the import UNIQUE key — a collision silently drops a record
            // on import rather than failing, which is the worst possible failure.
            if (isStr(r.name)) {
                const key = `${kind}:${String(r.name).toLowerCase()}`;
                if (names.has(key))
                    add(file, line, 'name.duplicate', `duplicate name ${r.name}`);
                names.add(key);
            }
            const mn = r.data?.market_names;
            if (mn !== undefined) {
                if (!Array.isArray(mn) || mn.length < 2) {
                    add(file, line, 'market_names.shape', 'market_names must list 2+ names or be absent');
                }
                else {
                    const primaries = mn.filter((m) => m?.primary);
                    if (primaries.length !== 1)
                        add(file, line, 'market_names.primary', `expected exactly 1 primary, got ${primaries.length}`);
                    else if (primaries[0].name !== r.name) {
                        add(file, line, 'market_names.primary-mismatch', `primary market name must equal the record name (${r.name})`);
                    }
                    for (const m of mn) {
                        if (!isStr(m?.name))
                            add(file, line, 'market_names.name', 'market entry missing name');
                        if (!MARKETS.includes(m?.market))
                            add(file, line, 'market_names.market', `unknown market ${JSON.stringify(m?.market)}`);
                    }
                }
            }
        });
    }
    // ── aliases ───────────────────────────────────────────────────────────────
    const aliasesByRecord = new Map();
    input.aliases.forEach((raw, i) => {
        const line = i + 1;
        const a = raw;
        if (!a || typeof a !== 'object')
            return add('aliases', line, 'row.not-object', 'row is not an object');
        if (!isStr(a.alias))
            add('aliases', line, 'alias.missing', 'alias is required');
        if (a.gearbook_kind !== 'camera' && a.gearbook_kind !== 'lens')
            add('aliases', line, 'kind.enum', 'gearbook_kind must be camera|lens');
        // v1 renamed this from `gearbook_slug`; catch a stale producer loudly
        if ('gearbook_slug' in a)
            add('aliases', line, 'alias.legacy-slug', 'gearbook_slug was renamed to gearbook_id in contract v1');
        if (!isStr(a.gearbook_id) || !HEX16.test(a.gearbook_id))
            add('aliases', line, 'alias.id', 'gearbook_id must be 16 hex chars');
        if (!ALIAS_VIA.includes(a.via))
            add('aliases', line, 'alias.via', `via must be one of ${ALIAS_VIA.join('|')}`);
        if (a.market !== undefined && !MARKETS.includes(a.market))
            add('aliases', line, 'alias.market', `unknown market ${JSON.stringify(a.market)}`);
        // a market-tagged alias that is not a market alias is a mislabel
        if (a.market !== undefined && a.via !== 'market')
            add('aliases', line, 'alias.market-via', `market tag on a via=${String(a.via)} alias`);
        const key = `${String(a.gearbook_kind)}:${String(a.gearbook_id)}`;
        if (isStr(a.gearbook_id) && !ids.has(key))
            add('aliases', line, 'alias.orphan', `alias "${String(a.alias)}" points at no record`);
        if (!aliasesByRecord.has(key))
            aliasesByRecord.set(key, new Set());
        aliasesByRecord.get(key).add(String(a.alias).toLowerCase());
    });
    // Every market name must be reachable by typing it. A market_names entry with
    // no alias row is a name we claim the camera has and cannot then find — the
    // exact failure the cross-market work existed to remove.
    for (const [file, rows, kind] of [
        ['cameras', input.cameras, 'camera'],
        ['lenses', input.lenses, 'lens'],
    ]) {
        rows.forEach((raw, i) => {
            const r = raw;
            for (const m of r?.data?.market_names ?? []) {
                if (!aliasesByRecord.get(`${kind}:${r.id}`)?.has(m.name.toLowerCase())) {
                    add(file, i + 1, 'market_name.unreachable', `market name "${m.name}" has no alias row`);
                }
            }
        });
    }
    // ── redirects ─────────────────────────────────────────────────────────────
    for (const [i, raw] of (input.redirects ?? []).entries()) {
        const line = i + 1;
        const r = raw;
        if (!r || typeof r !== 'object') {
            add('redirects', line, 'row.not-object', 'row is not an object');
            continue;
        }
        for (const f of ['from_id', 'from_name', 'to_id', 'to_name']) {
            if (!isStr(r[f]))
                add('redirects', line, 'redirect.field', `${f} is required`);
        }
        if (r.gearbook_kind !== 'camera' && r.gearbook_kind !== 'lens')
            add('redirects', line, 'redirect.kind', 'gearbook_kind must be camera|lens');
        if (r.from_id === r.to_id)
            add('redirects', line, 'redirect.self', `${String(r.from_name)} redirects to itself`);
        // A redirect exists so a stored id keeps resolving. One pointing nowhere is
        // worse than none: the consumer follows it and lands on nothing.
        if (!ids.has(`${String(r.gearbook_kind)}:${String(r.to_id)}`)) {
            add('redirects', line, 'redirect.dangling', `${String(r.from_name)} -> ${String(r.to_name)}: target is not in the asset`);
        }
        if (ids.has(`${String(r.gearbook_kind)}:${String(r.from_id)}`)) {
            add('redirects', line, 'redirect.live-source', `${String(r.from_name)} is redirected yet still a live record`);
        }
    }
    return {
        ok: issues.length === 0,
        contract: ASSET_CONTRACT,
        counts: {
            cameras: input.cameras.length,
            lenses: input.lenses.length,
            aliases: input.aliases.length,
            redirects: (input.redirects ?? []).length,
        },
        issues,
    };
}
/** Render a result for a terminal — used by the forge gate and by CI. */
export function formatValidation(r, label = 'gearbook asset') {
    const counts = Object.entries(r.counts).map(([k, v]) => `${k}:${v}`).join('  ');
    if (r.ok)
        return `✓ ${label} satisfies contract v${r.contract}  (${counts})`;
    const byCode = new Map();
    for (const i of r.issues)
        byCode.set(i.code, (byCode.get(i.code) ?? 0) + 1);
    const lines = [
        `✗ ${label} FAILS contract v${r.contract} — ${r.issues.length} issue(s)  (${counts})`,
        ...[...byCode.entries()].sort((a, b) => b[1] - a[1]).map(([c, n]) => `    ${String(n).padStart(6)}  ${c}`),
        '',
        ...r.issues.slice(0, 15).map((i) => `    ${i.file}:${i.line}  ${i.code}  ${i.message}`),
    ];
    if (r.issues.length > 15)
        lines.push(`    … and ${r.issues.length - 15} more`);
    return lines.join('\n');
}
//# sourceMappingURL=schema.js.map