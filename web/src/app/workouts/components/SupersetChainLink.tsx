"use client";

import { cn } from "@/lib/utils";

type SupersetChainLinkProps = {
  active: boolean;
  onClick: () => void;
};

export default function SupersetChainLink({ active, onClick }: SupersetChainLinkProps) {
  return (
    <div className="flex items-center justify-center h-6 -my-1">
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "flex items-center gap-1 px-2 py-0.5 rounded text-xs transition-colors",
          active
            ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
            : "text-muted-foreground hover:text-foreground hover:bg-muted"
        )}
        title={active ? "Unlink superset" : "Link as superset"}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
        </svg>
        {active ? "Linked" : "Link"}
      </button>
    </div>
  );
}
