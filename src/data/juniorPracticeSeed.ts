import { loadCoachLog, saveCoachLog, type JuniorGroupId } from '../lib/coachStore'

const SEED_KEY = 'bjj-automata-junior-practice-seed-v1'

const SEED: Array<{ date: string; groups: Partial<Record<JuniorGroupId, string>> }> = [
  {
    date: '2026-11-02',
    groups: {
      k2: 'Stance. Warmups and the flow of practice, then sumo wrestling drills and line drills (bear crawls). Finished with "get off your back" drills.',
      'grades-3-8':
        'Stance and sprawl. Warmups and the flow of practice, then stance and sprawls. Focus on sprawls moving backwards.',
      advanced:
        'Stance and sprawl. Warmups and the flow of practice, then sprawls moving backwards. Sprawl and spin using the front headlock, with lots of spin drills.',
    },
  },
  {
    date: '2026-11-03',
    groups: {
      advanced:
        'Front headlock technical practice. Lots of live, with sprawl and spin for the takedowns.',
    },
  },
  {
    date: '2026-11-05',
    groups: {
      k2: 'Standups and sprawls. Touched on locking the circle and a quick snatch single. Introduced lock horns from neutral.',
      'grades-3-8':
        'Lock horns from neutral into a snapdown. Push-pull on the leg. Moving your partner around from neutral.',
      advanced:
        'Lock horns from neutral into a snapdown. Push-pull on the leg. Moving your partner around from neutral.',
    },
  },
  {
    date: '2026-11-09',
    groups: {
      k2: 'Single legs. Start from the leg.',
      'grades-3-8':
        'Single legs. Great physicality. Start at the leg and work back. Emphasized the sprawl once they got comfortable. Lock horns into a drop level and a shot to the leg. Sweep single was effective. Standups with partners. Basic mat work.',
      advanced:
        'Single legs. Great physicality. Start at the leg and work back. Emphasized the sprawl once they got comfortable. Lock horns into a drop level and a shot to the leg. Sweep single was effective. Standups with partners. Basic mat work.',
    },
  },
]

/** Add the first junior practices once. A later delete stays deleted. */
export function seedJuniorPractices(): boolean {
  try {
    if (localStorage.getItem(SEED_KEY)) return false
  } catch {
    return false
  }

  const log = loadCoachLog()
  const practices = [...log.practices]
  let added = false
  for (const item of SEED) {
    if (practices.some((practice) => practice.date === item.date)) continue
    practices.push({
      id: crypto.randomUUID(),
      date: item.date,
      groups: { ...item.groups },
      createdAt: `${item.date}T12:00:00.000Z`,
    })
    added = true
  }

  if (added) saveCoachLog({ ...log, practices })
  try {
    localStorage.setItem(SEED_KEY, '1')
  } catch {
    return added
  }
  return added
}
