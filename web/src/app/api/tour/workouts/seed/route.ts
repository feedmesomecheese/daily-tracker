import { NextResponse } from "next/server";
import { supabaseServerFromRequest } from "@/lib/supabaseServer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getServerTimezone, getLocalDateString, addDays } from "@/lib/dateUtils";
import { randomUUID } from "crypto";

export async function POST(req: Request) {
  try {
    const supabase = supabaseServerFromRequest(req);
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const tz = await getServerTimezone();
    const today = getLocalDateString(new Date(), tz);

    // Pre-generate all IDs so we can build FK references before inserting
    const gIds = {
      chest:     randomUUID(),
      back:      randomUUID(),
      shoulders: randomUUID(),
      arms:      randomUUID(),
      legs:      randomUUID(),
    };
    const mIds = {
      paused:    randomUUID(),
      wideGrip:  randomUUID(),
      closeGrip: randomUUID(),
    };
    const eIds = {
      benchPress:      randomUUID(),
      inclinePress:    randomUUID(),
      pullup:          randomUUID(),
      barbellRow:      randomUUID(),
      shoulderPress:   randomUUID(),
      lateralRaise:    randomUUID(),
      bicepCurl:       randomUUID(),
      tricepPushdown:  randomUUID(),
      squat:           randomUUID(),
      rdl:             randomUUID(),
    };
    const tIds = {
      push: randomUUID(),
      pull: randomUUID(),
      legs: randomUUID(),
    };

    // ── 1. Exercise Groups ──
    const groupRows = [
      { id: gIds.chest,     owner_id: user.id, name: "Chest",     input_type: "strength", sort_order: 9900, is_archived: false },
      { id: gIds.back,      owner_id: user.id, name: "Back",      input_type: "strength", sort_order: 9901, is_archived: false },
      { id: gIds.shoulders, owner_id: user.id, name: "Shoulders", input_type: "strength", sort_order: 9902, is_archived: false },
      { id: gIds.arms,      owner_id: user.id, name: "Arms",      input_type: "strength", sort_order: 9903, is_archived: false },
      { id: gIds.legs,      owner_id: user.id, name: "Legs",      input_type: "strength", sort_order: 9904, is_archived: false },
    ];

    // ── 2. Modifiers ──
    const modifierRows = [
      { id: mIds.paused,    owner_id: user.id, name: "Paused",     adjective_order: 9900 },
      { id: mIds.wideGrip,  owner_id: user.id, name: "Wide Grip",  adjective_order: 9901 },
      { id: mIds.closeGrip, owner_id: user.id, name: "Close Grip", adjective_order: 9902 },
    ];

    // ── 3. Exercises ──
    const exerciseRows = [
      { id: eIds.benchPress,     owner_id: user.id, name: "Bench Press",       exercise_type: "weighted",    measure_type: "srw", counts_toward_volume: true,  group_ids: [gIds.chest],     available_modifier_ids: [mIds.paused, mIds.wideGrip, mIds.closeGrip], muscle_groups: [], aliases: [], is_archived: false, sort_order: 9900 },
      { id: eIds.inclinePress,   owner_id: user.id, name: "Incline Press",     exercise_type: "weighted",    measure_type: "srw", counts_toward_volume: true,  group_ids: [gIds.chest],     available_modifier_ids: [mIds.paused, mIds.wideGrip],                  muscle_groups: [], aliases: [], is_archived: false, sort_order: 9901 },
      { id: eIds.pullup,         owner_id: user.id, name: "Pull-up",           exercise_type: "bodyweight",  measure_type: "srw", counts_toward_volume: false, group_ids: [gIds.back],      available_modifier_ids: [mIds.wideGrip, mIds.closeGrip],               muscle_groups: [], aliases: [], is_archived: false, sort_order: 9902 },
      { id: eIds.barbellRow,     owner_id: user.id, name: "Barbell Row",       exercise_type: "weighted",    measure_type: "srw", counts_toward_volume: true,  group_ids: [gIds.back],      available_modifier_ids: [mIds.paused, mIds.wideGrip, mIds.closeGrip], muscle_groups: [], aliases: [], is_archived: false, sort_order: 9903 },
      { id: eIds.shoulderPress,  owner_id: user.id, name: "Shoulder Press",    exercise_type: "weighted",    measure_type: "srw", counts_toward_volume: true,  group_ids: [gIds.shoulders], available_modifier_ids: [mIds.paused],                                  muscle_groups: [], aliases: [], is_archived: false, sort_order: 9904 },
      { id: eIds.lateralRaise,   owner_id: user.id, name: "Lateral Raise",     exercise_type: "weighted",    measure_type: "srw", counts_toward_volume: true,  group_ids: [gIds.shoulders], available_modifier_ids: [],                                            muscle_groups: [], aliases: [], is_archived: false, sort_order: 9905 },
      { id: eIds.bicepCurl,      owner_id: user.id, name: "Bicep Curl",        exercise_type: "weighted",    measure_type: "srw", counts_toward_volume: true,  group_ids: [gIds.arms],      available_modifier_ids: [mIds.wideGrip, mIds.closeGrip],               muscle_groups: [], aliases: [], is_archived: false, sort_order: 9906 },
      { id: eIds.tricepPushdown, owner_id: user.id, name: "Tricep Pushdown",   exercise_type: "weighted",    measure_type: "srw", counts_toward_volume: true,  group_ids: [gIds.arms],      available_modifier_ids: [],                                            muscle_groups: [], aliases: [], is_archived: false, sort_order: 9907 },
      { id: eIds.squat,          owner_id: user.id, name: "Squat",             exercise_type: "weighted",    measure_type: "srw", counts_toward_volume: true,  group_ids: [gIds.legs],      available_modifier_ids: [mIds.paused, mIds.wideGrip],                  muscle_groups: [], aliases: [], is_archived: false, sort_order: 9908 },
      { id: eIds.rdl,            owner_id: user.id, name: "Romanian Deadlift", exercise_type: "weighted",    measure_type: "srw", counts_toward_volume: true,  group_ids: [gIds.legs],      available_modifier_ids: [],                                            muscle_groups: [], aliases: [], is_archived: false, sort_order: 9909 },
    ];

    // ── 4. Workout Types ──
    const typeRows = [
      { id: tIds.push, owner_id: user.id, name: "Push Day", group_ids: [gIds.chest, gIds.shoulders, gIds.arms], sort_order: 9900, is_archived: false },
      { id: tIds.pull, owner_id: user.id, name: "Pull Day", group_ids: [gIds.back, gIds.arms],                  sort_order: 9901, is_archived: false },
      { id: tIds.legs, owner_id: user.id, name: "Leg Day",  group_ids: [gIds.legs],                             sort_order: 9902, is_archived: false },
    ];

    // Insert infrastructure — groups & modifiers in parallel, then exercises & types
    const [groupErr, modErr] = await Promise.all([
      supabaseAdmin.from("exercise_groups").insert(groupRows).then(r => r.error),
      supabaseAdmin.from("exercise_modifiers").insert(modifierRows).then(r => r.error),
    ]);
    if (groupErr) throw new Error("Groups insert failed: " + groupErr.message);
    if (modErr)   throw new Error("Modifiers insert failed: " + modErr.message);

    const [exErr, typeErr] = await Promise.all([
      supabaseAdmin.from("exercises").insert(exerciseRows).then(r => r.error),
      supabaseAdmin.from("workout_types").insert(typeRows).then(r => r.error),
    ]);
    if (exErr)   throw new Error("Exercises insert failed: " + exErr.message);
    if (typeErr) throw new Error("Types insert failed: " + typeErr.message);

    // ── 5. Workout Sessions ──
    const wIds = Array.from({ length: 6 }, () => randomUUID());

    const workoutRows = [
      { id: wIds[0], owner_id: user.id, date: addDays(today, -13), workout_type_id: tIds.push, rating: 4, duration_minutes: 55, notes: null },
      { id: wIds[1], owner_id: user.id, date: addDays(today, -10), workout_type_id: tIds.pull, rating: 4, duration_minutes: 50, notes: null },
      { id: wIds[2], owner_id: user.id, date: addDays(today, -8),  workout_type_id: tIds.legs, rating: 5, duration_minutes: 60, notes: "Felt strong today!" },
      { id: wIds[3], owner_id: user.id, date: addDays(today, -6),  workout_type_id: tIds.push, rating: 4, duration_minutes: 55, notes: null },
      { id: wIds[4], owner_id: user.id, date: addDays(today, -3),  workout_type_id: tIds.pull, rating: 5, duration_minutes: 45, notes: null },
      { id: wIds[5], owner_id: user.id, date: addDays(today, -1),  workout_type_id: tIds.legs, rating: 5, duration_minutes: 65, notes: "New PR on squat!" },
    ];

    const { error: wErr } = await supabaseAdmin.from("workouts").insert(workoutRows);
    if (wErr) throw new Error("Workouts insert failed: " + wErr.message);

    // ── 6. Workout Exercises & Sets ──
    type SetDef = { reps: number; weight: number; is_pr?: boolean; is_cycle_max?: boolean };
    type ExDef  = { id: string; name: string; sets: SetDef[] };

    const sessionDefs: ExDef[][] = [
      // Session 0 — Push Day, -13 days
      [
        { id: eIds.benchPress,    name: "Bench Press",    sets: [{ reps: 5, weight: 135 }, { reps: 5, weight: 155 }, { reps: 5, weight: 175 }, { reps: 4, weight: 185 }] },
        { id: eIds.shoulderPress, name: "Shoulder Press", sets: [{ reps: 3, weight: 65  }, { reps: 3, weight: 75  }, { reps: 3, weight: 80  }] },
      ],
      // Session 1 — Pull Day, -10 days
      [
        { id: eIds.pullup,      name: "Pull-up",      sets: [{ reps: 8, weight: 0 }, { reps: 8, weight: 0 }, { reps: 6, weight: 0 }, { reps: 5, weight: 0 }] },
        { id: eIds.barbellRow,  name: "Barbell Row",  sets: [{ reps: 5, weight: 115 }, { reps: 5, weight: 125 }, { reps: 5, weight: 135 }, { reps: 4, weight: 145 }] },
      ],
      // Session 2 — Leg Day, -8 days
      [
        { id: eIds.squat, name: "Squat", sets: [{ reps: 5, weight: 185 }, { reps: 5, weight: 205 }, { reps: 5, weight: 225 }, { reps: 3, weight: 245, is_pr: true }] },
      ],
      // Session 3 — Push Day, -6 days
      [
        { id: eIds.benchPress,    name: "Bench Press",    sets: [{ reps: 5, weight: 175 }, { reps: 5, weight: 185 }, { reps: 4, weight: 195, is_pr: true }, { reps: 3, weight: 205, is_pr: true }] },
        { id: eIds.shoulderPress, name: "Shoulder Press", sets: [{ reps: 3, weight: 80 }, { reps: 3, weight: 85, is_pr: true }, { reps: 3, weight: 85 }] },
      ],
      // Session 4 — Pull Day, -3 days
      [
        { id: eIds.pullup,     name: "Pull-up",     sets: [{ reps: 8, weight: 0 }, { reps: 8, weight: 0 }, { reps: 8, weight: 0 }, { reps: 7, weight: 0 }] },
        { id: eIds.barbellRow, name: "Barbell Row", sets: [{ reps: 5, weight: 135 }, { reps: 5, weight: 145 }, { reps: 5, weight: 155, is_pr: true }, { reps: 4, weight: 165, is_pr: true }] },
      ],
      // Session 5 — Leg Day, -1 day
      [
        { id: eIds.squat, name: "Squat",             sets: [{ reps: 5, weight: 225 }, { reps: 5, weight: 245, is_cycle_max: true }, { reps: 5, weight: 255, is_pr: true }, { reps: 3, weight: 265, is_pr: true }] },
        { id: eIds.rdl,   name: "Romanian Deadlift", sets: [{ reps: 8, weight: 135 }, { reps: 8, weight: 155 }, { reps: 8, weight: 175 }] },
      ],
    ];

    const weRows: object[] = [];
    const wsRows: object[] = [];

    for (let si = 0; si < sessionDefs.length; si++) {
      const workoutId = wIds[si];
      let setOrder = 0;

      for (let ei = 0; ei < sessionDefs[si].length; ei++) {
        const ex = sessionDefs[si][ei];
        const weId = randomUUID();

        weRows.push({
          id: weId,
          workout_id: workoutId,
          exercise_id: ex.id,
          exercise_name_display: ex.name,
          modifier_ids: [],
          exercise_order: ei,
          superset_group: null,
        });

        for (let seti = 0; seti < ex.sets.length; seti++) {
          const s = ex.sets[seti];
          wsRows.push({
            workout_id: workoutId,
            workout_exercise_id: weId,
            exercise_id: ex.id,
            exercise_name_display: ex.name,
            modifier_ids: [],
            set_order: setOrder++,
            set_number: seti + 1,
            set_type: "working",
            reps: s.reps,
            weight: s.weight || null,
            is_pr: s.is_pr ?? false,
            is_cycle_max: s.is_cycle_max ?? false,
            is_missed: false,
            rpe: null,
            notes: null,
          });
        }
      }
    }

    const { error: weErr } = await supabaseAdmin.from("workout_exercises").insert(weRows);
    if (weErr) throw new Error("Workout exercises insert failed: " + weErr.message);

    const { error: wsErr } = await supabaseAdmin.from("workout_sets").insert(wsRows);
    if (wsErr) throw new Error("Workout sets insert failed: " + wsErr.message);

    return NextResponse.json({
      ok: true,
      ids: {
        type_ids:     Object.values(tIds),
        group_ids:    Object.values(gIds),
        modifier_ids: Object.values(mIds),
        exercise_ids: Object.values(eIds),
        workout_ids:  wIds,
      },
    });

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[tour/workouts/seed] Error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
