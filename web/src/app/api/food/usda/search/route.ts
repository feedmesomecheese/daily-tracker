import { NextResponse } from "next/server";
import { supabaseServerFromRequest } from "@/lib/supabaseServer";

// Nutrient IDs from USDA FoodData Central
const NUTRIENT_IDS = {
  calories: 1008,  // Energy (kcal)
  protein:  1003,  // Protein
  fat:      1004,  // Total lipid (fat)
  carbs:    1005,  // Carbohydrate, by difference
  fiber:    1079,  // Fiber, total dietary
};

interface FDCNutrient {
  nutrientId: number;
  value: number;
}

interface FDCFood {
  fdcId: number;
  description: string;
  dataType: string;
  brandOwner?: string;
  brandName?: string;
  foodNutrients: FDCNutrient[];
}

function getNutrient(nutrients: FDCNutrient[], id: number): number {
  return Math.round((nutrients.find((n) => n.nutrientId === id)?.value ?? 0) * 10) / 10;
}

export async function GET(req: Request) {
  const supabase = supabaseServerFromRequest(req);
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim();
  if (!q) return NextResponse.json({ error: "q is required" }, { status: 400 });

  const apiKey = process.env.USDA_FDC_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "USDA API key not configured" }, { status: 500 });

  const url = new URL("https://api.nal.usda.gov/fdc/v1/foods/search");
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("query", q);
  url.searchParams.set("pageSize", "20");
  // Prefer Foundation and SR Legacy (most reliable nutrient data)
  url.searchParams.set("dataType", "Foundation,SR Legacy,Branded");

  const fdcRes = await fetch(url.toString());
  if (!fdcRes.ok) {
    return NextResponse.json({ error: "USDA API request failed" }, { status: 502 });
  }

  const fdcData = await fdcRes.json();
  const foods: FDCFood[] = fdcData.foods ?? [];

  const results = foods.map((food) => ({
    fdcId: food.fdcId,
    name: food.description,
    brand: food.brandOwner || food.brandName || null,
    dataType: food.dataType,
    per100g: {
      calories: getNutrient(food.foodNutrients, NUTRIENT_IDS.calories),
      protein:  getNutrient(food.foodNutrients, NUTRIENT_IDS.protein),
      fat:      getNutrient(food.foodNutrients, NUTRIENT_IDS.fat),
      carbs:    getNutrient(food.foodNutrients, NUTRIENT_IDS.carbs),
      fiber:    getNutrient(food.foodNutrients, NUTRIENT_IDS.fiber),
    },
  }));

  return NextResponse.json({ results });
}
