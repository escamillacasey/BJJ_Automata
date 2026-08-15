import { useEffect, useMemo, useState, type FormEvent } from 'react'
import type { BeltRank, GameGraph, PositionCategory, TransitionKind } from '../lib/types'
import {
  BELT_OPTIONS,
  CATEGORY_OPTIONS,
  KIND_OPTIONS,
  addMoveToGraph,
  savePersonalGraph,
} from '../lib/gameEdits'

export type MoveDraft = {
  label: string
  from: string
  to: string
  kind: TransitionKind
  proficiency: BeltRank | ''
  notes: string
  createNewTo: boolean
  newToLabel: string
  newToCategory: PositionCategory
}

const emptyDraft = (from = ''): MoveDraft => ({
  label: '',
  from,
  to: '',
  kind: 'transition',
  proficiency: '',
  notes: '',
  createNewTo: false,
  newToLabel: '',
  newToCategory: 'transition',
})

type Props = {
  open: boolean
  onClose: () => void
  personal: GameGraph
  onSaved: (next: GameGraph) => void
  /** Prefill when claiming a gap or starting from a selected node */
  draftSeed?: Partial<MoveDraft> | null
}

export function AddMovePanel({
  open,
  onClose,
  personal,
  onSaved,
  draftSeed,
}: Props) {
  const [draft, setDraft] = useState<MoveDraft>(emptyDraft())
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [ok, setOk] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setError(null)
    setOk(null)
    setDraft({
      ...emptyDraft(draftSeed?.from ?? ''),
      ...draftSeed,
    })
  }, [open, draftSeed])

  const positions = useMemo(
    () =>
      [...personal.positions]
        .filter((p) => !p.referenceOnly)
        .sort((a, b) => a.label.localeCompare(b.label)),
    [personal.positions],
  )

  if (!open) return null

  const set = <K extends keyof MoveDraft>(key: K, value: MoveDraft[K]) => {
    setDraft((d) => ({ ...d, [key]: value }))
    setError(null)
    setOk(null)
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setOk(null)
    try {
      const next = addMoveToGraph(personal, {
        label: draft.label,
        from: draft.from,
        to: draft.createNewTo ? '' : draft.to,
        kind: draft.kind,
        proficiency: draft.proficiency || undefined,
        notes: draft.notes,
        newToLabel: draft.createNewTo ? draft.newToLabel : undefined,
        newToCategory: draft.createNewTo ? draft.newToCategory : undefined,
      })
      await savePersonalGraph(next)
      onSaved(next)
      setOk(`Saved “${draft.label.trim()}” to your game plan.`)
      setDraft(emptyDraft(draft.from))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save move')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="add-move-backdrop" role="presentation" onClick={onClose}>
      <div
        className="add-move"
        role="dialog"
        aria-labelledby="add-move-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="add-move__header">
          <div>
            <p className="eyebrow">Update game plan</p>
            <h2 id="add-move-title">Add a move</h2>
            <p>
              From position → technique → to position. Saves into your personal
              graph immediately.
            </p>
          </div>
          <button type="button" className="ghost" onClick={onClose}>
            Close
          </button>
        </header>

        <form className="add-move__form" onSubmit={onSubmit}>
          <label>
            <span>Move name</span>
            <input
              required
              autoFocus
              placeholder="e.g. Guard Pull"
              value={draft.label}
              onChange={(e) => set('label', e.target.value)}
            />
          </label>

          <div className="add-move__row">
            <label>
              <span>From</span>
              <select
                required
                value={draft.from}
                onChange={(e) => set('from', e.target.value)}
              >
                <option value="">Select position…</option>
                {positions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>Kind</span>
              <select
                value={draft.kind}
                onChange={(e) => set('kind', e.target.value as TransitionKind)}
              >
                {KIND_OPTIONS.map((k) => (
                  <option key={k.value} value={k.value}>
                    {k.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="add-move__check">
            <input
              type="checkbox"
              checked={draft.createNewTo}
              onChange={(e) => set('createNewTo', e.target.checked)}
            />
            Destination is a new position
          </label>

          {draft.createNewTo ? (
            <div className="add-move__row">
              <label>
                <span>New position name</span>
                <input
                  required
                  placeholder="e.g. Seated Guard"
                  value={draft.newToLabel}
                  onChange={(e) => set('newToLabel', e.target.value)}
                />
              </label>
              <label>
                <span>Category</span>
                <select
                  value={draft.newToCategory}
                  onChange={(e) =>
                    set('newToCategory', e.target.value as PositionCategory)
                  }
                >
                  {CATEGORY_OPTIONS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ) : (
            <label>
              <span>To</span>
              <select
                required
                value={draft.to}
                onChange={(e) => set('to', e.target.value)}
              >
                <option value="">Select position…</option>
                {positions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
          )}

          <div className="add-move__row">
            <label>
              <span>Your level (optional)</span>
              <select
                value={draft.proficiency}
                onChange={(e) =>
                  set('proficiency', e.target.value as BeltRank | '')
                }
              >
                <option value="">Unrated</option>
                {BELT_OPTIONS.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Notes (optional)</span>
              <input
                placeholder="Cue, grip, common mistake…"
                value={draft.notes}
                onChange={(e) => set('notes', e.target.value)}
              />
            </label>
          </div>

          {error && <p className="add-move__error">{error}</p>}
          {ok && <p className="add-move__ok">{ok}</p>}

          <div className="add-move__actions">
            <button type="button" className="ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="cta" disabled={saving}>
              {saving ? 'Saving…' : 'Save move'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
