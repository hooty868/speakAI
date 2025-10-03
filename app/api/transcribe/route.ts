import { NextRequest } from "next/server";
import { openai } from "../../_lib/openai";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File))
      return new Response("No file", { status: 400 });

    // 檢查檔案大小和類型
    console.log(`Processing file: ${file.name}, size: ${file.size}, type: ${file.type}`);
    
    if (file.size === 0) {
      return new Response("Empty file", { status: 400 });
    }

    if (file.size > 25 * 1024 * 1024) {
      return new Response("File too large", { status: 400 });
    }

    const transcript = await openai.audio.transcriptions.create({
      file,
      model: "whisper-1",
      timestamp_granularities: ["segment"],
      response_format: "verbose_json",
    });

    const segments = ((transcript as any).segments || []).map((s: any, i: number) => ({
      id: String(i + 1),
      start: s.start ?? 0,
      end: s.end ?? 0,
      text: s.text?.trim() || "",
    }));

    return Response.json({ segments });
  } catch (e: any) {
    console.error('Transcribe error:', e);
    return new Response(e?.message || "Transcribe failed", { status: 500 });
  }
}
