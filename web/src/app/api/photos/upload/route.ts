import { NextResponse } from "next/server";
import { supabaseServerFromRequest } from "@/lib/supabaseServer";

export async function POST(req: Request) {
  const supabase = supabaseServerFromRequest(req);

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    const date = formData.get("date") as string;
    const metricId = formData.get("metric_id") as string | null;
    const caption = formData.get("caption") as string | null;
    const width = parseInt(formData.get("width") as string, 10) || null;
    const height = parseInt(formData.get("height") as string, 10) || null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (!date) {
      return NextResponse.json({ error: "No date provided" }, { status: 400 });
    }

    // Validate file type
    const validTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    if (!validTypes.includes(file.type)) {
      return NextResponse.json({ error: "Invalid file type" }, { status: 400 });
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: "File too large (max 5MB)" }, { status: 400 });
    }

    // Generate unique filename
    const ext = file.name.split(".").pop() || "jpg";
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substring(2, 8);
    const storagePath = `${user.id}/${date}/${timestamp}-${randomStr}.${ext}`;

    // Upload to Supabase Storage
    const { error: uploadError } = await supabase.storage
      .from("daily-tracker-photos")
      .upload(storagePath, file, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      console.error("Storage upload error:", uploadError);
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    // Create database record
    const { data: photo, error: dbError } = await supabase
      .from("photos")
      .insert({
        owner_id: user.id,
        date,
        metric_id: metricId || null,
        storage_path: storagePath,
        filename: file.name,
        mime_type: file.type,
        size_bytes: file.size,
        width,
        height,
        caption: caption || null,
      })
      .select()
      .single();

    if (dbError) {
      // Try to clean up uploaded file
      await supabase.storage.from("daily-tracker-photos").remove([storagePath]);
      return NextResponse.json({ error: dbError.message }, { status: 500 });
    }

    // Get signed URL for the photo
    const { data: urlData } = await supabase.storage
      .from("daily-tracker-photos")
      .createSignedUrl(storagePath, 3600); // 1 hour

    return NextResponse.json({
      photo: {
        ...photo,
        url: urlData?.signedUrl,
      },
    });
  } catch (e) {
    console.error("Photo upload error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Upload failed" },
      { status: 500 }
    );
  }
}
