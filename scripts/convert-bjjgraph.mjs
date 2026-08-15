#!/usr/bin/env node
/**
 * Convert bjjgraph.org graph.json into a slim reference layer for BJJ Automata.
 *
 * Reads:  src/data/raw/graph.json.gz  (or GRAPH_JSON path)
 * Writes: src/data/bjjgraph-reference.json
 *         src/data/bjjgraph-coverage.json
 *
 * The reference layer is a 1-hop neighborhood around positions mapped from
 * the personal graph — large enough to reveal missing flows, small enough
 * to render.
 */
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')

const RAW =
  process.env.GRAPH_JSON ||
  path.join(root, 'src/data/raw/graph.json.gz')
const PERSONAL = path.join(root, 'src/data/personal-graph.json')
const OUT_REF = path.join(root, 'src/data/bjjgraph-reference.json')
const OUT_COV = path.join(root, 'src/data/bjjgraph-coverage.json')

/** personal id → preferred bjjgraph position id(s) */
const PERSONAL_TO_BJJ = {
  standing: ['standing-position'],
  collar_tie: ['clinch'],
  russian_tie: ['russian-cowboy'],
  over_under: ['clinch'],
  front_headlock: ['front-headlock/top'],
  closed_guard_bottom: ['closed-guard/bottom'],
  closed_guard_top: ['closed-guard/top'],
  open_guard_bottom: ['open-guard/bottom'],
  open_guard_top: ['open-guard/top'],
  half_guard_bottom: ['half-guard/bottom'],
  half_guard_top: ['half-guard/top'],
  deep_half_bottom: ['deep-half-guard/bottom'],
  butterfly_bottom: ['butterfly-guard/bottom'],
  shin_to_shin: ['shin-to-shin-guard/bottom'],
  dogfight: ['dogfight-position'],
  side_control_top: ['side-control/top'],
  side_control_bottom: ['side-control/bottom'],
  knee_on_belly: ['knee-on-belly/top'],
  mount_top: ['mount/top'],
  high_mount: ['high-mount/top'],
  low_mount: ['3-4-mount/top'],
  gift_wrap: ['gift-wrap/top'],
  back_control: ['back-control/top'],
  crucifix: ['crucifix/top'],
  submitted: ['game-over'],
}

function loadGraph(filePath) {
  const buf = fs.readFileSync(filePath)
  const json = filePath.endsWith('.gz')
    ? zlib.gunzipSync(buf).toString('utf8')
    : buf.toString('utf8')
  return JSON.parse(json)
}

function hubOf(id) {
  return id.includes('/') ? id.split('/')[0] : id
}

function roleOf(id) {
  if (id.endsWith('/top')) return 'top'
  if (id.endsWith('/bottom')) return 'bottom'
  return 'either'
}

function mapCategory(positionType, id) {
  const h = hubOf(id)
  if (id === 'game-over' || positionType === 'Terminal') return 'submission'
  if (/standing|clinch|russian|front-head|collar/.test(h)) {
    return /standing/.test(h) ? 'standing' : 'clinch'
  }
  if (/guard|butterfly|shin|dogfight|de-la-riva|x-guard|lasso/.test(h)) {
    return 'guard'
  }
  if (/back|crucifix/.test(h)) return 'back'
  if (/mount|side-control|knee-on|north-south|kesa|gift-wrap/.test(h)) {
    return 'pin'
  }
  if (positionType?.includes('Defensive')) return 'guard'
  if (positionType?.includes('Offensive')) return 'pin'
  return 'transition'
}

function kindFromName(name, isSubmission) {
  if (isSubmission) return 'submission'
  const n = (name || '').toLowerCase()
  if (/sweep/.test(n)) return 'sweep'
  if (/pass/.test(n)) return 'pass'
  if (/escape|retention|recover/.test(n)) return 'escape'
  if (/back take|back-take|to back/.test(n)) return 'back_take'
  if (/takedown|single|double|snap|throw|fireman|high crotch/.test(n))
    return 'takedown'
  return 'transition'
}

function resolveFromId(t, positions) {
  const role = t.startingPositionRole || t.fromRole
  const base = t.startingPosition || t.fromPositionId
  if (!base) return null
  if (base.includes('/')) return positions[base] ? base : hubOf(base)
  if (role === 'top' || role === 'bottom') {
    const keyed = `${base}/${role}`
    if (positions[keyed]) return keyed
  }
  if (positions[base]) return base
  // prefer top for offensive techniques when hub-only
  if (positions[`${base}/top`]) return `${base}/top`
  if (positions[`${base}/bottom`]) return `${base}/bottom`
  return base
}

function successTo(t) {
  const success = (t.outcomes || []).find((o) => o.result === 'success')
  return success?.to || t.endingPosition || null
}

function slugId(prefix, raw) {
  return `${prefix}:${String(raw).replace(/[^a-z0-9/_-]+/gi, '-').toLowerCase()}`
}

function build() {
  if (!fs.existsSync(RAW)) {
    console.error(`Missing ${RAW}`)
    console.error('Download with:')
    console.error(
      '  curl -sL https://github.com/diogoseca/bjjgraph/releases/latest/download/graph.json.gz -o src/data/raw/graph.json.gz',
    )
    process.exit(1)
  }

  const bjj = loadGraph(RAW)
  const personal = JSON.parse(fs.readFileSync(PERSONAL, 'utf8'))
  const positions = bjj.positions

  /** bjj id → personal id */
  const bjjToPersonal = {}
  /** personal id → primary bjj id */
  const personalToBjj = {}
  const seedBjjIds = new Set()

  for (const [pid, candidates] of Object.entries(PERSONAL_TO_BJJ)) {
    for (const cid of candidates) {
      const resolved =
        positions[cid] ? cid
        : positions[`${cid}/top`] ? `${cid}/top`
        : positions[`${hubOf(cid)}`] ? hubOf(cid)
        : null
      if (!resolved) {
        console.warn(`No bjjgraph match for ${pid} → ${cid}`)
        continue
      }
      if (!personalToBjj[pid]) personalToBjj[pid] = resolved
      bjjToPersonal[resolved] = pid
      bjjToPersonal[hubOf(resolved)] = pid
      seedBjjIds.add(resolved)
      seedBjjIds.add(hubOf(resolved))
      // also seed role siblings of hub so we catch edges
      const hub = hubOf(resolved)
      for (const suffix of ['', '/top', '/bottom']) {
        const id = suffix ? `${hub}${suffix}` : hub
        if (positions[id]) seedBjjIds.add(id)
      }
    }
  }

  function fromIsSeed(fromId) {
    if (!fromId) return false
    return seedBjjIds.has(fromId) || seedBjjIds.has(hubOf(fromId))
  }

  /** Collect edges from seed positions */
  const edgeCandidates = []

  for (const [tid, t] of Object.entries(bjj.transitions)) {
    const from = resolveFromId(t, positions)
    if (!fromIsSeed(from)) continue
    const to = successTo(t)
    if (!to || !positions[to] && to !== 'game-over' && !positions[hubOf(to)]) continue
    const toId = positions[to] ? to : positions[`${to}/top`] ? `${to}/top` : to
    edgeCandidates.push({
      id: slugId('ref-t', tid),
      label: t.name,
      from,
      to: toId,
      kind: kindFromName(t.name, false),
      successRate: t.successRate,
      sourceTechniqueId: tid,
      type: 'transition',
    })
  }

  for (const [sid, s] of Object.entries(bjj.submissions)) {
    const bases = s.fromPositions?.length
      ? s.fromPositions
      : s.fromPositionId
        ? [s.fromPositionId]
        : []
    for (const base of bases) {
      // expand to role variants present in seeds
      const variants = [base, `${base}/top`, `${base}/bottom`].filter((id) =>
        fromIsSeed(id),
      )
      const use = variants.length ? variants : fromIsSeed(base) ? [base] : []
      for (const from of use) {
        const to =
          (s.outcomes || []).find((o) => o.result === 'success')?.to ||
          'game-over'
        edgeCandidates.push({
          id: slugId('ref-s', `${sid}__${from}`),
          label: s.name,
          from,
          to,
          kind: 'submission',
          successRate: s.successRate,
          sourceTechniqueId: sid,
          type: 'submission',
        })
      }
    }
  }

  // Rank edges: keep top K per from-hub by successRate
  const PER_FROM = 14
  const byFrom = new Map()
  for (const e of edgeCandidates) {
    const key = hubOf(e.from)
    if (!byFrom.has(key)) byFrom.set(key, [])
    byFrom.get(key).push(e)
  }
  const keptEdges = []
  for (const list of byFrom.values()) {
    list.sort((a, b) => (b.successRate ?? 0) - (a.successRate ?? 0))
    keptEdges.push(...list.slice(0, PER_FROM))
  }

  const keepPos = new Set(seedBjjIds)
  for (const e of keptEdges) {
    keepPos.add(e.from)
    keepPos.add(e.to)
    keepPos.add(hubOf(e.from))
    keepPos.add(hubOf(e.to))
  }
  // Always include game-over if any submission
  if (keptEdges.some((e) => e.kind === 'submission')) keepPos.add('game-over')

  const refPositions = []
  for (const id of keepPos) {
    const p = positions[id]
    if (!p && id !== 'game-over') continue
    const personalId = bjjToPersonal[id] || bjjToPersonal[hubOf(id)]
    refPositions.push({
      id: `bjj:${id}`,
      label: p?.name || (id === 'game-over' ? 'Game Over (Submission)' : id),
      category: mapCategory(p?.positionType, id),
      role: roleOf(id),
      referenceOnly: true,
      bjjId: id,
      personalAlias: personalId || null,
      notes: p
        ? `bjjgraph ${p.positionType || ''} · points ${p.pointValue ?? '—'} · risk ${p.riskLevel || '—'}`.trim()
        : 'Terminal accepting state (bjjgraph).',
      sources: [
        'https://github.com/diogoseca/bjjgraph',
        `bjjgraph:${id}`,
      ],
      pointValue: p?.pointValue,
      positionType: p?.positionType,
    })
  }

  /** Map edge endpoints onto personal ids when aliased, else bjj: ids */
  function endpoint(bjjPosId) {
    const alias = bjjToPersonal[bjjPosId] || bjjToPersonal[hubOf(bjjPosId)]
    if (alias) return alias
    return `bjj:${bjjPosId}`
  }

  const refTransitions = keptEdges
    .filter((e) => keepPos.has(e.from) && (keepPos.has(e.to) || e.to === 'game-over'))
    .map((e) => ({
      id: e.id,
      label: e.label,
      from: endpoint(e.from),
      to: endpoint(e.to === 'game-over' ? 'game-over' : e.to),
      kind: e.kind,
      referenceOnly: true,
      successRate: e.successRate,
      notes: `bjjgraph reference · success ${e.successRate ?? '?'}%`,
      sources: [
        'https://github.com/diogoseca/bjjgraph',
        `bjjgraph:${e.sourceTechniqueId}`,
      ],
      bjjFrom: e.from,
      bjjTo: e.to,
      sourceTechniqueId: e.sourceTechniqueId,
    }))

  // Coverage: reference edges leaving personal-mapped positions that personal lacks
  const personalEdgeKeys = new Set(
    personal.transitions.map(
      (t) => `${t.from}→${t.to}::${t.label.toLowerCase()}`,
    ),
  )
  const personalPairs = new Set(
    personal.transitions.map((t) => `${t.from}→${t.to}`),
  )
  const personalFromKinds = new Map()
  for (const t of personal.transitions) {
    const k = `${t.from}::${t.kind}`
    personalFromKinds.set(k, (personalFromKinds.get(k) || 0) + 1)
  }

  const gaps = []
  for (const e of refTransitions) {
    // only gaps from personal nodes
    if (e.from.startsWith('bjj:')) continue
    const pair = `${e.from}→${e.to}`
    const labelKey = `${e.from}→${e.to}::${e.label.toLowerCase()}`
    if (personalEdgeKeys.has(labelKey) || personalPairs.has(pair)) continue
    // also skip if personal already has same kind to same destination
    const hasKind = personal.transitions.some(
      (t) => t.from === e.from && t.to === e.to && t.kind === e.kind,
    )
    if (hasKind) continue
    gaps.push({
      from: e.from,
      to: e.to,
      label: e.label,
      kind: e.kind,
      successRate: e.successRate ?? null,
      sourceTechniqueId: e.sourceTechniqueId,
      priority: Math.round((e.successRate ?? 40) / 10),
      reason: `bjjgraph lists “${e.label}” from this position; your personal graph has no matching flow.`,
    })
  }
  gaps.sort((a, b) => (b.successRate ?? 0) - (a.successRate ?? 0))

  // Deduplicate identical from/label/to triples (role expansion can double-count)
  const seenGaps = new Set()
  const uniqueGaps = []
  for (const g of gaps) {
    const key = `${g.from}|${g.label}|${g.to}`
    if (seenGaps.has(key)) continue
    seenGaps.add(key)
    uniqueGaps.push(g)
  }

  const reference = {
    meta: {
      title: 'bjjgraph reference neighborhood',
      description:
        '1-hop reference layer around personal positions, converted from bjjgraph graph.json',
      sources: [
        'https://github.com/diogoseca/bjjgraph',
        'https://bjjgraph.org',
        `release:${bjj.meta?.generated || 'unknown'}`,
      ],
      generatedFrom: 'bjjgraph graph.json',
      upstreamMeta: bjj.meta,
      personalToBjj,
      generatedAt: new Date().toISOString(),
      edgeCapPerHub: PER_FROM,
    },
    positions: refPositions,
    transitions: refTransitions,
    journalMentions: [],
  }

  const coverage = {
    generatedAt: new Date().toISOString(),
    mappedPositions: personalToBjj,
    referencePositionCount: refPositions.length,
    referenceTransitionCount: refTransitions.length,
    gapCount: uniqueGaps.length,
    gaps: uniqueGaps.slice(0, 200),
    topGaps: uniqueGaps.slice(0, 40),
  }

  fs.writeFileSync(OUT_REF, JSON.stringify(reference, null, 2))
  fs.writeFileSync(OUT_COV, JSON.stringify(coverage, null, 2))

  console.log('Mapped positions:', Object.keys(personalToBjj).length)
  console.log('Reference positions:', refPositions.length)
  console.log('Reference transitions:', refTransitions.length)
  console.log('Coverage gaps:', uniqueGaps.length)
  console.log('Wrote', path.relative(root, OUT_REF))
  console.log('Wrote', path.relative(root, OUT_COV))
  console.log(
    'Top gaps:\n',
    uniqueGaps
      .slice(0, 12)
      .map((g) => `  ${g.from} → ${g.to}: ${g.label} (${g.successRate}%)`)
      .join('\n'),
  )
}

build()
