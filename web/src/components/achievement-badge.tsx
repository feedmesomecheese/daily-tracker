"use client";

import { cn } from "@/lib/utils";

export type AchievementBadgeProps = {
  icon: string;
  name: string;
  description: string;
  tier: number;
  earned: boolean;
  earnedAt?: string;
  metricName?: string | null;
  size?: "sm" | "md" | "lg";
  onClick?: () => void;
};

const TIER_COLORS: Record<number, string> = {
  1: "from-gray-400 to-gray-500",
  2: "from-green-400 to-green-600",
  3: "from-blue-400 to-blue-600",
  4: "from-purple-400 to-purple-600",
  5: "from-yellow-400 to-yellow-600",
};

const TIER_BORDER: Record<number, string> = {
  1: "border-gray-400",
  2: "border-green-500",
  3: "border-blue-500",
  4: "border-purple-500",
  5: "border-yellow-500",
};

export function AchievementBadge({
  icon,
  name,
  description,
  tier,
  earned,
  earnedAt,
  metricName,
  size = "md",
  onClick,
}: AchievementBadgeProps) {
  const sizeClasses = {
    sm: "w-12 h-12 text-xl",
    md: "w-16 h-16 text-2xl",
    lg: "w-24 h-24 text-4xl",
  };

  const tierColor = TIER_COLORS[tier] || TIER_COLORS[1];
  const tierBorder = TIER_BORDER[tier] || TIER_BORDER[1];

  return (
    <div
      className={cn(
        "flex flex-col items-center gap-2 p-3 rounded-lg transition-all",
        earned ? "opacity-100" : "opacity-40 grayscale",
        onClick && "cursor-pointer hover:bg-muted"
      )}
      onClick={onClick}
    >
      <div
        className={cn(
          "rounded-full flex items-center justify-center border-2",
          sizeClasses[size],
          tierBorder,
          earned && `bg-gradient-to-br ${tierColor}`
        )}
        style={{
          backgroundColor: earned ? undefined : "var(--muted)",
        }}
      >
        <span role="img" aria-label={name}>
          {icon}
        </span>
      </div>
      <div className="text-center">
        <div className="font-medium text-sm">{name}</div>
        <div className="text-xs text-muted-foreground max-w-[120px]">
          {description}
        </div>
        {earned && metricName && (
          <div className="text-xs text-muted-foreground mt-1">
            for {metricName}
          </div>
        )}
        {earned && earnedAt && (
          <div className="text-[10px] text-muted-foreground/60 mt-0.5">
            {new Date(earnedAt).toLocaleDateString()}
          </div>
        )}
      </div>
    </div>
  );
}

export function AchievementBadgeCompact({
  icon,
  name,
  tier,
  earned,
}: Pick<AchievementBadgeProps, "icon" | "name" | "tier" | "earned">) {
  const tierColor = TIER_COLORS[tier] || TIER_COLORS[1];
  const tierBorder = TIER_BORDER[tier] || TIER_BORDER[1];

  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs",
        earned ? "opacity-100" : "opacity-40 grayscale",
        earned && `bg-gradient-to-r ${tierColor} text-white`,
        !earned && "bg-muted"
      )}
      title={name}
    >
      <span role="img" aria-label={name} className="text-sm">
        {icon}
      </span>
      <span className="font-medium">{name}</span>
    </div>
  );
}
