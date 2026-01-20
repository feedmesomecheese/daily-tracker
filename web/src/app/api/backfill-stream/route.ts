import { supabaseServerFromRequest } from "@/lib/supabaseServer";
import { recalculateFromDate, backfillAllCalculations } from "@/lib/recalculate";

/**
 * GET /api/backfill-stream?all=true
 * GET /api/backfill-stream?fromDate=YYYY-MM-DD
 *
 * Streams progress updates via Server-Sent Events
 */
export async function GET(req: Request) {
  const supabase = supabaseServerFromRequest(req);

  // Auth
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return new Response(JSON.stringify({ error: "Not authenticated" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const url = new URL(req.url);
  const all = url.searchParams.get("all") === "true";
  const fromDate = url.searchParams.get("fromDate");
  const toDate = url.searchParams.get("toDate");

  if (!all && !fromDate) {
    return new Response(
      JSON.stringify({ error: "Must specify 'all=true' or 'fromDate'" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // Create a TransformStream for SSE
  const encoder = new TextEncoder();
  const stream = new TransformStream();
  const writer = stream.writable.getWriter();

  // Helper to send SSE messages
  const sendEvent = async (event: string, data: unknown) => {
    const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    await writer.write(encoder.encode(message));
  };

  // Run backfill in the background
  (async () => {
    try {
      await sendEvent("start", { message: "Starting backfill..." });

      const onProgress = async (progress: {
        current: number;
        total: number;
        date: string;
        percent: number;
      }) => {
        await sendEvent("progress", progress);
      };

      let result;
      if (all) {
        result = await backfillAllCalculations(supabase, user.id, onProgress);
      } else {
        result = await recalculateFromDate(
          supabase,
          user.id,
          fromDate!,
          toDate || undefined,
          onProgress
        );
      }

      await sendEvent("complete", {
        success: result.success,
        daysProcessed: result.daysProcessed,
        errors: result.errors,
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      await sendEvent("error", { error: msg });
    } finally {
      await writer.close();
    }
  })();

  return new Response(stream.readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
