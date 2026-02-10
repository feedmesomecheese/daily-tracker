import { NextResponse } from "next/server";
import { supabaseServerFromRequest } from "@/lib/supabaseServer";

export async function GET(req: Request) {
  const supabase = supabaseServerFromRequest(req);

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const url = new URL(req.url);
  const date = url.searchParams.get("date");
  const metricId = url.searchParams.get("metric_id");

  let query = supabase
    .from("photos")
    .select("*")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false });

  if (date) {
    query = query.eq("date", date);
  }

  if (metricId) {
    query = query.eq("metric_id", metricId);
  }

  const { data: photos, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Get signed URLs for all photos
  const photosWithUrls = await Promise.all(
    (photos || []).map(async (photo) => {
      const { data: urlData } = await supabase.storage
        .from("daily-tracker-photos")
        .createSignedUrl(photo.storage_path, 3600);

      return {
        ...photo,
        url: urlData?.signedUrl,
      };
    })
  );

  return NextResponse.json({ photos: photosWithUrls });
}

export async function DELETE(req: Request) {
  const supabase = supabaseServerFromRequest(req);

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const url = new URL(req.url);
  const photoId = url.searchParams.get("id");

  if (!photoId) {
    return NextResponse.json({ error: "No photo ID provided" }, { status: 400 });
  }

  // Get photo to find storage path
  const { data: photo, error: fetchError } = await supabase
    .from("photos")
    .select("storage_path, thumbnail_path")
    .eq("id", photoId)
    .eq("owner_id", user.id)
    .single();

  if (fetchError || !photo) {
    return NextResponse.json({ error: "Photo not found" }, { status: 404 });
  }

  // Delete from storage
  const pathsToDelete = [photo.storage_path];
  if (photo.thumbnail_path) {
    pathsToDelete.push(photo.thumbnail_path);
  }

  const { error: storageError } = await supabase.storage
    .from("daily-tracker-photos")
    .remove(pathsToDelete);

  if (storageError) {
    console.error("Storage delete error:", storageError);
  }

  // Delete database record
  const { error: dbError } = await supabase
    .from("photos")
    .delete()
    .eq("id", photoId)
    .eq("owner_id", user.id);

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export async function PATCH(req: Request) {
  const supabase = supabaseServerFromRequest(req);

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await req.json();
  const { id, caption } = body as { id: string; caption: string };

  if (!id) {
    return NextResponse.json({ error: "No photo ID provided" }, { status: 400 });
  }

  const { data: photo, error } = await supabase
    .from("photos")
    .update({ caption })
    .eq("id", id)
    .eq("owner_id", user.id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ photo });
}
