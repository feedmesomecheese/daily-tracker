import { useState, useRef, useCallback, useEffect } from "react";
import { getSTTProvider } from "@/lib/stt";

interface UseSpeechInputOptions {
  /** Current value of the textarea, used to restore on cancel */
  value: string;
  /** Called with the new value as speech is recognized */
  onChange: (value: string) => void;
}

interface UseSpeechInputReturn {
  isSupported: boolean;
  isListening: boolean;
  interim: string;
  startListening: () => void;
  stopListening: () => void;
  cancel: () => void;
}

export function useSpeechInput({
  value,
  onChange,
}: UseSpeechInputOptions): UseSpeechInputReturn {
  const [isListening, setIsListening] = useState(false);
  const [interim, setInterim] = useState("");

  // Snapshot of value at the moment recording started — used for cancel
  const baseValueRef = useRef<string>("");
  // Accumulates finalized speech segments during this session
  const accumulatedRef = useRef<string>("");

  const providerRef = useRef(getSTTProvider());
  const isSupported = providerRef.current.isSupported();

  // Keep a live ref to the current textarea value so callbacks always see it
  const valueRef = useRef(value);
  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  const stopListening = useCallback(() => {
    providerRef.current.stopListening();
    setIsListening(false);
    setInterim("");
    accumulatedRef.current = "";
  }, []);

  const startListening = useCallback(() => {
    if (!isSupported || isListening) return;

    // Snapshot current value so we know what was there before recording
    baseValueRef.current = value;
    accumulatedRef.current = "";
    setIsListening(true);
    setInterim("");

    providerRef.current.startListening(
      (result) => {
        if (result.isFinal) {
          // Auto-add a period if the segment doesn't end with sentence punctuation
          const raw = result.transcript.trim();
          const endsWithPunctuation = /[.!?,;:]$/.test(raw);
          const segment = endsWithPunctuation ? raw : `${raw}.`;

          // Append final result (with a space separator if needed)
          const separator =
            baseValueRef.current || accumulatedRef.current ? " " : "";
          accumulatedRef.current += separator + segment;
          setInterim("");
          onChange(baseValueRef.current + (baseValueRef.current ? " " : "") + accumulatedRef.current.trimStart());
        } else {
          // Show interim as a preview; don't commit yet
          setInterim(result.transcript);
        }
      },
      (_error) => {
        setIsListening(false);
        setInterim("");
        accumulatedRef.current = "";
      }
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSupported, isListening, onChange]);

  const cancel = useCallback(() => {
    providerRef.current.stopListening();
    setIsListening(false);
    setInterim("");
    accumulatedRef.current = "";
    // Restore the value to what it was before recording started
    onChange(baseValueRef.current);
  }, [onChange]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      providerRef.current.stopListening();
    };
  }, []);

  return {
    isSupported,
    isListening,
    interim,
    startListening,
    stopListening,
    cancel,
  };
}
