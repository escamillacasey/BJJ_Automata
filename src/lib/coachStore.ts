const STORAGE_KEY = 'bjj-automata-coach-log-v1'
const DB_NAME = 'bjj-automata-coach-media'
const DB_STORE = 'blobs'

export const MAX_VIDEO_BYTES = 80 * 1024 * 1024
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024

export const SQUADS = [
  {
    id: 'navy-bjj',
    name: 'Navy Jiu-Jitsu',
    levelLabel: 'Belt',
    levelPlaceholder: 'Blue, purple…',
    focusPlaceholder: 'e.g. frames in half guard, stop accepting the underhook',
    maintainPlaceholder: 'e.g. pace on top, finished when the elbow left the mat',
    resultPlaceholder: 'e.g. silver, lost the final by advantage',
  },
  {
    id: 'navy-juniors',
    name: 'Navy Junior Wrestlers',
    levelLabel: 'Age group',
    levelPlaceholder: '12U, 14U…',
    focusPlaceholder: 'e.g. level change on the shot, finish the single to the mat',
    maintainPlaceholder: 'e.g. hand fighting, stayed heavy on the cross-body ride',
    resultPlaceholder: 'e.g. 3rd, pin then a 6-2 loss in the semis',
  },
] as const

export type SquadId = (typeof SQUADS)[number]['id']
export type EntryKind = 'competition' | 'practice'

export type Athlete = {
  id: string
  squadId: SquadId
  name: string
  level: string
  weight: string
  /** Academy or club, when the athlete was loaded from event results. */
  club?: string
}

export type CoachEntry = {
  id: string
  athleteId: string
  date: string
  kind: EntryKind
  eventName: string
  result: string
  /** Match record for a competition, such as 2-0. */
  record?: string
  focus: string
  maintain: string
  videoUrl: string
  hasVideoFile: boolean
  videoFileName: string
  hasNoteImage: boolean
  noteImageName: string
  createdAt: string
  /** Stable id for a loaded event, such as smoothcomp:31977. */
  sourceId?: string
  sourceUrl?: string
}

export type CoachLogData = {
  athletes: Athlete[]
  entries: CoachEntry[]
}

export function squadById(id: SquadId) {
  return SQUADS.find((squad) => squad.id === id) ?? SQUADS[0]
}

export function todayISO(): string {
  const d = new Date()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${month}-${day}`
}

export function formatEntryDate(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number)
  if (!year || !month || !day) return iso
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export function emptyLog(): CoachLogData {
  return { athletes: [], entries: [] }
}

export function videoKey(entryId: string) {
  return `video:${entryId}`
}

export function pageKey(entryId: string) {
  return `page:${entryId}`
}

export function safeHttpUrl(value: string): string | null {
  try {
    const url = new URL(value.trim())
    if (url.protocol === 'http:' || url.protocol === 'https:') return url.toString()
    return null
  } catch {
    return null
  }
}

function byNewest(a: CoachEntry, b: CoachEntry): number {
  if (a.date !== b.date) return a.date < b.date ? 1 : -1
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? 1 : -1
  return 0
}

export function entriesFor(entries: CoachEntry[], athleteId: string): CoachEntry[] {
  return entries.filter((entry) => entry.athleteId === athleteId).sort(byNewest)
}

export function latestEntry(
  entries: CoachEntry[],
  athleteId: string,
): CoachEntry | undefined {
  return entriesFor(entries, athleteId)[0]
}

export type FocusShift = 'same' | 'shifted'

export function focusShift(
  current: CoachEntry,
  older: CoachEntry | undefined,
): FocusShift | null {
  if (!older) return null
  const next = current.focus.trim().toLowerCase()
  const prev = older.focus.trim().toLowerCase()
  if (!next || !prev) return null
  return next === prev ? 'same' : 'shifted'
}

export function focusPreview(entry: CoachEntry | undefined): string {
  if (!entry) return 'No notes yet'
  if (entry.focus.trim()) return entry.focus.trim()
  if (entry.hasNoteImage) return 'Handwritten page attached'
  if (entry.maintain.trim()) return `Maintain: ${entry.maintain.trim()}`
  if (entry.result.trim()) return entry.result.trim().split('\n')[0]
  return 'Note logged'
}

export function loadCoachLog(): CoachLogData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return emptyLog()
    return parseCoachLog(JSON.parse(raw)) ?? emptyLog()
  } catch {
    return emptyLog()
  }
}

export function saveCoachLog(data: CoachLogData) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, ...data }))
}

export function serializeCoachLog(data: CoachLogData): string {
  return JSON.stringify({ version: 1, ...data }, null, 2)
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function isSquadId(value: unknown): value is SquadId {
  return value === 'navy-bjj' || value === 'navy-juniors'
}

function isEntryKind(value: unknown): value is EntryKind {
  return value === 'competition' || value === 'practice'
}

export function parseCoachLog(raw: unknown): CoachLogData | null {
  const record = asRecord(raw)
  if (!record) return null
  if (!Array.isArray(record.athletes) || !Array.isArray(record.entries)) return null

  const athletes: Athlete[] = []
  const seenAthletes = new Set<string>()
  for (const item of record.athletes) {
    const row = asRecord(item)
    if (!row || typeof row.id !== 'string' || !isSquadId(row.squadId)) return null
    const name = asString(row.name).trim()
    if (!name || seenAthletes.has(row.id)) continue
    seenAthletes.add(row.id)
    const club = asString(row.club).trim()
    athletes.push({
      id: row.id,
      squadId: row.squadId,
      name,
      level: asString(row.level).trim(),
      weight: asString(row.weight).trim(),
      ...(club ? { club } : {}),
    })
  }

  const entries: CoachEntry[] = []
  const seenEntries = new Set<string>()
  for (const item of record.entries) {
    const row = asRecord(item)
    if (!row || typeof row.id !== 'string' || typeof row.athleteId !== 'string') {
      return null
    }
    if (!seenAthletes.has(row.athleteId) || seenEntries.has(row.id)) continue
    if (!isEntryKind(row.kind)) return null
    const date = asString(row.date)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
    seenEntries.add(row.id)
    entries.push({
      id: row.id,
      athleteId: row.athleteId,
      date,
      kind: row.kind,
      eventName: asString(row.eventName).trim(),
      result: asString(row.result).trim(),
      ...(asString(row.record).trim() ? { record: asString(row.record).trim() } : {}),
      focus: asString(row.focus).trim(),
      maintain: asString(row.maintain).trim(),
      videoUrl: asString(row.videoUrl).trim(),
      hasVideoFile: row.hasVideoFile === true,
      videoFileName: asString(row.videoFileName),
      hasNoteImage: row.hasNoteImage === true,
      noteImageName: asString(row.noteImageName),
      createdAt: asString(row.createdAt) || new Date(0).toISOString(),
      ...(asString(row.sourceId).trim()
        ? { sourceId: asString(row.sourceId).trim() }
        : {}),
      ...(asString(row.sourceUrl).trim()
        ? { sourceUrl: asString(row.sourceUrl).trim() }
        : {}),
    })
  }

  return { athletes, entries }
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Could not open media storage'))
  })
}

function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        let settled = false
        const fail = (error: unknown) => {
          if (settled) return
          settled = true
          db.close()
          reject(error instanceof Error ? error : new Error('Media storage failed'))
        }
        const tx = db.transaction(DB_STORE, mode)
        const request = run(tx.objectStore(DB_STORE))
        let result: T
        request.onsuccess = () => {
          result = request.result
        }
        tx.oncomplete = () => {
          if (settled) return
          settled = true
          db.close()
          resolve(result)
        }
        tx.onerror = () => fail(tx.error ?? new Error('Media storage failed'))
        tx.onabort = () => fail(tx.error ?? request.error ?? new Error('Media storage aborted'))
      }),
  )
}

export function putMedia(key: string, blob: Blob): Promise<void> {
  return withStore('readwrite', (store) => store.put(blob, key)).then(() => undefined)
}

export function getMedia(key: string): Promise<Blob | null> {
  return withStore('readonly', (store) => store.get(key)).then(
    (value) => (value instanceof Blob ? value : null),
  )
}

export function deleteMedia(key: string): Promise<void> {
  return withStore('readwrite', (store) => store.delete(key)).then(() => undefined)
}

export async function deleteEntryMedia(entryId: string) {
  await deleteMedia(videoKey(entryId))
  await deleteMedia(pageKey(entryId))
}
