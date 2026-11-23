/** Attendance maths. "On duty" (od) counts as present for the percentage. */
export function summarize(records) {
  let present = 0;
  let absent = 0;
  let od = 0;
  for (const r of records) {
    if (r.status === 'present') present++;
    else if (r.status === 'absent') absent++;
    else if (r.status === 'od') od++;
  }
  const total = present + absent + od;
  const percentage = total ? Math.round(((present + od) / total) * 1000) / 10 : null;
  return { total, present, absent, od, percentage };
}

/** Month-by-month breakdown, newest month first. */
export function monthly(records) {
  const groups = new Map();
  for (const r of records) {
    const month = r.date.slice(0, 7);
    if (!groups.has(month)) groups.set(month, []);
    groups.get(month).push(r);
  }
  return [...groups.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([month, recs]) => ({ month, ...summarize(recs) }));
}
