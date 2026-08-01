import {
  CHANNEL_QUESTIONS,
  evaluateChannelProfile,
} from "@/lib/channels/scoring";
import { canPersistChannelProfile } from "@/lib/channels/contract";
import { requireApiWorkspaceSession } from "@/lib/server/auth/session";
import {
  deleteWorkspaceChannelProfile,
  getWorkspaceChannelProfile,
  saveWorkspaceChannelProfile,
} from "@/lib/server/data/channel-profiles";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const RESPONSE_HEADERS = { "Cache-Control": "no-store" };
const MAX_PROFILE_BYTES = 48_000;

export async function GET(request, { params }) {
  const auth = await requireApiWorkspaceSession(request, params.workspaceId);
  if (auth instanceof Response) return auth;

  const profile = await getWorkspaceChannelProfile(params.workspaceId);
  return Response.json({ profile }, { headers: RESPONSE_HEADERS });
}

export async function POST(request, { params }) {
  const auth = await requireApiWorkspaceSession(request, params.workspaceId);
  if (auth instanceof Response) return auth;

  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > MAX_PROFILE_BYTES) {
    return Response.json(
      { error: "Channel profile is too large." },
      { status: 413, headers: RESPONSE_HEADERS },
    );
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return Response.json(
      { error: "A valid channel profile is required." },
      { status: 400, headers: RESPONSE_HEADERS },
    );
  }

  if (Buffer.byteLength(JSON.stringify(body), "utf8") > MAX_PROFILE_BYTES) {
    return Response.json(
      { error: "Channel profile is too large." },
      { status: 413, headers: RESPONSE_HEADERS },
    );
  }

  if (!body.answers || typeof body.answers !== "object" || Array.isArray(body.answers)) {
    return Response.json(
      { error: "Complete the channel questionnaire before saving." },
      { status: 400, headers: RESPONSE_HEADERS },
    );
  }

  const result = evaluateChannelProfile(body.answers);
  const answers = result.answers;
  if (!canPersistChannelProfile(result)) {
    return Response.json(
      {
        error: "Sensitive or unverified channel profiles cannot be stored.",
        code: "channel_profile_not_persistable",
      },
      { status: 422, headers: RESPONSE_HEADERS },
    );
  }

  const complete = CHANNEL_QUESTIONS.every((question) => {
    const value = answers[question.id];
    return question.type === "multi" ? Array.isArray(value) && value.length > 0 : Boolean(value);
  });
  if (!complete) {
    return Response.json(
      { error: "Complete the channel questionnaire before saving." },
      { status: 400, headers: RESPONSE_HEADERS },
    );
  }

  const profile = await saveWorkspaceChannelProfile(params.workspaceId, {
    schemaVersion: result.version,
    answers: result.answers,
    result,
  });

  return Response.json({ profile }, { headers: RESPONSE_HEADERS });
}

export async function DELETE(request, { params }) {
  const auth = await requireApiWorkspaceSession(request, params.workspaceId);
  if (auth instanceof Response) return auth;

  await deleteWorkspaceChannelProfile(params.workspaceId);
  return Response.json({ deleted: true }, { headers: RESPONSE_HEADERS });
}
