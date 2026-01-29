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
 * Analog Clock Face for time-of-day selection (24-hour format)
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
  const size = 240;
  const center = size / 2;
  const radius = size / 2 - 20;

  // Convert angle to value
  const angleToValue = useCallback((angle: number, isHour: boolean) => {
    // Adjust angle (0 is top, clockwise)
    let adjustedAngle = (angle + 90) % 360;
    if (adjustedAngle < 0) adjustedAngle += 360;

    if (isHour) {
      // 12 hours per circle, each 30 degrees
      let h = Math.round(adjustedAngle / 30) % 12;
      return h;
    } else {
      // 60 minutes per circle, each 6 degrees
      let m = Math.round(adjustedAngle / 6) % 60;
      return m;
    }
  }, []);

  // Handle click/touch on clock face
  const handleInteraction = useCallback((clientX: number, clientY: number) => {
    if (!svgRef.current) return;

    const rect = svgRef.current.getBoundingClientRect();
    const x = clientX - rect.left - center;
    const y = clientY - rect.top - center;

    const angle = Math.atan2(y, x) * (180 / Math.PI);

    if (mode === "hour") {
      const h = angleToValue(angle, true);
      onHourChange(h);
    } else {
      const m = angleToValue(angle, false);
      onMinuteChange(m);
    }
  }, [mode, angleToValue, onHourChange, onMinuteChange, center]);

  const handleClick = (e: React.MouseEvent<SVGSVGElement>) => {
    handleInteraction(e.clientX, e.clientY);
  };

  const handleTouchMove = (e: React.TouchEvent<SVGSVGElement>) => {
    if (e.touches.length > 0) {
      handleInteraction(e.touches[0].clientX, e.touches[0].clientY);
    }
  };

  // Calculate hand angle
  const hourAngle = ((hour % 12) / 12) * 360 - 90;
  const minuteAngle = (minute / 60) * 360 - 90;
  const activeAngle = mode === "hour" ? hourAngle : minuteAngle;

  // Generate hour/minute markers
  const markers = mode === "hour"
    ? Array.from({ length: 12 }, (_, i) => i)
    : [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Mode toggle */}
      <div className="flex gap-2">
        <Button
          variant={mode === "hour" ? "default" : "outline"}
          size="sm"
          onClick={() => onModeChange("hour")}
        >
          Hour: {String(hour).padStart(2, "0")}
        </Button>
        <Button
          variant={mode === "minute" ? "default" : "outline"}
          size="sm"
          onClick={() => onModeChange("minute")}
        >
          Min: {String(minute).padStart(2, "0")}
        </Button>
      </div>

      {/* Clock face */}
      <svg
        ref={svgRef}
        width={size}
        height={size}
        className="touch-none select-none"
        onClick={handleClick}
        onTouchMove={handleTouchMove}
        onTouchStart={(e) => handleInteraction(e.touches[0].clientX, e.touches[0].clientY)}
      >
        {/* Clock circle */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="text-border"
        />

        {/* Markers */}
        {markers.map((val) => {
          const angle = (mode === "hour" ? (val / 12) * 360 : (val / 60) * 360) - 90;
          const rad = (angle * Math.PI) / 180;
          const markerRadius = radius - 25;
          const x = center + Math.cos(rad) * markerRadius;
          const y = center + Math.sin(rad) * markerRadius;
          const isSelected = mode === "hour" ? val === hour % 12 : val === minute;

          return (
            <g key={val}>
              <circle
                cx={x}
                cy={y}
                r={isSelected ? 18 : 16}
                className={isSelected ? "fill-primary" : "fill-muted"}
              />
              <text
                x={x}
                y={y}
                textAnchor="middle"
                dominantBaseline="central"
                className={`text-sm font-medium ${isSelected ? "fill-primary-foreground" : "fill-foreground"}`}
              >
                {mode === "hour" ? (val === 0 ? "12" : val) : val}
              </text>
            </g>
          );
        })}

        {/* Clock hand */}
        <line
          x1={center}
          y1={center}
          x2={center + Math.cos((activeAngle * Math.PI) / 180) * (radius - 45)}
          y2={center + Math.sin((activeAngle * Math.PI) / 180) * (radius - 45)}
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          className="text-primary"
        />

        {/* Center dot */}
        <circle cx={center} cy={center} r={6} className="fill-primary" />
      </svg>

      {/* AM/PM toggle for 24h */}
      <div className="flex gap-2">
        <Button
          variant={hour < 12 ? "default" : "outline"}
          size="sm"
          onClick={() => onHourChange(hour % 12)}
        >
          AM
        </Button>
        <Button
          variant={hour >= 12 ? "default" : "outline"}
          size="sm"
          onClick={() => onHourChange((hour % 12) + 12)}
        >
          PM
        </Button>
      </div>

      {/* Current time display */}
      <div className="text-2xl font-mono font-semibold">
        {String(hour).padStart(2, "0")}:{String(minute).padStart(2, "0")}
      </div>
    </div>
  );
}

/**
 * TimeOfDayPickerField - tap to open analog clock picker (24-hour)
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
        <span className="text-muted-foreground">🕐</span>
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="h-auto max-h-[85vh]">
          <div className="flex flex-col items-center gap-4 py-4">
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
 * DurationPickerField - tap to open duration wheel picker
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
  const minutes = useMemo(() => Array.from({ length: 60 }, (_, i) => i), []);

  const currentHour = value != null ? Math.min(Math.floor(value / 60), maxHours) : 0;
  const currentMinute = value != null ? value % 60 : 0;

  const [pickerValue, setPickerValue] = useState({
    hour: currentHour,
    minute: currentMinute,
  });

  // Reset to current value when opening
  const handleOpen = () => {
    setPickerValue({
      hour: currentHour,
      minute: currentMinute,
    });
    setOpen(true);
  };

  const handleConfirm = () => {
    onChange(pickerValue.hour * 60 + pickerValue.minute);
    setOpen(false);
  };

  const totalMinutes = pickerValue.hour * 60 + pickerValue.minute;

  const displayValue = value != null
    ? `${Math.floor(value / 60)}h ${value % 60}m`
    : "Set duration";

  return (
    <>
      <button type="button" onClick={handleOpen} className={`${fieldButtonClass} ${className || ""}`}>
        <span className={value == null ? "text-muted-foreground" : ""}>{displayValue}</span>
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
                  {minutes.map((m) => (
                    <Picker.Item key={m} value={m}>
                      {({ selected }) => (
                        <div className={`${pickerItemClass} ${selected ? pickerItemSelectedClass : pickerItemUnselectedClass}`}>
                          {m}m
                        </div>
                      )}
                    </Picker.Item>
                  ))}
                </Picker.Column>
              </Picker>
            </div>

            <div className="text-sm text-muted-foreground">
              Total: {totalMinutes} minutes
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
