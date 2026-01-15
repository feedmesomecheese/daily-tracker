"use client";

import * as React from "react";
import { useState, useRef, useEffect, useCallback } from "react";
import { Input } from "./input";
import { cn } from "@/lib/utils";

const FORMULA_FUNCTIONS = [
  "prev(",
  "coalesce(",
  "diff(",
  "if(",
  "and(",
  "or(",
  "not(",
  "gt(",
  "gte(",
  "lt(",
  "lte(",
  "eq(",
  "ne(",
  "abs(",
];

export interface FormulaInputProps {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  metricIds: string[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

// Extract the word being typed at cursor position
function getWordAtCursor(text: string, cursorPos: number): { word: string; start: number; end: number } {
  // Find word boundaries (alphanumeric and underscore)
  let start = cursorPos;
  let end = cursorPos;

  // Go back to find start of word
  while (start > 0 && /[a-zA-Z0-9_]/.test(text[start - 1])) {
    start--;
  }

  // Go forward to find end of word
  while (end < text.length && /[a-zA-Z0-9_]/.test(text[end])) {
    end++;
  }

  return {
    word: text.slice(start, end),
    start,
    end,
  };
}

// Simple validation: check balanced parentheses
function validateFormula(expr: string): { valid: boolean; error?: string } {
  if (!expr.trim()) return { valid: true };

  let depth = 0;
  for (const char of expr) {
    if (char === "(") depth++;
    if (char === ")") depth--;
    if (depth < 0) return { valid: false, error: "Unmatched closing parenthesis" };
  }
  if (depth > 0) return { valid: false, error: "Unmatched opening parenthesis" };

  return { valid: true };
}

export function FormulaInput({
  value,
  onChange,
  onBlur,
  metricIds,
  placeholder = "e.g. daily_score + sleep_score",
  className,
  disabled = false,
}: FormulaInputProps) {
  const [inputValue, setInputValue] = useState(value);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [cursorPosition, setCursorPosition] = useState(0);
  const [validation, setValidation] = useState<{ valid: boolean; error?: string }>({ valid: true });
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync with external value
  useEffect(() => {
    setInputValue(value);
    setValidation(validateFormula(value));
  }, [value]);

  // All possible suggestions
  const allSuggestions = React.useMemo(
    () => [...metricIds, ...FORMULA_FUNCTIONS],
    [metricIds]
  );

  const updateSuggestions = useCallback(
    (text: string, cursor: number) => {
      const { word } = getWordAtCursor(text, cursor);
      if (word.length === 0) {
        setSuggestions([]);
        setShowSuggestions(false);
        return;
      }

      const filtered = allSuggestions.filter((s) =>
        s.toLowerCase().startsWith(word.toLowerCase())
      );
      setSuggestions(filtered);
      setShowSuggestions(filtered.length > 0);
      setHighlightedIndex(-1);
    },
    [allSuggestions]
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    const cursor = e.target.selectionStart ?? 0;
    setInputValue(newValue);
    setCursorPosition(cursor);
    setValidation(validateFormula(newValue));
    updateSuggestions(newValue, cursor);
  };

  const handleSelect = (selected: string) => {
    const { start, end } = getWordAtCursor(inputValue, cursorPosition);
    const newValue = inputValue.slice(0, start) + selected + inputValue.slice(end);
    setInputValue(newValue);
    onChange(newValue);
    setShowSuggestions(false);
    setHighlightedIndex(-1);

    // Set cursor after inserted text
    setTimeout(() => {
      if (inputRef.current) {
        const newCursor = start + selected.length;
        inputRef.current.setSelectionRange(newCursor, newCursor);
        inputRef.current.focus();
      }
    }, 0);
  };

  const handleBlur = () => {
    // Delay to allow click on suggestions
    setTimeout(() => {
      setShowSuggestions(false);
      if (inputValue !== value) {
        onChange(inputValue);
      }
      onBlur?.();
    }, 150);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showSuggestions || suggestions.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === "Enter" || e.key === "Tab") {
      if (highlightedIndex >= 0) {
        e.preventDefault();
        handleSelect(suggestions[highlightedIndex]);
      }
    } else if (e.key === "Escape") {
      setShowSuggestions(false);
      setHighlightedIndex(-1);
    }
  };

  const handleClick = () => {
    const cursor = inputRef.current?.selectionStart ?? 0;
    setCursorPosition(cursor);
    updateSuggestions(inputValue, cursor);
  };

  return (
    <div className={cn("relative", className)}>
      <Input
        ref={inputRef}
        value={inputValue}
        onChange={handleInputChange}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        onClick={handleClick}
        placeholder={placeholder}
        disabled={disabled}
        className={cn(
          "w-full font-mono text-xs",
          !validation.valid && "border-destructive focus-visible:ring-destructive"
        )}
      />
      {!validation.valid && validation.error && (
        <p className="text-xs text-destructive mt-1">{validation.error}</p>
      )}
      {showSuggestions && suggestions.length > 0 && (
        <div className="absolute top-full left-0 w-full mt-1 bg-popover border rounded-md shadow-lg z-50 max-h-48 overflow-auto">
          {suggestions.slice(0, 10).map((suggestion, idx) => (
            <div
              key={suggestion}
              className={cn(
                "px-3 py-1.5 cursor-pointer text-xs font-mono",
                highlightedIndex === idx
                  ? "bg-accent text-accent-foreground"
                  : "hover:bg-muted"
              )}
              onMouseDown={() => handleSelect(suggestion)}
              onMouseEnter={() => setHighlightedIndex(idx)}
            >
              {suggestion}
              {FORMULA_FUNCTIONS.includes(suggestion) && (
                <span className="ml-2 text-muted-foreground text-[10px]">function</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
