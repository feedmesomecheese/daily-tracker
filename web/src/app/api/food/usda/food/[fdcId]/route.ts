import { NextResponse } from "next/server";
import { supabaseServerFromRequest } from "@/lib/supabaseServer";

interface FDCPortion {
  gramWeight: number;
  amount: number;
  modifier?: string;
  measureUnit?: { name: string };
  portionDescription?: string;
}

export async function GET(req: Request, { params }: { params: Promise<{ fdcId: string }> }) {
  const supabase = supabaseServerFromRequest(req);
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { fdcId } = await params;
  const apiKey = process.env.USDA_FDC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "USDA API key not configured" }, { status: 500 });

  const url = `https://api.nal.usda.gov/fdc/v1/food/${fdcId}?api_key=${apiKey}`;
  const fdcRes = await fetch(url);
  if (!fdcRes.ok) return NextResponse.json({ error: "USDA API request failed" }, { status: 502 });

  const data = await fdcRes.json();
  const rawPortions: FDCPortion[] = data.foodPortions ?? [];

  // Deduplicate and format portions
  const seen = new Set<string>();
  const portions: { label: string; grams: number }[] = [];

  for (const p of rawPortions) {
    if (!p.gramWeight || p.gramWeight <= 0) continue;
    // Build a human-readable label
    const amount = p.amount && p.amount !== 1 ? `${p.amount} ` : "";
    const unit = p.measureUnit?.name && p.measureUnit.name !== "undetermined"
      ? p.measureUnit.name
      : "";
    const modifier = p.modifier ?? p.portionDescription ?? "";
    const raw = [amount + unit, modifier].filter(Boolean).join(", ").trim();
    const label = raw || `${Math.round(p.gramWeight)}g`;

    const key = `${label}|${p.gramWeight}`;
    if (!seen.has(key)) {
      seen.add(key);
      portions.push({ label, grams: Math.round(p.gramWeight * 10) / 10 });
    }
  }

  return NextResponse.json({ portions });
}
