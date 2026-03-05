"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  );
}
