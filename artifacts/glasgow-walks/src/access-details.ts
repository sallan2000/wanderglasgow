export const ACCESS_STATES = ['unknown', 'yes', 'no'] as const;
export type AccessState = typeof ACCESS_STATES[number];
export type AccessDetails = {
  stepFree: AccessState;
  accessibleToilet: AccessState;
  seating: AccessState;
  notes: string;
};
export type AccessPreference = 'any' | 'step-free';
export const ACCESS_FIELDS = [
  { key: 'stepFree', label: 'Step-free entrance' },
  { key: 'accessibleToilet', label: 'Accessible toilet' },
  { key: 'seating', label: 'Seating / rest point' },
] as const;
export const unknownAccess = (): AccessDetails => ({
  stepFree: 'unknown', accessibleToilet: 'unknown', seating: 'unknown', notes: '',
});

export function validateAccessDetails(value?: AccessDetails): AccessDetails {
  if (value === undefined) return unknownAccess();
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Enter valid attraction access details.');
  for (const { key } of ACCESS_FIELDS) {
    if (!ACCESS_STATES.includes(value[key])) throw new Error('Choose Unknown, Yes or No for each access detail.');
  }
  if (typeof value.notes !== 'string' || value.notes.trim().length > 1500) {
    throw new Error('Keep access notes under 1,500 characters.');
  }
  return { stepFree: value.stepFree, accessibleToilet: value.accessibleToilet, seating: value.seating, notes: value.notes.trim() };
}

export function matchesAccessPreference(value: AccessDetails | undefined, preference: AccessPreference): boolean {
  return preference === 'any' || value?.stepFree === 'yes';
}