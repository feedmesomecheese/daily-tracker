"use client";

import React, { useState } from "react";
import { orderSectionKeys, sectionLabel } from "@/lib/tennis/sections";
import type { WorkoutActivityNote } from "../types";

/**
 * Renders a workout's note as structured sections when a parse exists, and as
 * the plain paragraph it has always been when one does not.
 *
 * The raw note stays the source of truth: the sections are a lens over it, they
 * deliberately overlap (a clause about a backhand lob appears under both), and
 * they are reachable from the toggle rather than replacing the original text.
 *
 * Keyed off "a parsed row exists for this workout", NOT off an exercise's
 * input_type: sport entries live in activity_sessions, so 30 of the historical
 * tennis rows have no exercises at all and input_type would find nothing.
 */
export default function ActivityNoteSections({
  notes,
  activityNotes,
}: {
  notes: string | null;
  activityNotes?: WorkoutActivityNote[];
}) {
  const [showRaw, setShowRaw] = useState(false);

  // Only parses that actually describe a session carry sections worth showing.
  const parsed = (activityNotes || []).filter(
    (n) => n.status === "parsed" && n.is_activity_session && Object.keys(n.sections || {}).length > 0,
  );

  if (parsed.length === 0) {
    if (!notes) return null;
    return <p className="text-sm text-muted-foreground mt-2 italic">{notes}</p>;
  }

  return (
    <div className="mt-2 space-y-3">
      {parsed.map((note) => {
        const keys = orderSectionKeys(Object.keys(note.sections));
        const facts = [
          note.result && note.result !== "unknown" ? note.result.toUpperCase() : null,
          note.score,
          note.format && note.format !== "unknown" ? note.format : null,
          note.league,
          note.surface && note.surface !== "unknown" ? note.surface : null,
        ].filter(Boolean) as string[];

        return (
          <div key={note.id}>
            {facts.length > 0 && (
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground mb-1.5">
                {facts.map((f, i) => (
                  <React.Fragment key={i}>
                    {i > 0 && <span className="text-muted-foreground/40">·</span>}
                    <span className={i === 0 ? "font-medium text-foreground" : undefined}>{f}</span>
                  </React.Fragment>
                ))}
              </div>
            )}

            <dl className="space-y-1">
              {keys.map((k) => (
                <div key={k} className="flex items-start text-sm">
                  <dt className="w-24 shrink-0 text-xs font-medium text-muted-foreground pt-0.5">
                    {sectionLabel(k)}
                  </dt>
                  <dd className="flex-1 min-w-0 text-muted-foreground">{note.sections[k]}</dd>
                </div>
              ))}
            </dl>
          </div>
        );
      })}

      {notes && (
        <div>
          <button
            type="button"
            onClick={() => setShowRaw((v) => !v)}
            className="text-xs text-muted-foreground/60 hover:text-muted-foreground underline"
          >
            {showRaw ? "hide raw note" : "show raw note"}
          </button>
          {showRaw && <p className="text-sm text-muted-foreground mt-1.5 italic">{notes}</p>}
        </div>
      )}
    </div>
  );
}
