"use client";

import { useState, useMemo, useCallback, useRef } from "react";
import Picker from "react-mobile-picker";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";

// Shared styles
const pickerItemClass = "text-base py-1";
const pickerItemSelectedClass = "font-semibold text-foreground";
const pickerItemUnselectedClass = "text-muted-foreground";

const fieldButtonClass =
  "w-full max-w-72 h-10 px-3 text-left border rounded-md bg-background hover:bg-accent/50 transition-colors flex items-center justify-between";

/**
 * Material Design-style Clock Face for 24-hour time selection
 * - Outer ring: 1-12 (AM hours)
 * - Inner ring: 13-24/00 (PM hours)
 * - Auto-advances to minute selection after hour is picked
 */
type ClockFaceProps = {
  hour: number;
  minute: number;
  mode: "hour" | "minute";
  onHourChange: (h: number) => void;
  onMinuteChange: (m: number) => void;
  onModeChange: (mode: "hour" | "minute") => void;
};

function ClockFace({ hour, minute, mode, onHourChange, onMinuteChange, onModeChange }: ClockFaceProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const size = 260;
  const center = size / 2;
  const outerRadius = size / 2 - 24;
  const innerRadius = size / 2 - 64;

  // Handle interaction - determine hour/minute from touch position
  const handleInteraction = useCallback((clientX: number, clientY: number, isEnd: boolean) => {
    if (!svgRef.current) return;

    const rect = svgRef.current.getBoundingClientRect();
    const x = clientX - rect.left - center;
    const y = clientY - rect.top - center;
    const distance = Math.sqrt(x * x + y * y);

    // Calculate angle (0 = top, clockwise)
    let angle = Math.atan2(x, -y) * (180 / Math.PI);
    if (angle < 0) angle += 360;

    if (mode === "hour") {
      // Determine if inner or outer ring based on distance
      const isInnerRing = distance < (outerRadius + innerRadius) / 2;

      // Each hour is 30 degrees
      let h = Math.round(angle / 30) % 12;

      if (isInnerRing) {
        // Inner ring: 0, 13-23
        h = h === 0 ? 0 : h + 12;
      } else {
        // Outer ring: 1-12, but we store as 1-12 (convert 0 to 12)
        h = h === 0 ? 12 : h;
      }

      onHourChange(h);

      // Auto-advance to minutes on release
      if (isEnd) {
        onModeChange("minute");
      }
    } else {
      // Minutes: each minute is 6 degrees
      let m = Math.round(angle / 6) % 60;
      onMinuteChange(m);
    }
  }, [mode, onHourChange, onMinuteChange, onModeChange, center, outerRadius, innerRadius]);

  const handleTouchStart = (e: React.TouchEvent<SVGSVGElement>) => {
    e.preventDefault();
    handleInteraction(e.touches[0].clientX, e.touches[0].clientY, false);
  };

  const handleTouchMove = (e: React.TouchEvent<SVGSVGElement>) => {
    e.preventDefault();
    if (e.touches.length > 0) {
      handleInteraction(e.touches[0].clientX, e.touches[0].clientY, false);
    }
  };

  const handleTouchEnd = (e: React.TouchEvent<SVGSVGElement>) => {
    // Trigger auto-advance on release
    if (mode === "hour") {
      onModeChange("minute");
    }
  };

  const handleClick = (e: React.MouseEvent<SVGSVGElement>) => {
    handleInteraction(e.clientX, e.clientY, true);
  };

  // Calculate hand angle and length
  const getHandAngle = () => {
    if (mode === "hour") {
      return ((hour % 12) / 12) * 360;
    }
    return (minute / 60) * 360;
  };

  const getHandLength = () => {
    if (mode === "hour") {
      // Shorter hand for inner ring (0, 13-23)
      const isInner = hour === 0 || hour > 12;
      return isInner ? innerRadius - 16 : outerRadius - 16;
    }
    return outerRadius - 16;
  };

  const handAngle = getHandAngle();
  const handLength = getHandLength();
  const handRad = ((handAngle - 90) * Math.PI) / 180;

  // Outer ring hours: 1-12
  const outerHours = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  // Inner ring hours: 0, 13-23
  const innerHours = [0, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23];
  // Minutes (show every 5)
  const minuteMarkers = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

  return (
    <div className="flex flex-col items-center gap-3">
      {/* Time display - tappable to switch modes */}
      <div className="flex items-center text-3xl font-mono font-semibold">
        <button
          type="button"
          onClick={() => onModeChange("hour")}
          className={`px-2 py-1 rounded ${mode === "hour" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
        >
          {String(hour).padStart(2, "0")}
        </button>
        <span>:</span>
        <button
          type="button"
          onClick={() => onModeChange("minute")}
          className={`px-2 py-1 rounded ${mode === "minute" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
        >
          {String(minute).padStart(2, "0")}
        </button>
      </div>

      {/* Clock face */}
      <svg
        ref={svgRef}
        width={size}
        height={size}
        className="touch-none select-none"
        onClick={handleClick}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Background circle */}
        <circle
          cx={center}
          cy={center}
          r={outerRadius + 8}
          className="fill-muted/30"
        />

        {mode === "hour" ? (
          <>
            {/* Outer ring: 1-12 */}
            {outerHours.map((h, i) => {
              const angle = (i / 12) * 360 - 90;
              const rad = (angle * Math.PI) / 180;
              const x = center + Math.cos(rad) * (outerRadius - 20);
              const y = center + Math.sin(rad) * (outerRadius - 20);
              const isSelected = hour === h;

              return (
                <g key={`outer-${h}`}>
                  {isSelected && (
                    <circle cx={x} cy={y} r={18} className="fill-primary" />
                  )}
                  <text
                    x={x}
                    y={y}
                    textAnchor="middle"
                    dominantBaseline="central"
                    className={`text-base font-medium ${isSelected ? "fill-primary-foreground" : "fill-foreground"}`}
                  >
                    {h}
                  </text>
                </g>
              );
            })}

            {/* Inner ring: 0, 13-23 */}
            {innerHours.map((h, i) => {
              const angle = (i / 12) * 360 - 90;
              const rad = (angle * Math.PI) / 180;
              const x = center + Math.cos(rad) * (innerRadius - 8);
              const y = center + Math.sin(rad) * (innerRadius - 8);
              const isSelected = hour === h;

              return (
                <g key={`inner-${h}`}>
                  {isSelected && (
                    <circle cx={x} cy={y} r={16} className="fill-primary" />
                  )}
                  <text
                    x={x}
                    y={y}
                    textAnchor="middle"
                    dominantBaseline="central"
                    className={`text-sm ${isSelected ? "fill-primary-foreground" : "fill-muted-foreground"}`}
                  >
                    {String(h).padStart(2, "0")}
                  </text>
                </g>
              );
            })}
          </>
        ) : (
          <>
            {/* Minute markers */}
            {minuteMarkers.map((m, i) => {
              const angle = (i / 12) * 360 - 90;
              const rad = (angle * Math.PI) / 180;
              const x = center + Math.cos(rad) * (outerRadius - 20);
              const y = center + Math.sin(rad) * (outerRadius - 20);
              const isSelected = minute === m;

              return (
                <g key={`min-${m}`}>
                  {isSelected && (
                    <circle cx={x} cy={y} r={18} className="fill-primary" />
                  )}
                  <text
                    x={x}
                    y={y}
                    textAnchor="middle"
                    dominantBaseline="central"
                    className={`text-base font-medium ${isSelected ? "fill-primary-foreground" : "fill-foreground"}`}
                  >
                    {String(m).padStart(2, "0")}
                  </text>
                </g>
              );
            })}
          </>
        )}

        {/* Clock hand */}
        <line
          x1={center}
          y1={center}
          x2={center + Math.cos(handRad) * handLength}
          y2={center + Math.sin(handRad) * handLength}
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          className="text-primary"
        />

        {/* Hand end circle */}
        <circle
          cx={center + Math.cos(handRad) * handLength}
          cy={center + Math.sin(handRad) * handLength}
          r={4}
          className="fill-primary"
        />

        {/* Center dot */}
        <circle cx={center} cy={center} r={4} className="fill-primary" />
      </svg>
    </div>
  );
}

/**
 * TimeOfDayPickerField - tap to open Material Design clock picker (24-hour)
 */
type TimeOfDayPickerFieldProps = {
  value: number | null;
  onChange: (minutes: number) => void;
  className?: string;
};

export function TimeOfDayPicker({ value, onChange, className }: TimeOfDayPickerFieldProps) {
  const [open, setOpen] = useState(false);

  const currentHour = value != null ? Math.floor(value / 60) % 24 : 8;
  const currentMinute = value != null ? value % 60 : 0;

  const [hour, setHour] = useState(currentHour);
  const [minute, setMinute] = useState(currentMinute);
  const [mode, setMode] = useState<"hour" | "minute">("hour");

  // Reset to current value when opening
  const handleOpen = () => {
    setHour(currentHour);
    setMinute(currentMinute);
    setMode("hour");
    setOpen(true);
  };

  const handleConfirm = () => {
    onChange(hour * 60 + minute);
    setOpen(false);
  };

  const displayValue = value != null
    ? `${String(Math.floor(value / 60) % 24).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`
    : "Set time";

  return (
    <>
      <button type="button" onClick={handleOpen} className={`${fieldButtonClass} ${className || ""}`}>
        <span className={value == null ? "text-muted-foreground" : ""}>{displayValue}</span>
        <span className="text-muted-foreground text-lg">🕐</span>
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="h-auto max-h-[90vh]">
          <div className="flex flex-col items-center gap-4 py-2">
            <ClockFace
              hour={hour}
              minute={minute}
              mode={mode}
              onHourChange={setHour}
              onMinuteChange={setMinute}
              onModeChange={setMode}
            />
            <div className="flex gap-2 w-full max-w-xs">
              <Button variant="outline" className="flex-1" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button className="flex-1" onClick={handleConfirm}>
                Done
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

/**
 * DurationPickerField - tap to open duration wheel picker (h/m/s)
 * value is in decimal minutes (e.g. 90.5 = 1h 30m 30s)
 */
type DurationPickerFieldProps = {
  value: number | null;
  onChange: (minutes: number) => void;
  maxHours?: number;
  className?: string;
};

export function DurationPicker({ value, onChange, maxHours = 23, className }: DurationPickerFieldProps) {
  const [open, setOpen] = useState(false);

  const hours = useMemo(() => Array.from({ length: maxHours + 1 }, (_, i) => i), [maxHours]);
  const minuteOptions = useMemo(() => Array.from({ length: 60 }, (_, i) => i), []);
  const secondOptions = useMemo(() => Array.from({ length: 60 }, (_, i) => i), []);

  const totalSeconds = value != null ? Math.round(value * 60) : 0;
  const currentHour = value != null ? Math.min(Math.floor(totalSeconds / 3600), maxHours) : 0;
  const currentMinute = value != null ? Math.floor((totalSeconds % 3600) / 60) : 0;
  const currentSecond = value != null ? totalSeconds % 60 : 0;

  const [pickerValue, setPickerValue] = useState({
    hour: currentHour,
    minute: currentMinute,
    second: currentSecond,
  });

  // Reset to current value when opening
  const handleOpen = () => {
    setPickerValue({
      hour: currentHour,
      minute: currentMinute,
      second: currentSecond,
    });
    setOpen(true);
  };

  const handleConfirm = () => {
    const decimalMinutes = pickerValue.hour * 60 + pickerValue.minute + pickerValue.second / 60;
    onChange(decimalMinutes);
    setOpen(false);
  };

  const displayTotal = pickerValue.hour * 3600 + pickerValue.minute * 60 + pickerValue.second;

  const formatDisplay = (val: number | null) => {
    if (val == null) return "Set duration";
    const ts = Math.round(val * 60);
    const h = Math.floor(ts / 3600);
    const m = Math.floor((ts % 3600) / 60);
    const s = ts % 60;
    if (h > 0 && s > 0) return `${h}h ${m}m ${s}s`;
    if (h > 0) return `${h}h ${m}m`;
    if (s > 0) return `${m}m ${s}s`;
    return `${m}m`;
  };

  return (
    <>
      <button type="button" onClick={handleOpen} className={`${fieldButtonClass} ${className || ""}`}>
        <span className={value == null ? "text-muted-foreground" : ""}>{formatDisplay(value)}</span>
        <span className="text-muted-foreground">⏱️</span>
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="h-auto max-h-[85vh]">
          <div className="flex flex-col items-center gap-4 py-4">
            <div className="text-lg font-medium">Duration</div>

            <div className="border rounded-lg bg-background overflow-hidden">
              <Picker
                value={pickerValue}
                onChange={setPickerValue}
                wheelMode="natural"
                height={180}
              >
                <Picker.Column name="hour">
                  {hours.map((h) => (
                    <Picker.Item key={h} value={h}>
                      {({ selected }) => (
                        <div className={`${pickerItemClass} ${selected ? pickerItemSelectedClass : pickerItemUnselectedClass}`}>
                          {h}h
                        </div>
                      )}
                    </Picker.Item>
                  ))}
                </Picker.Column>
                <Picker.Column name="minute">
                  {minuteOptions.map((m) => (
                    <Picker.Item key={m} value={m}>
                      {({ selected }) => (
                        <div className={`${pickerItemClass} ${selected ? pickerItemSelectedClass : pickerItemUnselectedClass}`}>
                          {m}m
                        </div>
                      )}
                    </Picker.Item>
                  ))}
                </Picker.Column>
                <Picker.Column name="second">
                  {secondOptions.map((s) => (
                    <Picker.Item key={s} value={s}>
                      {({ selected }) => (
                        <div className={`${pickerItemClass} ${selected ? pickerItemSelectedClass : pickerItemUnselectedClass}`}>
                          {s}s
                        </div>
                      )}
                    </Picker.Item>
                  ))}
                </Picker.Column>
              </Picker>
            </div>

            <div className="text-sm text-muted-foreground">
              Total: {Math.floor(displayTotal / 60)}m {displayTotal % 60}s
            </div>

            <div className="flex gap-2 w-full max-w-xs">
              <Button variant="outline" className="flex-1" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button className="flex-1" onClick={handleConfirm}>
                Done
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

/**
 * NumberWheelPickerField - tap to open number wheel picker
 */
type NumberWheelPickerFieldProps = {
  value: number | null;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  disallowedValues?: string | null;
  className?: string;
};

export function NumberWheelPicker({
  value,
  onChange,
  min = 0,
  max = 100,
  disallowedValues,
  className,
}: NumberWheelPickerFieldProps) {
  const [open, setOpen] = useState(false);

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

  const [pickerValue, setPickerValue] = useState({ num: closestAllowed });

  // Reset to current value when opening
  const handleOpen = () => {
    setPickerValue({ num: closestAllowed });
    setOpen(true);
  };

  const handleConfirm = () => {
    onChange(pickerValue.num);
    setOpen(false);
  };

  const displayValue = value != null ? String(value) : "Set value";

  return (
    <>
      <button type="button" onClick={handleOpen} className={`${fieldButtonClass} ${className || ""}`}>
        <span className={value == null ? "text-muted-foreground" : ""}>{displayValue}</span>
        <span className="text-muted-foreground">#</span>
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="h-auto max-h-[85vh]">
          <div className="flex flex-col items-center gap-4 py-4">
            <div className="text-lg font-medium">Select Value</div>

            <div className="border rounded-lg bg-background overflow-hidden">
              <Picker
                value={pickerValue}
                onChange={setPickerValue}
                wheelMode="natural"
                height={180}
              >
                <Picker.Column name="num">
                  {numbers.map((n) => (
                    <Picker.Item key={n} value={n}>
                      {({ selected }) => (
                        <div className={`${pickerItemClass} text-lg ${selected ? pickerItemSelectedClass : pickerItemUnselectedClass}`}>
                          {n}
                        </div>
                      )}
                    </Picker.Item>
                  ))}
                </Picker.Column>
              </Picker>
            </div>

            <div className="flex gap-2 w-full max-w-xs">
              <Button variant="outline" className="flex-1" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button className="flex-1" onClick={handleConfirm}>
                Done
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
