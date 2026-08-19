/**
 * Prepares form values for the API.
 *
 * The API validates with `whitelist: true, forbidNonWhitelisted: true`, and its
 * optional fields are `@IsOptional()` — meaning *absent*, not empty. An
 * untouched optional input holds `''`, and sending that produces a 400:
 * `email` must be an email, `villageId` must be a Mongo id, `dateOfBirth` must
 * be a date. Dropping blanks here is what keeps "I left the field alone" from
 * looking like "I typed something invalid".
 *
 * Only own enumerable keys are walked, one level into nested objects and arrays
 * of objects (the student form's guardian entries), which is as deep as any
 * payload in this app goes.
 */
export function stripEmpty<T>(values: T): T {
  return strip(values) as T;
}

function strip(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(strip);

  if (value && typeof value === 'object' && !(value instanceof Date) && !(value instanceof File)) {
    const result: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      if (entry === '' || entry === undefined) continue;
      result[key] = strip(entry);
    }
    return result;
  }

  return value;
}

/**
 * Fields that changed, for a PATCH.
 *
 * Sending the whole record back would overwrite a field another user edited in
 * the meantime, and would re-send a unique key (`studentCode`) that has not
 * changed — which the API rejects as a duplicate of the row itself.
 */
export function changedFields<T extends Record<string, unknown>>(next: T, previous: Partial<T>): Partial<T> {
  const patch: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(next)) {
    const before = previous[key as keyof T];
    // Normalise the "absent vs blank" pair so an untouched empty field is not
    // reported as a change.
    const normalizedNext = value === '' ? undefined : value;
    const normalizedBefore = before === '' || before === null ? undefined : before;

    if (JSON.stringify(normalizedNext) !== JSON.stringify(normalizedBefore)) {
      patch[key] = normalizedNext;
    }
  }

  return patch as Partial<T>;
}
