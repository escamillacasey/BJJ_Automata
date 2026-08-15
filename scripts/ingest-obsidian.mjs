#!/usr/bin/env node
/**
 * Ingest Obsidian BJJ notes into journal mention stubs + technique frequency.
 *
 * Usage:
 *   node scripts/ingest-obsidian.mjs
 *   OBSIDIAN_BJJ_PATH="/path/to/BJJ/BJJ" node scripts/ingest-obsidian.mjs
 *
 * Writes: src/data/journal-ingest.json (merge manually into personal-graph.json)
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')

const vault =
  process.env.OBSIDIAN_BJJ_PATH ||
  path.join(
    process.env.HOME || '',
    'Library/Mobile Documents/iCloud~md~obsidian/Documents/BJJ/BJJ',
  )

const journalDir = path.join(vault, 'Journal')
const outPath = path.join(root, 'src/data/journal-ingest.json')

const KEYWORDS = [
  ['russian', 'russian_tie'],
  ['front head', 'front_headlock'],
  ['guillotine', 't_guillotine'],
  ['anaconda', 't_anaconda'],
  ['butterfly', 'butterfly_bottom'],
  ['shin to shin', 'shin_to_shin'],
  ['shin t0 shin', 'shin_to_shin'],
  ['half guard', 'half_guard_bottom'],
  ['deep half', 'deep_half_bottom'],
  ['side control', 'side_control_top'],
  ['side mount', 'side_control_top'],
  ['knee cut', 't_pass_knee_cut'],
  ['over / under', 't_pass_over_under'],
  ['over/under', 't_pass_over_under'],
  ['double over', 't_pass_double_over'],
  ['diaper', 't_pass_diaper'],
  ['back take', 'back_control'],
  ['kimura', 't_cg_kimura'],
  ['armbar', 't_cg_armbar'],
  ['arm bar', 't_cg_armbar'],
  ['north south', 't_sc_north_south'],
  ['darce', 't_hg_darce'],
  ['guard retention', 'open_guard_bottom'],
  ['single leg', 'standing'],
  ['fireman', 't_firemans'],
  ['snap down', 't_snap_down'],
  ['mount', 'mount_top'],
]

function parseSections(text) {
  const sections = { focus: '', improve: '', sustain: '', other: '' }
  const lines = text.split(/\r?\n/)
  let current = 'other'
  for (const line of lines) {
    const h = line.match(/^##\s*(Focus|Improve|Sustain)\s*$/i)
    if (h) {
      current = h[1].toLowerCase()
      continue
    }
    sections[current] += line + '\n'
  }
  return sections
}

function linkIds(text) {
  const lower = text.toLowerCase()
  const positions = new Set()
  const transitions = new Set()
  for (const [needle, id] of KEYWORDS) {
    if (!lower.includes(needle)) continue
    if (id.startsWith('t_')) transitions.add(id)
    else positions.add(id)
  }
  return {
    linkedPositionIds: [...positions],
    linkedTransitionIds: [...transitions],
  }
}

function dateFromFilename(name) {
  const m = name.match(/^(\d{4}-\d{2}-\d{2})/)
  return m ? m[1] : name
}

if (!fs.existsSync(journalDir)) {
  console.error(`Journal folder not found: ${journalDir}`)
  process.exit(1)
}

const files = fs
  .readdirSync(journalDir)
  .filter((f) => f.endsWith('.md'))
  .sort()

const mentions = []
const frequency = {}

for (const file of files) {
  const text = fs.readFileSync(path.join(journalDir, file), 'utf8')
  const sections = parseSections(text)
  const date = dateFromFilename(file)

  for (const section of /** @type {const} */ (['focus', 'improve', 'sustain'])) {
    const body = sections[section].trim()
    if (!body) continue
    const links = linkIds(body)
    if (
      !links.linkedPositionIds.length &&
      !links.linkedTransitionIds.length &&
      body.length < 8
    ) {
      continue
    }
    mentions.push({
      date,
      section,
      text: body.replace(/\s+/g, ' ').slice(0, 280),
      ...links,
      sourceFile: `Journal/${file}`,
    })
    for (const id of [
      ...links.linkedPositionIds,
      ...links.linkedTransitionIds,
    ]) {
      frequency[id] = (frequency[id] || 0) + 1
    }
  }
}

const payload = {
  generatedAt: new Date().toISOString(),
  vault,
  mentionCount: mentions.length,
  frequency,
  journalMentions: mentions,
}

fs.mkdirSync(path.dirname(outPath), { recursive: true })
fs.writeFileSync(outPath, JSON.stringify(payload, null, 2))
console.log(
  `Wrote ${mentions.length} journal mentions → ${path.relative(root, outPath)}`,
)
console.log('Top frequency:', Object.entries(frequency).sort((a, b) => b[1] - a[1]).slice(0, 10))
