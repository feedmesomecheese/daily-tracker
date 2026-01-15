"use client";

import * as React from "react";
import { useState, useRef, useEffect } from "react";
import { Input } from "./input";
import { cn } from "@/lib/utils";

export interface ComboboxProps {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export function Combobox({
  value,
  onChange,
  options,
  placeholder = "Select or type...",
  className,
  disabled = false,
}: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const [inputValue, setInputValue] = useState(value);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Sync input value with external value
  useEffect(() => {
    setInputValue(value);
  }, [value]);

  const filteredOptions = options.filter((opt) =>
    opt.toLowerCase().includes(inputValue.toLowerCase())
  );

  const showCreateOption =
    inputValue.trim() !== "" &&
    !options.some((opt) => opt.toLowerCase() === inputValue.toLowerCase());

  const handleSelect = (selectedValue: string) => {
    setInputValue(selectedValue);
    onChange(selectedValue);
    setOpen(false);
    setHighlightedIndex(-1);
  };

  const handleBlur = () => {
    // Delay to allow click events on options
    setTimeout(() => {
      setOpen(false);
      // Commit the current input value on blur
      if (inputValue !== value) {
        onChange(inputValue);
      }
    }, 150);
  };

  // Auto-highlight first matching option when typing
  useEffect(() => {
    if (open && filteredOptions.length > 0 && inputValue.trim()) {
      setHighlightedIndex(0);
    }
  }, [open, filteredOptions.length, inputValue]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const totalOptions = filteredOptions.length + (showCreateOption ? 1 : 0);

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setOpen(true);
      setHighlightedIndex((prev) => (prev + 1) % totalOptions);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setOpen(true);
      setHighlightedIndex((prev) => (prev - 1 + totalOptions) % totalOptions);
    } else if (e.key === "Enter" || e.key === "Tab") {
      // Tab or Enter accepts the highlighted suggestion
      if (open && highlightedIndex >= 0 && highlightedIndex < filteredOptions.length) {
        e.preventDefault();
        handleSelect(filteredOptions[highlightedIndex]);
      } else if (open && showCreateOption && highlightedIndex === filteredOptions.length) {
        e.preventDefault();
        handleSelect(inputValue.trim());
      } else if (e.key === "Enter" && inputValue.trim()) {
        e.preventDefault();
        handleSelect(inputValue.trim());
      }
      // If Tab and nothing selected, let it proceed naturally
    } else if (e.key === "Escape") {
      setOpen(false);
      setHighlightedIndex(-1);
    }
  };

  return (
    <div className={cn("relative", className)}>
      <Input
        ref={inputRef}
        value={inputValue}
        onChange={(e) => {
          setInputValue(e.target.value);
          setOpen(true);
          setHighlightedIndex(-1);
        }}
        onFocus={() => setOpen(true)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        className="w-full"
      />
      {open && (filteredOptions.length > 0 || showCreateOption) && (
        <div
          ref={listRef}
          className="absolute top-full left-0 w-full mt-1 bg-popover border rounded-md shadow-lg z-50 max-h-48 overflow-auto"
        >
          {filteredOptions.map((opt, idx) => (
            <div
              key={opt}
              className={cn(
                "px-3 py-2 cursor-pointer text-sm",
                highlightedIndex === idx
                  ? "bg-accent text-accent-foreground"
                  : "hover:bg-muted"
              )}
              onMouseDown={() => handleSelect(opt)}
              onMouseEnter={() => setHighlightedIndex(idx)}
            >
              {opt}
            </div>
          ))}
          {showCreateOption && (
            <div
              className={cn(
                "px-3 py-2 cursor-pointer text-sm border-t",
                highlightedIndex === filteredOptions.length
                  ? "bg-accent text-accent-foreground"
                  : "hover:bg-muted text-muted-foreground"
              )}
              onMouseDown={() => handleSelect(inputValue.trim())}
              onMouseEnter={() => setHighlightedIndex(filteredOptions.length)}
            >
              Create &quot;{inputValue.trim()}&quot;
            </div>
          )}
        </div>
      )}
    </div>
  );
}
