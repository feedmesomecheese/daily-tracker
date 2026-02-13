"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import Link from "next/link";

type WorkoutType = {
  id: string;
  name: string;
  group_ids: string[];
};

type WorkoutTypeSelectorProps = {
  types: WorkoutType[];
  value: string;
  onChange: (typeId: string) => void;
};

export default function WorkoutTypeSelector({ types, value, onChange }: WorkoutTypeSelectorProps) {
  return (
    <div className="flex items-center gap-2">
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="w-[200px] h-9">
          <SelectValue placeholder="Select type..." />
        </SelectTrigger>
        <SelectContent>
          {types.map((t) => (
            <SelectItem key={t.id} value={t.id}>
              {t.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Link
        href="/workouts/exercises"
        className="text-xs text-muted-foreground hover:text-foreground underline"
      >
        Manage types
      </Link>
    </div>
  );
}
