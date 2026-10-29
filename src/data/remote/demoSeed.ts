import type { ChecklistItem, RemoteTaskBundle, Task, User } from '@/types/domain';

export const DEMO_USER: User = {
  id: '6f1c2a10-0000-4000-8000-00000000a1e7',
  email: 'alex@flowops.app',
  fullName: 'Alex Morgan',
  role: 'Field Technician',
};

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

type SeedTask = {
  key: string;
  title: string;
  description: string;
  priority: Task['priority'];
  status: Task['status'];
  dueIn: number | null; // ms from now
  completedAgo?: number;
  requiresEvidence?: boolean;
  checklist: [label: string, required: boolean, done?: boolean][];
  notes?: string[];
};

const SEED: SeedTask[] = [
  {
    key: 'hvac',
    title: 'HVAC inspection – Building C rooftop',
    description:
      'Quarterly preventive inspection of rooftop units RTU-1 to RTU-3. Record filter condition and refrigerant pressures, and photograph any corrosion.',
    priority: 'high',
    status: 'in_progress',
    dueIn: 2 * HOUR,
    requiresEvidence: true,
    checklist: [
      ['Lock out / tag out units before opening panels', true, true],
      ['Inspect and replace filters if clogged', true, true],
      ['Check refrigerant pressures and log readings', true],
      ['Inspect condenser coils for corrosion', false],
      ['Restore power and confirm normal operation', true],
    ],
    notes: ['RTU-2 filter was heavily loaded; replaced with spare from van.'],
  },
  {
    key: 'reader',
    title: 'Replace lobby access-card reader',
    description:
      'Main lobby reader intermittently rejects valid badges. Swap with the replacement unit and re-pair it with the controller.',
    priority: 'high',
    status: 'assigned',
    dueIn: -3 * HOUR,
    checklist: [
      ['Collect replacement reader from storeroom', true],
      ['Disconnect and remove the faulty reader', true],
      ['Install and pair the new reader', true],
      ['Test with three different badges', true],
    ],
  },
  {
    key: 'generator',
    title: 'Generator monthly load test',
    description:
      'Run the backup generator at 50% load for 30 minutes. Blocked until facilities confirms the maintenance window.',
    priority: 'high',
    status: 'blocked',
    dueIn: 5 * HOUR,
    checklist: [
      ['Confirm maintenance window with facilities', true],
      ['Check fuel and coolant levels', true],
      ['Run load test for 30 minutes', true],
    ],
    notes: ['Waiting on facilities to approve the window. Asked Priya at 9:10.'],
  },
  {
    key: 'extinguisher',
    title: 'Fire extinguisher check – Floor 4',
    description:
      'Monthly visual inspection of the 12 extinguishers on floor 4. Tag each one and photograph any that fail.',
    priority: 'medium',
    status: 'assigned',
    dueIn: 1 * DAY,
    requiresEvidence: true,
    checklist: [
      ['Verify pressure gauge is in the green', true],
      ['Check tamper seal and pin', true],
      ['Sign and date the inspection tag', true],
    ],
  },
  {
    key: 'audit',
    title: 'Client site audit – Northside warehouse',
    description:
      'Walk-through audit of safety signage, emergency exits and dock equipment ahead of the client review on Friday.',
    priority: 'medium',
    status: 'assigned',
    dueIn: 3 * DAY,
    checklist: [
      ['Emergency exits unobstructed', true],
      ['Signage visible and current', false],
      ['Dock levelers operational', true],
      ['Summarise findings for the client', false],
    ],
  },
  {
    key: 'lighting',
    title: 'Parking lot lighting survey',
    description:
      'Note every pole with a failed or flickering lamp so the electrical contractor can quote replacements.',
    priority: 'low',
    status: 'assigned',
    dueIn: 6 * DAY,
    checklist: [
      ['Survey lot A', false],
      ['Survey lot B', false],
    ],
  },
  {
    key: 'firstaid',
    title: 'Restock first-aid kits',
    description: 'Restock all six first-aid stations from the central supply.',
    priority: 'low',
    status: 'completed',
    dueIn: -1 * DAY,
    completedAgo: 1 * DAY + 2 * HOUR,
    checklist: [['Restock all stations', true, true]],
  },
  {
    key: 'leak',
    title: 'Water leak follow-up – Unit 12B',
    description: 'Confirm the ceiling repair holds and the area is dry.',
    priority: 'medium',
    status: 'completed',
    dueIn: -3 * DAY,
    completedAgo: 3 * DAY,
    checklist: [
      ['Moisture reading below 15%', true, true],
      ['Photograph repaired area', false, true],
    ],
  },
  {
    key: 'elevator',
    title: 'Elevator emergency phone test',
    description: 'Test the emergency phone in both elevators and log the response time.',
    priority: 'medium',
    status: 'completed',
    dueIn: -5 * DAY,
    completedAgo: 5 * DAY,
    checklist: [['Test elevator 1 and 2', true, true]],
  },
  {
    key: 'roof',
    title: 'Roof drain clearing',
    description: 'Clear leaves and debris from the four roof drains before the forecast storm.',
    priority: 'high',
    status: 'completed',
    dueIn: -4 * DAY,
    completedAgo: 4 * DAY + 5 * HOUR,
    checklist: [['Clear all four drains', true, true]],
  },
];

/** Deterministic ids so a reseed keeps the same rows. */
const id = (key: string, n = 0) => {
  let h = 0;
  for (const ch of `${key}:${n}`) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const hex = h.toString(16).padStart(8, '0');
  return `${hex}-${hex.slice(0, 4)}-4${hex.slice(1, 4)}-8${hex.slice(4, 7)}-${hex}${hex.slice(0, 4)}`;
};

export function buildDemoSeed(now = Date.now()): RemoteTaskBundle[] {
  return SEED.map((s, index) => {
    const taskId = id(s.key);
    const created = new Date(now - (7 + index) * DAY).toISOString();
    const completedAt =
      s.status === 'completed' ? new Date(now - (s.completedAgo ?? DAY)).toISOString() : null;
    const task: Task = {
      id: taskId,
      title: s.title,
      description: s.description,
      priority: s.priority,
      status: s.status,
      dueAt: s.dueIn === null ? null : new Date(now + s.dueIn).toISOString(),
      assigneeId: DEMO_USER.id,
      requiresEvidence: s.requiresEvidence ?? false,
      createdAt: created,
      updatedAt: completedAt ?? created,
      completedAt,
    };
    const checklist: ChecklistItem[] = s.checklist.map(([label, isRequired, isDone], i) => ({
      id: id(s.key, i + 1),
      taskId,
      label,
      isRequired,
      isDone: isDone ?? false,
      sortOrder: i,
      updatedAt: created,
    }));
    const notes = (s.notes ?? []).map((body, i) => ({
      id: id(`${s.key}-note`, i),
      taskId,
      authorId: DEMO_USER.id,
      authorName: DEMO_USER.fullName,
      body,
      createdAt: new Date(now - (i + 1) * HOUR).toISOString(),
    }));
    return { task, checklist, notes, attachments: [] };
  });
}
