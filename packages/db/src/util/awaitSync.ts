/** Bloqueia a thread principal até a Promise resolver (uso pontual em APIs síncronas). */
export function awaitSync<T>(promise: Promise<T>): T {
  const sab = new SharedArrayBuffer(4);
  const slot = new Int32Array(sab);
  let result: T;
  let error: unknown;

  void promise.then(
    (value) => {
      result = value;
      Atomics.store(slot, 0, 1);
      Atomics.notify(slot, 0);
    },
    (err) => {
      error = err;
      Atomics.store(slot, 0, 2);
      Atomics.notify(slot, 0);
    },
  );

  Atomics.wait(slot, 0, 0);

  if (Atomics.load(slot, 0) === 2) {
    throw error instanceof Error ? error : new Error(String(error));
  }
  return result!;
}
