/** Fetches the JSON file at `path` and parses it as `T`. */
export async function loadJSON<T = any>(path: string): Promise<T> {
  const data = await fetch(path);
  return await data.json();
}
