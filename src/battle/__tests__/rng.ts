import { vi, afterEach } from 'vitest';

// Install a Math.random stub that returns the given values in sequence.
// Throws if the sequence is exhausted — forces tests to be explicit about
// how many RNG calls they expect and in what order.
export function stubRng(values: number[]): void {
  let i = 0;
  vi.spyOn(Math, 'random').mockImplementation(() => {
    if (i >= values.length) {
      throw new Error(`stubRng exhausted after ${values.length} calls (call #${i + 1})`);
    }
    return values[i++];
  });
}

export function stubRngConst(v: number): void {
  vi.spyOn(Math, 'random').mockImplementation(() => v);
}

afterEach(() => {
  vi.restoreAllMocks();
});
