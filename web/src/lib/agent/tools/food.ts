import { AgentInputError, type AgentTool } from "../types";

const MAX_ITEMS_PER_CALL = 60;

const getFoodLog: AgentTool = {
  name: "getFoodLog",
  path: "/api/ai/food",
  method: "GET",
  readOnly: true,
  summary: "Get food/nutrition log",
  description:
    "Returns daily food logs with per-meal macro breakdowns (calories, protein, fat, carbs, fiber). Only days with logged food are included — gaps do not mean the user didn't eat.",
  responseDescription: "Food log with daily and meal-level macro breakdowns",
  inputSchema: {
    type: "object",
    properties: {
      start: { type: "string", format: "date", description: "Start date in YYYY-MM-DD format." },
      end: { type: "string", format: "date", description: "End date in YYYY-MM-DD format (default: today)" },
      days: {
        type: "integer",
        description:
          "Number of days to look back from end (default 30, max 3650). Ignored if start is provided.",
        default: 30,
        minimum: 1,
        maximum: 3650,
      },
    },
  },
  handler: async (ctx, input) => {
    const today = new Date().toISOString().slice(0, 10);
    const end = (input.end as string) || today;

    let start = (input.start as string) || "";
    if (!start) {
      const days = Math.min((input.days as number) ?? 30, 3650);
      const startDate = new Date(end);
      startDate.setDate(startDate.getDate() - days + 1);
      start = startDate.toISOString().slice(0, 10);
    }

    const { data: logs, error: logsErr } = await ctx.supabase
      .from("food_logs")
      .select("id, date, is_fasted, notes")
      .eq("owner_id", ctx.ownerId)
      .gte("date", start)
      .lte("date", end)
      .order("date", { ascending: false });

    if (logsErr) throw new Error(logsErr.message);
    if (!logs || logs.length === 0) {
      return {
        period: { start, end },
        note: "No food logs found for this period.",
        days: [],
      };
    }

    const logIds = logs.map((l) => l.id);

    const { data: meals, error: mealsErr } = await ctx.supabase
      .from("food_log_meals")
      .select("id, food_log_id, meal_name, meal_order")
      .in("food_log_id", logIds)
      .order("meal_order", { ascending: true });

    if (mealsErr) throw new Error(mealsErr.message);

    const mealIds = (meals || []).map((m) => m.id);

    type ItemRow = {
      food_log_meal_id: string;
      calories: number | null;
      protein: number | null;
      fat: number | null;
      carbs: number | null;
      fiber: number | null;
    };
    const allItems: ItemRow[] = [];
    const CHUNK = 200;
    for (let i = 0; i < mealIds.length; i += CHUNK) {
      const chunk = mealIds.slice(i, i + CHUNK);
      const { data, error } = await ctx.supabase
        .from("food_log_items")
        .select("food_log_meal_id, calories, protein, fat, carbs, fiber")
        .in("food_log_meal_id", chunk);
      if (error) throw new Error(error.message);
      if (data) allItems.push(...(data as ItemRow[]));
    }

    type MacroTotals = { calories: number; protein: number; fat: number; carbs: number; fiber: number };
    const mealTotals = new Map<string, MacroTotals>();
    for (const item of allItems) {
      if (!mealTotals.has(item.food_log_meal_id)) {
        mealTotals.set(item.food_log_meal_id, { calories: 0, protein: 0, fat: 0, carbs: 0, fiber: 0 });
      }
      const t = mealTotals.get(item.food_log_meal_id)!;
      t.calories += item.calories ?? 0;
      t.protein += item.protein ?? 0;
      t.fat += item.fat ?? 0;
      t.carbs += item.carbs ?? 0;
      t.fiber += item.fiber ?? 0;
    }

    type MealRow = { id: string; food_log_id: string; meal_name: string; meal_order: number };
    const mealsByLog = new Map<string, MealRow[]>();
    for (const meal of (meals || []) as MealRow[]) {
      if (!mealsByLog.has(meal.food_log_id)) mealsByLog.set(meal.food_log_id, []);
      mealsByLog.get(meal.food_log_id)!.push(meal);
    }

    const round = (n: number) => Math.round(n * 10) / 10;

    const days = logs.map((log) => {
      const logMeals = mealsByLog.get(log.id) || [];
      const mealSummaries = logMeals.map((meal) => {
        const t = mealTotals.get(meal.id) ?? { calories: 0, protein: 0, fat: 0, carbs: 0, fiber: 0 };
        return {
          meal: meal.meal_name,
          calories: round(t.calories),
          protein_g: round(t.protein),
          fat_g: round(t.fat),
          carbs_g: round(t.carbs),
          fiber_g: round(t.fiber),
        };
      });

      const totals = mealSummaries.reduce(
        (acc, m) => ({
          calories: acc.calories + m.calories,
          protein_g: acc.protein_g + m.protein_g,
          fat_g: acc.fat_g + m.fat_g,
          carbs_g: acc.carbs_g + m.carbs_g,
          fiber_g: acc.fiber_g + m.fiber_g,
        }),
        { calories: 0, protein_g: 0, fat_g: 0, carbs_g: 0, fiber_g: 0 }
      );

      return {
        date: log.date,
        is_fasted: log.is_fasted,
        notes: log.notes,
        totals,
        meals: mealSummaries,
      };
    });

    return {
      period: { start, end },
      note: "Only days with logged food are included. Gaps do not mean the user didn't eat — they may have continued eating similarly to their last logged day.",
      days,
    };
  },
};

const logFood: AgentTool = {
  name: "logFood",
  path: "/api/ai/food",
  method: "POST",
  readOnly: false,
  summary: "Record food eaten",
  description:
    "Adds food items to a meal on a given date, creating the day's food log and the meal if they do not exist yet. Items are appended — an existing meal keeps what is already in it. Macros are taken as given; there is no food database lookup on this path.",
  responseDescription: "The meal written to, and the items added",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["date", "meal", "items"],
    properties: {
      date: { type: "string", format: "date", description: "Date of the meal in YYYY-MM-DD format." },
      meal: {
        type: "string",
        description:
          "Meal name, e.g. \"Breakfast\" or \"Meal 1\". Matched case-insensitively against existing meals on that date; created if absent.",
      },
      notes: { type: "string", description: "Notes to set on the day's food log." },
      items: {
        type: "array",
        description: `Food items to add to the meal. Maximum ${MAX_ITEMS_PER_CALL} per call.`,
        items: {
          type: "object",
          required: ["name"],
          properties: {
            name: { type: "string", description: "Food name, e.g. \"Greek yogurt\"." },
            serving: { type: "string", description: "Serving description, e.g. \"1 cup\" or \"200g\"." },
            qty: { type: "number", description: "Number of servings (default 1).", default: 1, minimum: 0 },
            calories: { type: "number", description: "Calories for the stated quantity.", minimum: 0 },
            protein: { type: "number", description: "Protein in grams.", minimum: 0 },
            fat: { type: "number", description: "Fat in grams.", minimum: 0 },
            carbs: { type: "number", description: "Carbohydrates in grams.", minimum: 0 },
            fiber: { type: "number", description: "Fiber in grams.", minimum: 0 },
          },
        },
      },
    },
  },
  handler: async (ctx, input) => {
    const date = input.date as string;
    const mealName = String(input.meal).trim();
    const items = (input.items ?? []) as Array<Record<string, unknown>>;

    if (items.length === 0) {
      throw new AgentInputError("items must contain at least one entry");
    }
    if (items.length > MAX_ITEMS_PER_CALL) {
      throw new AgentInputError(
        `Too many items in one call (${items.length}). Maximum is ${MAX_ITEMS_PER_CALL}.`
      );
    }

    // 1. Find or create the day's food log.
    const { data: existingLog, error: logErr } = await ctx.supabase
      .from("food_logs")
      .select("id, date")
      .eq("owner_id", ctx.ownerId)
      .eq("date", date)
      .maybeSingle();

    if (logErr) throw new Error(logErr.message);

    let logId: string;
    let createdLog = false;

    if (existingLog) {
      logId = existingLog.id;
      if (typeof input.notes === "string" && input.notes.trim()) {
        await ctx.supabase
          .from("food_logs")
          .update({ notes: input.notes.trim(), updated_at: new Date().toISOString() })
          .eq("id", logId)
          .eq("owner_id", ctx.ownerId);
      }
    } else {
      const { data: newLog, error: insertErr } = await ctx.supabase
        .from("food_logs")
        .insert({
          owner_id: ctx.ownerId,
          date,
          notes: typeof input.notes === "string" ? input.notes.trim() || null : null,
          is_submitted: false,
        })
        .select("id")
        .single();

      if (insertErr || !newLog) throw new Error(insertErr?.message ?? "Could not create food log");
      logId = newLog.id;
      createdLog = true;
    }

    // 2. Find or create the meal.
    const { data: existingMeals, error: mealsErr } = await ctx.supabase
      .from("food_log_meals")
      .select("id, meal_name, meal_order")
      .eq("food_log_id", logId)
      .order("meal_order", { ascending: true });

    if (mealsErr) throw new Error(mealsErr.message);

    const meals = (existingMeals ?? []) as { id: string; meal_name: string; meal_order: number }[];
    let meal = meals.find((m) => m.meal_name.trim().toLowerCase() === mealName.toLowerCase());
    let createdMeal = false;

    if (!meal) {
      const nextOrder = meals.length > 0 ? Math.max(...meals.map((m) => m.meal_order)) + 1 : 1;
      const { data: newMeal, error: mealInsertErr } = await ctx.supabase
        .from("food_log_meals")
        .insert({ food_log_id: logId, meal_name: mealName, meal_order: nextOrder })
        .select("id, meal_name, meal_order")
        .single();

      if (mealInsertErr || !newMeal) {
        throw new Error(mealInsertErr?.message ?? "Could not create meal");
      }
      meal = newMeal as { id: string; meal_name: string; meal_order: number };
      createdMeal = true;
    }

    // 3. Append the items after whatever is already in the meal.
    const { data: lastItem } = await ctx.supabase
      .from("food_log_items")
      .select("sort_order")
      .eq("food_log_meal_id", meal.id)
      .order("sort_order", { ascending: false })
      .limit(1);

    const baseSort = lastItem && lastItem.length > 0 ? lastItem[0].sort_order + 1 : 0;

    const rows = items.map((item, i) => ({
      food_log_meal_id: meal!.id,
      food_item_id: null,
      food_item_serving_id: null,
      food_name_snapshot: String(item.name).trim(),
      serving_label_snapshot: typeof item.serving === "string" ? item.serving.trim() || null : null,
      qty: item.qty === undefined ? 1 : Number(item.qty),
      calories: Number(item.calories ?? 0),
      fat: Number(item.fat ?? 0),
      carbs: Number(item.carbs ?? 0),
      protein: Number(item.protein ?? 0),
      fiber: Number(item.fiber ?? 0),
      sort_order: baseSort + i,
    }));

    const { data: created, error: itemsErr } = await ctx.supabase
      .from("food_log_items")
      .insert(rows)
      .select("id, food_name_snapshot, qty, calories, protein, fat, carbs, fiber");

    if (itemsErr) throw new Error(itemsErr.message);

    const added = created ?? [];
    const totals = added.reduce(
      (acc, i) => ({
        calories: acc.calories + (i.calories ?? 0),
        protein_g: acc.protein_g + (i.protein ?? 0),
        fat_g: acc.fat_g + (i.fat ?? 0),
        carbs_g: acc.carbs_g + (i.carbs ?? 0),
        fiber_g: acc.fiber_g + (i.fiber ?? 0),
      }),
      { calories: 0, protein_g: 0, fat_g: 0, carbs_g: 0, fiber_g: 0 }
    );

    return {
      date,
      meal: meal.meal_name,
      created_food_log: createdLog,
      created_meal: createdMeal,
      items_added: added.length,
      added_totals: totals,
      items: added,
    };
  },
};

export const foodTools: AgentTool[] = [getFoodLog, logFood];
