// Shared only for filesystem coordination, never for project configuration.
const pending = new Map<string, Promise<void>>();

export async function withFileLock<T>(
  path: string,
  action: () => Promise<T>,
): Promise<T> {
  const previous = pending.get(path) ?? Promise.resolve();
  let release: () => void = () => {};
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  pending.set(path, current);
  await previous;
  try {
    return await action();
  } finally {
    release();
    if (pending.get(path) === current) pending.delete(path);
  }
}
