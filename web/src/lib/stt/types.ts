export interface STTResult {
  transcript: string;
  isFinal: boolean;
}

export interface STTProvider {
  isSupported(): boolean;
  startListening(
    onResult: (result: STTResult) => void,
    onError: (error: string) => void
  ): void;
  stopListening(): void;
}
