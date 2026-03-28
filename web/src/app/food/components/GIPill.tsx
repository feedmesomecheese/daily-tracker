// GI pill badge — shows glycemic index number color-coded by category.
// Low < 55 (green), Medium 55–69 (amber), High ≥ 70 (red).

interface Props {
  gi: number;
}

export function GIPill({ gi }: Props) {
  const label = gi < 55 ? "Low" : gi <= 69 ? "Medium" : "High";
  const colorClass =
    gi < 55
      ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400"
      : gi <= 69
      ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400"
      : "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400";

  return (
    <span
      title={`Glycemic Index: ${gi} · ${label} (Low <55, Medium 55–69, High ≥70)`}
      className={`inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded-full shrink-0 cursor-default select-none ${colorClass}`}
    >
      GI {gi}
    </span>
  );
}
