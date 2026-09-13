/// <reference types="vite/client" />
import type { AureliusBridge } from "../shared/types/ipc";

declare global {
  interface Window {
    aurelius: AureliusBridge;
  }
}

export {};
