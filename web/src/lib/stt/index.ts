export type { STTProvider, STTResult } from "./types";
export { WebSpeechProvider } from "./webSpeechProvider";

import type { STTProvider } from "./types";
import { WebSpeechProvider } from "./webSpeechProvider";

// Swap this function to return a WhisperProvider (or other) when ready.
export function getSTTProvider(): STTProvider {
  return new WebSpeechProvider();
}
