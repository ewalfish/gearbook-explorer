#!/usr/bin/env tsx
/**
 * `npm run validate` — check the asset in this checkout against the contract.
 *
 * Same schema the forge gates on before publishing and a consumer runs against
 * its installed dependency. Having it as a script here means "is this asset
 * good?" is answerable without a test runner, which is what you want when a
 * regeneration has just landed and you are staring at a diff.
 */
import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { validateAsset, formatValidation, parseJsonl } from '../src/engine/index'

const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'gearbook')
const read = (f: string) => (existsSync(join(dir, f)) ? parseJsonl<unknown>(readFileSync(join(dir, f), 'utf8')) : [])

const result = validateAsset({
  cameras: read('cameras.jsonl'),
  lenses: read('lenses.jsonl'),
  aliases: read('aliases.jsonl'),
  redirects: read('redirects.jsonl'),
})
console.log(formatValidation(result, 'data/gearbook'))
process.exit(result.ok ? 0 : 1)
