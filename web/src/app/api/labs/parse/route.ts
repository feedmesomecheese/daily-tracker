import { NextResponse } from "next/server";
import OpenAI from "openai";
import type { ChatCompletion } from "openai/resources/chat/completions";
import { extractText } from "unpdf";
import { supabaseServerFromRequest } from "@/lib/supabaseServer";

const PARSE_PROMPT = `You are extracting lab test results from a medical lab report.

Return ONLY a valid JSON object with this exact structure:
{
  "visit_date": "YYYY-MM-DD or null if not found",
  "lab_name": "name of the lab/facility or null",
  "provider": "ordering provider name or null",
  "results": [
    {
      "test_name": "exact test name as shown on the report",
      "canonical_name": "standardized medical name for this test (see rules below)",
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
- test_name: copy exactly as printed on the report
- canonical_name: normalize to a consistent standard name so the same test from different labs matches. Examples: "WBC", "WHITE BLOOD CELL COUNT", "Leukocytes" → "WBC"; "HEMOGLOBIN A1C", "HbA1c", "Est. Avg. Glucose (HbA1c)" → "Hemoglobin A1c"; "CHOL", "Total Cholesterol" → "Total Cholesterol"; "eGFR", "GFR (estimated)" → "eGFR"; "25-OH Vitamin D", "Vitamin D, 25-Hydroxy" → "Vitamin D (25-OH)". Use Title Case. If already standard, canonical_name may equal test_name.
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

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: "OPENAI_API_KEY is not configured" }, { status: 500 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      return NextResponse.json({ error: "File must be a PDF" }, { status: 400 });
    }
    if (file.size > 20 * 1024 * 1024) {
      return NextResponse.json({ error: "File too large (max 20MB)" }, { status: 400 });
    }

    // Copy into a Node Buffer immediately — pdfjs may detach the original ArrayBuffer
    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    // Try text extraction first (cheaper). Fall back to GPT-4o PDF vision.
    const completion: ChatCompletion = await (async () => {
      try {
        // Use a fresh Uint8Array copy so unpdf can't detach fileBuffer's memory
        const { text: pages } = await extractText(new Uint8Array(fileBuffer), { mergePages: true });
        const text = (Array.isArray(pages) ? pages.join("\n") : String(pages ?? "")).trim();
        if (text) {
          return openai.chat.completions.create({
            stream: false,
            model: "gpt-4o-mini",
            max_tokens: 4096,
            messages: [
              { role: "system", content: PARSE_PROMPT },
              { role: "user", content: text },
            ],
          });
        }
      } catch { /* fall through to vision */ }

      // Fallback: send PDF directly to gpt-4o (handles scanned/unusual encodings)
      const base64 = fileBuffer.toString("base64");
      return openai.chat.completions.create({
        stream: false,
        model: "gpt-4o",
        max_tokens: 4096,
        messages: [
          { role: "system", content: PARSE_PROMPT },
          {
            role: "user",
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            content: [{ type: "file", file: { filename: file.name, file_data: `data:application/pdf;base64,${base64}` } }] as any,
          },
        ],
      });
    })();

    const raw = completion.choices[0]?.message?.content ?? "";
    const jsonText = raw.replace(/^```(?:json)?\n?/m, "").replace(/\n?```$/m, "").trim();

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      return NextResponse.json({ error: "Failed to parse response", raw }, { status: 500 });
    }

    return NextResponse.json(parsed);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
