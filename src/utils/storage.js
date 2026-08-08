export function readJson(key, fallback) {
  try {
    const rawValue = localStorage.getItem(key);
    if (!rawValue) return fallback;

    const parsedValue = JSON.parse(rawValue);
    return parsedValue ?? fallback;
  } catch {
    return fallback;
  }
}

export function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}
