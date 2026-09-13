import type { AureliusBridge } from "../../shared/types/ipc";

/** Access the preload-exposed bridge, failing loudly if it's missing. */
export function bridge(): AureliusBridge {
  if (!window.aurelius) {
    throw new Error("Aurelius bridge unavailable — the preload script did not initialize.");
  }
  return window.aurelius;
}
