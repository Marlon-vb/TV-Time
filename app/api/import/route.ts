import { NextRequest, NextResponse } from "next/server";
import { getReport, startImport } from "@/lib/importJob";

export const dynamic = "force-dynamic";

/** Poll import progress. */
export async function GET() {
  return NextResponse.json(getReport());
}

/** Upload a TV Time export (zip or CSVs) and start the import job. */
export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: "Expected multipart form data" }, { status: 400 });
  }
  const files: { name: string; buffer: Buffer }[] = [];
  for (const value of form.getAll("files")) {
    if (value instanceof File) {
      files.push({
        name: value.name,
        buffer: Buffer.from(await value.arrayBuffer()),
      });
    }
  }
  if (files.length === 0) {
    return NextResponse.json({ error: "No files uploaded" }, { status: 400 });
  }

  const result = startImport(files);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json(getReport(), { status: 202 });
}
