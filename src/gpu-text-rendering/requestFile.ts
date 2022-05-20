export function requestFile(filename: string): Promise<Response> {
  return fetch(uncached(filename), { method: 'GET' })
    // .then((response) => response.arrayBuffer())
    // .then((buf) => unpackBmp(buf))
}

function uncached(s: string) {
  if (document.location.hostname == "localhost") {
    return s + "?" + Math.random();
  }
  return s;
}

