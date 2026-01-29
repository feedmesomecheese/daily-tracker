"use client";

import { useState, useMemo } from "react";
import Picker from "react-mobile-picker";

// Shared styles for the picker container
const pickerContainerClass = "border rounded-lg bg-background overflow-hidden";
const pickerColumnClass = "text-center";
const pickerItemClass = "text-base py-1";
const pickerItemSelectedClass = "font-semibold text-foreground";
const pickerItemUnselectedClass = "text-muted-foreground";

/**
 * TimeOfDayPicker - for hhmm type metrics (24-hour format)
 * Two wheels: hours (0-23) and minutes (0-59)
 */
type TimeOfDayPickerProps = {
  /** Value in minutes since midnight (e.g., 510 = 8:30) */
  value: number | null;
  onChange: (minutes: number) => void;
};

export function TimeOfDayPicker({ value, onChange }: TimeOfDayPickerProps) {
  const hours = useMemo(() => Array.from({ length: 24 }, (_, i) => i), []);
  const minutes = useMemo(() => Array.from({ length: 60 }, (_, i) => i), []);

  // Parse value into hours and minutes
  const currentHour = value != null ? Math.floor(value / 60) % 24 : 8;
  const currentMinute = value != null ? value % 60 : 0;

  const [pickerValue, setPickerValue] = useState({
    hour: currentHour,
    minute: currentMinute,
  });

  const handleChange = (newValue: { hour: number; minute: number }) => {
    setPickerValue(newValue);
    onChange(newValue.hour * 60 + newValue.minute);
  };

  return (
    <div className={pickerContainerClass}>
      <Picker
        value={pickerValue}
        onChange={handleChange}
        wheelMode="natural"
        height={150}
      >
        <Picker.Column name="hour">
          {hours.map((h) => (
            <Picker.Item key={h} value={h}>
              {({ selected }) => (
                <div
                  className={`${pickerItemClass} ${
                    selected ? pickerItemSelectedClass : pickerItemUnselectedClass
                  }`}
                >
                  {String(h).padStart(2, "0")}
                </div>
              )}
            </Picker.Item>
          ))}
        </Picker.Column>
        <Picker.Column name="minute">
          {minutes.map((m) => (
            <Picker.Item key={m} value={m}>
              {({ selected }) => (
                <div
                  className={`${pickerItemClass} ${
                    selected ? pickerItemSelectedClass : pickerItemUnselectedClass
                  }`}
                >
                  {String(m).padStart(2, "0")}
                </div>
              )}
            </Picker.Item>
          ))}
        </Picker.Column>
      </Picker>
      <div className="text-center text-xs text-muted-foreground pb-2">
        {String(pickerValue.hour).padStart(2, "0")}:{String(pickerValue.minute).padStart(2, "0")}
      </div>
    </div>
  );
}

/**
 * DurationPicker - for time type metrics (duration in minutes)
 * Two wheels: hours (0-23) and minutes (0-59)
 */
type DurationPickerProps = {
  /** Value in total minutes */
  value: number | null;
  onChange: (minutes: number) => void;
  /** Max hours to show (default 23) */
  maxHours?: number;
};

export function DurationPicker({ value, onChange, maxHours = 23 }: DurationPickerProps) {
  const hours = useMemo(() => Array.from({ length: maxHours + 1 }, (_, i) => i), [maxHours]);
  const minutes = useMemo(() => Array.from({ length: 60 }, (_, i) => i), []);

  const currentHour = value != null ? Math.min(Math.floor(value / 60), maxHours) : 0;
  const currentMinute = value != null ? value % 60 : 0;

  const [pickerValue, setPickerValue] = useState({
    hour: currentHour,
    minute: currentMinute,
  });

  const handleChange = (newValue: { hour: number; minute: number }) => {
    setPickerValue(newValue);
    onChange(newValue.hour * 60 + newValue.minute);
  };

  const totalMinutes = pickerValue.hour * 60 + pickerValue.minute;

  return (
    <div className={pickerContainerClass}>
      <Picker
        value={pickerValue}
        onChange={handleChange}
        wheelMode="natural"
        height={150}
      >
        <Picker.Column name="hour">
          {hours.map((h) => (
            <Picker.Item key={h} value={h}>
              {({ selected }) => (
                <div
                  className={`${pickerItemClass} ${
                    selected ? pickerItemSelectedClass : pickerItemUnselectedClass
                  }`}
                >
                  {h}h
                </div>
              )}
            </Picker.Item>
          ))}
        </Picker.Column>
        <Picker.Column name="minute">
          {minutes.map((m) => (
            <Picker.Item key={m} value={m}>
              {({ selected }) => (
                <div
                  className={`${pickerItemClass} ${
                    selected ? pickerItemSelectedClass : pickerItemUnselectedClass
                  }`}
                >
                  {m}m
                </div>
              )}
            </Picker.Item>
          ))}
        </Picker.Column>
      </Picker>
      <div className="text-center text-xs text-muted-foreground pb-2">
        {pickerValue.hour > 0 ? `${pickerValue.hour}h ` : ""}{pickerValue.minute}m ({totalMinutes} min)
      </div>
    </div>
  );
}

/**
 * NumberWheelPicker - for number/score/count type metrics
 * Single wheel bounded by min/max, excludes disallowed values
 */
type NumberWheelPickerProps = {
  value: number | null;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  /** Comma-separated string of disallowed values */
  disallowedValues?: string | null;
};

export function NumberWheelPicker({
  value,
  onChange,
  min = 0,
  max = 100,
  disallowedValues,
}: NumberWheelPickerProps) {
  // Parse disallowed values
  const disallowedSet = useMemo(() => {
    if (!disallowedValues) return new Set<number>();
    return new Set(
      disallowedValues
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .map(Number)
        .filter((n) => Number.isFinite(n))
    );
  }, [disallowedValues]);

  // Generate allowed numbers
  const numbers = useMemo(() => {
    const result: number[] = [];
    for (let i = min; i <= max; i++) {
      if (!disallowedSet.has(i)) {
        result.push(i);
      }
    }
    return result;
  }, [min, max, disallowedSet]);

  // Find closest allowed value
  const closestAllowed = useMemo(() => {
    if (value == null || numbers.length === 0) return numbers[0] ?? min;
    if (numbers.includes(value)) return value;
    // Find closest
    let closest = numbers[0];
    let closestDist = Math.abs(value - closest);
    for (const n of numbers) {
      const dist = Math.abs(value - n);
      if (dist < closestDist) {
        closest = n;
        closestDist = dist;
      }
    }
    return closest;
  }, [value, numbers, min]);

  const [pickerValue, setPickerValue] = useState({
    num: closestAllowed,
  });

  const handleChange = (newValue: { num: number }) => {
    setPickerValue(newValue);
    onChange(newValue.num);
  };

  return (
    <div className={pickerContainerClass}>
      <Picker
        value={pickerValue}
        onChange={handleChange}
        wheelMode="natural"
        height={150}
      >
        <Picker.Column name="num">
          {numbers.map((n) => (
            <Picker.Item key={n} value={n}>
              {({ selected }) => (
                <div
                  className={`${pickerItemClass} ${
                    selected ? pickerItemSelectedClass : pickerItemUnselectedClass
                  }`}
                >
                  {n}
                </div>
              )}
            </Picker.Item>
          ))}
        </Picker.Column>
      </Picker>
    </div>
  );
}
