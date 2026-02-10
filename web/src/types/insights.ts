export type InsightType =
  | "trend"
  | "day_of_week"
  | "numeric_numeric"
  | "checkbox_numeric"
  | "checkbox_checkbox"
  | "time_lagged"
  | "histogram"
  | "cumulative"
  | "year_over_year"
  | "streak_timeline"
  | "candlestick";

export type Metric = {
  metric_id: string;
  metric_name: string | null;
  type: string;
  private: boolean | null;
  is_calculated: boolean | null;
  calc_expr: string | null;
  analytics_config: {
    higher_is_better?: boolean;
  } | null;
};

export type LogRow = {
  metric_id: string;
  date: string;
  value: number | null;
};

export type CorrelationInsight = {
  type: "checkbox_numeric";
  id: string;
  checkboxMetricId: string;
  checkboxMetricName: string;
  numericMetricId: string;
  numericMetricName: string;
  avgWhenTrue: number;
  avgWhenFalse: number;
  percentDiff: number;
  daysTrue: number;
  daysFalse: number;
  direction: "higher" | "lower";
  involvesPrivate: boolean;
  numericHigherIsBetter: boolean;
};

export type CheckboxCheckboxInsight = {
  type: "checkbox_checkbox";
  id: string;
  metricAId: string;
  metricAName: string;
  metricBId: string;
  metricBName: string;
  rateWhenATrue: number;
  rateWhenAFalse: number;
  percentDiff: number;
  daysATrue: number;
  daysAFalse: number;
  involvesPrivate: boolean;
};

export type NumericNumericInsight = {
  type: "numeric_numeric";
  id: string;
  metricAId: string;
  metricAName: string;
  metricBId: string;
  metricBName: string;
  correlation: number;
  direction: "positive" | "negative";
  daysOverlap: number;
  involvesPrivate: boolean;
  metricAHigherIsBetter: boolean;
  metricBHigherIsBetter: boolean;
};

export type TimeLaggedInsight = {
  type: "time_lagged";
  id: string;
  triggerMetricId: string;
  triggerMetricName: string;
  outcomeMetricId: string;
  outcomeMetricName: string;
  avgNextDayWhenTrue: number;
  avgNextDayWhenFalse: number;
  percentDiff: number;
  direction: "higher" | "lower";
  daysTrue: number;
  daysFalse: number;
  involvesPrivate: boolean;
  outcomeHigherIsBetter: boolean;
};

export type DayOfWeekInsight = {
  type: "day_of_week";
  id: string;
  metricId: string;
  metricName: string;
  metricType: string;
  bestDay: string;
  worstDay: string;
  bestAvg: number;
  worstAvg: number;
  overallAvg: number;
  dayAverages: { day: string; avg: number }[];
  involvesPrivate: boolean;
  higherIsBetter: boolean;
};

export type TrendInsight = {
  type: "trend";
  id: string;
  metricId: string;
  metricName: string;
  metricType: string;
  recentAvg: number;
  priorAvg: number;
  percentChange: number;
  direction: "up" | "down";
  recentDays: number;
  priorDays: number;
  involvesPrivate: boolean;
  higherIsBetter: boolean;
};

export type HistogramInsight = {
  type: "histogram";
  id: string;
  metricId: string;
  metricName: string;
  metricType: string;
  mean: number;
  stdDev: number;
  count: number;
  involvesPrivate: boolean;
  higherIsBetter: boolean;
};

export type CumulativeInsight = {
  type: "cumulative";
  id: string;
  metricId: string;
  metricName: string;
  metricType: string;
  currentTotal: number;
  dailyRate: number;
  projectedYearEnd: number;
  involvesPrivate: boolean;
  higherIsBetter: boolean;
};

export type YearOverYearInsight = {
  type: "year_over_year";
  id: string;
  metricId: string;
  metricName: string;
  metricType: string;
  yearRange: string;
  currentYearAvg: number;
  priorYearAvg: number;
  percentChange: number;
  involvesPrivate: boolean;
  higherIsBetter: boolean;
};

export type StreakTimelineInsight = {
  type: "streak_timeline";
  id: string;
  metricId: string;
  metricName: string;
  metricType: string;
  currentStreak: number;
  longestStreak: number;
  averageStreak: number;
  isCheckbox: boolean;
  involvesPrivate: boolean;
  higherIsBetter: boolean;
};

export type CandlestickInsight = {
  type: "candlestick";
  id: string;
  metricId: string;
  metricName: string;
  metricType: string;
  recentRange: number;
  recentClose: number;
  volatility: number;
  involvesPrivate: boolean;
  higherIsBetter: boolean;
};

export type InsightsResponse = {
  checkboxNumeric: CorrelationInsight[];
  checkboxCheckbox: CheckboxCheckboxInsight[];
  numericNumeric: NumericNumericInsight[];
  timeLagged: TimeLaggedInsight[];
  dayOfWeek: DayOfWeekInsight[];
  trends: TrendInsight[];
  histograms: HistogramInsight[];
  cumulative: CumulativeInsight[];
  yearOverYear: YearOverYearInsight[];
  streakTimelines: StreakTimelineInsight[];
  candlesticks: CandlestickInsight[];
  totalDays: number;
  dateRange: { first: string; last: string } | null;
};

export type CustomInsightConfig = {
  id: string;
  metricId: string;
  metricName: string;
  chartType: InsightType;
  label?: string;
  options?: {
    period?: "weekly" | "monthly";
    threshold?: number;
    bins?: number;
    dateRange?: { start?: string; end?: string };
  };
  createdAt: number;
};
