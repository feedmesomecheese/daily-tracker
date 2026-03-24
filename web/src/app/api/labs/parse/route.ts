import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { supabaseServerFromRequest } from "@/lib/supabaseServer";

const PARSE_PROMPT = `You are extracting lab test results from a medical lab report PDF.

Return ONLY a valid JSON object with this exact structure:
{
  "visit_date": "YYYY-MM-DD or null if not found",
  "lab_name": "name of the lab/facility or null",
  "provider": "ordering provider name or null",
  "results": [
    {
      "test_name": "exact test name as shown",
      "category": "one of: CBC, Metabolic, Lipid, Thyroid, Hormone, Vitamin, Urinalysis, Other",
      "value": numeric value or null if not numeric,
      "unit": "unit string or null",
      "ref_low": numeric lower bound of reference range or null,
      "ref_high": numeric upper bound of reference range or null,
      "ref_text": "full reference range text if non-numeric (e.g. 'Negative', '<0.5') or null",
      "in_range": true if value is within reference range, false if outside, null if cannot determine
    }
  ]
}

Rules:
- Include every test result on the report, even if value is missing
- For reference ranges like "3.5-5.0", set ref_low=3.5 and ref_high=5.0
- For "<5.0", set ref_high=5.0 and ref_low=null
- For ">0.1", set ref_low=0.1 and ref_high=null
- For "Negative" or text-only ranges, use ref_text and set ref_low/ref_high to null
- Categorize: WBC/RBC/Hemoglobin/Hematocrit/Platelets → CBC; Glucose/BUN/Creatinine/eGFR/Sodium/Potassium/CO2/Calcium/Albumin/Protein/ALT/AST/ALP/Bilirubin → Metabolic; Cholesterol/LDL/HDL/Triglycerides → Lipid; TSH/T3/T4 → Thyroid; Testosterone/Estrogen/FSH/LH/Cortisol/DHEA/Insulin → Hormone; Vitamin D/B12/Folate/Iron/Ferritin → Vitamin; Urinalysis tests → Urinalysis; everything else → Other
- Return ONLY the JSON object, no markdown, no explanation`;

export async function POST(req: Request) {
  const supabase = supabaseServerFromRequest(req);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "ANTHROPIC_API_KEY is not configured" }, { status: 500 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      return NextResponse.json({ error: "File must be a PDF" }, { status: 400 });
    }
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: "File too large (max 10MB)" }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "document",
              source: {
                type: "base64",
                media_type: "application/pdf",
                data: base64,
              },
            },
            {
              type: "text",
              text: PARSE_PROMPT,
            },
          ],
        },
      ],
    });

    const text = message.content[0].type === "text" ? message.content[0].text : "";
    const jsonText = text.replace(/^```(?:json)?\n?/m, "").replace(/\n?```$/m, "").trim();

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      return NextResponse.json({ error: "Failed to parse Claude response", raw: text }, { status: 500 });
    }

    return NextResponse.json(parsed);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
