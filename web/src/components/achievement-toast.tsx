"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export type AchievementToastData = {
  id: string;
  icon: string;
  name: string;
  description: string;
  tier: number;
  metricName?: string | null;
};

export type AchievementToastProps = {
  achievement: AchievementToastData;
  onDismiss: () => void;
};

const TIER_COLORS: Record<number, string> = {
  1: "from-gray-400 to-gray-500",
  2: "from-green-400 to-green-600",
  3: "from-blue-400 to-blue-600",
  4: "from-purple-400 to-purple-600",
  5: "from-yellow-400 to-yellow-600",
};

export function AchievementToast({ achievement, onDismiss }: AchievementToastProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    // Animate in
    requestAnimationFrame(() => setIsVisible(true));

    // Auto dismiss after 5 seconds
    const timer = setTimeout(() => {
      setIsExiting(true);
      setTimeout(onDismiss, 300);
    }, 5000);

    return () => clearTimeout(timer);
  }, [onDismiss]);

  const tierColor = TIER_COLORS[achievement.tier] || TIER_COLORS[1];

  return (
    <div
      className={cn(
        "fixed bottom-4 right-4 z-50 transition-all duration-300 ease-out",
        isVisible && !isExiting
          ? "translate-y-0 opacity-100"
          : "translate-y-4 opacity-0"
      )}
    >
      <div
        className={cn(
          "flex items-center gap-4 p-4 rounded-lg shadow-lg border bg-background",
          "max-w-sm"
        )}
      >
        <div
          className={cn(
            "w-14 h-14 rounded-full flex items-center justify-center text-2xl",
            `bg-gradient-to-br ${tierColor}`
          )}
        >
          {achievement.icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold text-primary uppercase tracking-wide">
            Achievement Unlocked!
          </div>
          <div className="font-bold text-lg">{achievement.name}</div>
          <div className="text-sm text-muted-foreground">
            {achievement.description}
            {achievement.metricName && (
              <span className="text-primary"> ({achievement.metricName})</span>
            )}
          </div>
        </div>
        <button
          onClick={() => {
            setIsExiting(true);
            setTimeout(onDismiss, 300);
          }}
          className="text-muted-foreground hover:text-foreground p-1"
        >
          &times;
        </button>
      </div>
    </div>
  );
}

// Container to show multiple achievements in sequence
export function AchievementToastContainer({
  achievements,
  onDismissAll,
}: {
  achievements: AchievementToastData[];
  onDismissAll: () => void;
}) {
  const [currentIndex, setCurrentIndex] = useState(0);

  const handleDismiss = () => {
    if (currentIndex < achievements.length - 1) {
      setCurrentIndex((i) => i + 1);
    } else {
      onDismissAll();
    }
  };

  if (achievements.length === 0) return null;

  return (
    <AchievementToast
      key={achievements[currentIndex].id}
      achievement={achievements[currentIndex]}
      onDismiss={handleDismiss}
    />
  );
}
