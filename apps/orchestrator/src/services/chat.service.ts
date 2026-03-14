import type { ChatArchiveSnapshotResponse } from "@axon/shared";
import { createRoutingToken as createToken } from "@axon/shared";
import {
  countOrgActiveChats,
  deleteChatRuntime,
  getChatRuntime,
  initializeChatRuntime,
  markChatArchived,
  recordChatArchive,
  touchChatActivity,
  updateChatRuntimeStatus,
} from "@axon/worker-database";
import { controllerClient } from "../do/controller-client";
import type { Env } from "../env";
import { ServiceError } from "./errors";

export async function activateChat(
  env: Env,
  params: { config_id: string; org_id: string },
): Promise<{ memory_controller_id: string }> {
  const { config_id, org_id } = params;

  const activeLimit = Number(env.ORG_ACTIVE_GROUP_LIMIT ?? "5");
  const activeCount = await countOrgActiveChats(org_id, config_id);
  const existingRuntime = await getChatRuntime(config_id);
  const alreadyActive =
    existingRuntime && existingRuntime.status !== "archived";

  if (!alreadyActive && activeCount >= activeLimit) {
    throw new ServiceError(
      429,
      "active_chat_limit_exceeded",
      `org reached active chat limit (${activeLimit})`,
    );
  }

  const doIdString = controllerClient.getDoIdString(env, config_id);
  await initializeChatRuntime(config_id, doIdString, null);

  const initResponse = await controllerClient.init(env, config_id, {
    config_id,
    org_id,
    type: "chat",
  });

  if (!initResponse.ok) {
    const bodyText = await initResponse.text();
    throw new ServiceError(
      502,
      "memory_controller_init_failed",
      bodyText || "failed to initialize chat controller",
    );
  }

  let initPayload: { config_source?: string; ok?: boolean } | null = null;
  try {
    initPayload = (await initResponse.json()) as {
      config_source?: string;
      ok?: boolean;
    };
  } catch {
    initPayload = null;
  }

  if (!initPayload || initPayload.config_source !== "database") {
    throw new ServiceError(
      502,
      "memory_controller_init_source_invalid",
      "memory controller init must use persisted database config",
    );
  }

  await touchChatActivity(config_id);

  return { memory_controller_id: doIdString };
}

export async function createRoutingToken(
  env: Env,
  params: { config_id: string; user_id: string; role: string },
): Promise<{ routing_token: string }> {
  const token = await createToken(
    env.ORCHESTRATOR_PRIVATE_KEY,
    params.user_id,
    params.config_id,
    params.role,
  );
  return { routing_token: token };
}

export async function archiveChat(
  env: Env,
  configId: string,
): Promise<{ r2_path: string }> {
  const res = await controllerClient.archive(env, configId);

  if (!res.ok) {
    throw new ServiceError(500, "archive_failed", await res.text());
  }

  const body = await res.json<ChatArchiveSnapshotResponse>();
  if (!body.snapshot) {
    throw new ServiceError(
      500,
      "archive_failed",
      "missing snapshot in archive response",
    );
  }

  const snapshotKey = `chats/${configId}/archives/${Date.now()}.json`;
  await env.ARCHIVES_BUCKET.put(snapshotKey, JSON.stringify(body.snapshot));

  await recordChatArchive({
    chatId: configId,
    r2Path: snapshotKey,
    sizeBytes: JSON.stringify(body.snapshot).length,
  });

  await markChatArchived(configId);

  return { r2_path: snapshotKey };
}

export async function destroyChat(env: Env, configId: string): Promise<void> {
  const res = await controllerClient.destroy(env, configId);

  if (!res.ok) {
    const text = await res.text();
    console.error("DO destroy failed:", text);
    // Continue with DB cleanup even if DO destroy fails
  }

  await deleteChatRuntime(configId);
}

export async function updateChatStatus(
  env: Env,
  params: { config_id: string; status: "active" | "idle" | "archived" },
): Promise<{ config_id: string; status: string }> {
  await updateChatRuntimeStatus(params.config_id, params.status);
  return { config_id: params.config_id, status: params.status };
}

export async function getHistory(
  env: Env,
  configId: string,
  queryString: string,
): Promise<Response> {
  return controllerClient.getMessages(env, configId, queryString);
}
