export async function api(path) {
  const response = await fetch(path, {headers: {'accept':'application/json'}});
  const value = await response.json();
  if (!response.ok) throw new Error(value.error || response.statusText);
  return value;
}

export function q(value) { return encodeURIComponent(value); }
