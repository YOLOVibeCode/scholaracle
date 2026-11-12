/**
 * The first whitespace-separated token of a person's name, or `fallback` when the
 * name is blank. One helper for every "Gideon asked for help" / "Gideon's week" line
 * across agents and the API, so a name renders the same everywhere.
 */
export function firstNameOf(fullName: string, fallback = ''): string {
  const first = fullName.trim().split(/\s+/)[0];
  return first !== undefined && first !== '' ? first : fallback;
}
