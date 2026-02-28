import {
  deleteOrg,
  deleteOrgMember,
  deleteUser,
  syncOrg,
  syncOrgMember,
  syncUser,
} from "@axon/database";
import type {
  OrganizationMembershipWebhookEvent,
  OrganizationWebhookEvent,
  UserWebhookEvent,
} from "@clerk/nextjs/server";
import { verifyWebhook } from "@clerk/nextjs/webhooks";
import type { NextRequest } from "next/server";

/**
 * Clerk webhook handler for syncing user and organization data
 * Supported events:
 * - user.created, user.updated, user.deleted
 * - organization.created, organization.updated, organization.deleted
 * - organizationMembership.created, organizationMembership.updated, organizationMembership.deleted
 */
export async function POST(req: NextRequest) {
  try {
    const evt = await verifyWebhook(req);

    console.log(`[Webhook] Received ${evt.type} event`);

    try {
      // Route event to appropriate handler based on event type
      switch (evt.type) {
        // User events
        case "user.created":
          await handleUserCreated(evt);
          break;
        case "user.updated":
          await handleUserUpdated(evt);
          break;
        case "user.deleted":
          await handleUserDeleted(evt);
          break;

        // Organization events
        case "organization.created":
          await handleOrgCreated(evt);
          break;
        case "organization.updated":
          await handleOrgUpdated(evt);
          break;
        case "organization.deleted":
          await handleOrgDeleted(evt);
          break;

        // Organization membership events
        case "organizationMembership.created":
          await handleOrgMembershipCreated(evt);
          break;
        case "organizationMembership.updated":
          await handleOrgMembershipUpdated(evt);
          break;
        case "organizationMembership.deleted":
          await handleOrgMembershipDeleted(evt);
          break;

        default:
          console.warn(`[Webhook] Unhandled event type: ${evt.type}`);
      }

      console.log(`[Webhook] Successfully processed ${evt.type} event`);
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (processingErr) {
      console.error(`[Webhook] Error processing ${evt.type} event:`, processingErr);
      const errorMessage =
        processingErr instanceof Error ? processingErr.message : "Unknown error";
      return new Response(
        JSON.stringify({ error: "Event processing failed", details: errorMessage }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }
  } catch (err) {
    console.error("[Webhook] Error verifying webhook:", err);
    return new Response(
      JSON.stringify({ error: "Webhook verification failed" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }
}

// User event handlers

async function handleUserCreated(evt: UserWebhookEvent): Promise<void> {
  if (evt.type !== "user.created") {
    return;
  }

  const { id, email_addresses, first_name, last_name, image_url } = evt.data;
  const email = email_addresses?.[0]?.email_address;

  if (!email) {
    console.warn(`[Webhook] User ${id} has no email, skipping sync`);
    return;
  }

  await syncUser({
    clerkId: id,
    email,
    firstName: first_name,
    lastName: last_name,
    imageUrl: image_url,
  });

  console.log(`[Webhook] Synced user ${id}`);
}

async function handleUserUpdated(evt: UserWebhookEvent): Promise<void> {
  if (evt.type !== "user.updated") {
    return;
  }

  const { id, email_addresses, first_name, last_name, image_url } = evt.data;
  const email = email_addresses?.[0]?.email_address;

  if (!email) {
    console.warn(`[Webhook] User ${id} has no email, skipping sync`);
    return;
  }

  await syncUser({
    clerkId: id,
    email,
    firstName: first_name,
    lastName: last_name,
    imageUrl: image_url,
  });

  console.log(`[Webhook] Updated user ${id}`);
}

async function handleUserDeleted(evt: UserWebhookEvent): Promise<void> {
  if (evt.type !== "user.deleted") {
    return;
  }

  const { id } = evt.data;

  if (!id) {
    console.warn("[Webhook] Deleted user event missing ID, skipping");
    return;
  }
  await deleteUser(id);
  console.log(`[Webhook] Deleted user ${id}`);
}

// Organization event handlers

async function handleOrgCreated(evt: OrganizationWebhookEvent): Promise<void> {
  if (evt.type !== "organization.created") {
    return;
  }

  const { id, name } = evt.data;

  await syncOrg(id, name);
  console.log(`[Webhook] Synced organization ${id}`);
}

async function handleOrgUpdated(evt: OrganizationWebhookEvent): Promise<void> {
  if (evt.type !== "organization.updated") {
    return;
  }

  const { id, name } = evt.data;

  await syncOrg(id, name);
  console.log(`[Webhook] Updated organization ${id}`);
}

async function handleOrgDeleted(evt: OrganizationWebhookEvent): Promise<void> {
  if (evt.type !== "organization.deleted") {
    return;
  }

  const { id } = evt.data;

  if (!id) {
    console.warn("[Webhook] Deleted organization event missing ID, skipping");
    return;
  }
  await deleteOrg(id);
  console.log(`[Webhook] Deleted organization ${id}`);
}

// Organization membership event handlers

async function handleOrgMembershipCreated(
  evt: OrganizationMembershipWebhookEvent
): Promise<void> {
  if (evt.type !== "organizationMembership.created") {
    return;
  }

  const { organization, public_user_data, role } = evt.data;

  // Validate role
  if (!isValidClerkRole(role)) {
    console.warn(`[Webhook] Invalid role "${role}" for membership creation`);
    return;
  }

  await syncOrgMember(organization.id, public_user_data.user_id, role);
  console.log(
    `[Webhook] Created organization membership: org=${organization.id}, user=${public_user_data.user_id}, role=${role}`
  );
}

async function handleOrgMembershipUpdated(
  evt: OrganizationMembershipWebhookEvent
): Promise<void> {
  if (evt.type !== "organizationMembership.updated") {
    return;
  }

  const { organization, public_user_data, role } = evt.data;

  // Validate role
  if (!isValidClerkRole(role)) {
    console.warn(`[Webhook] Invalid role "${role}" for membership update`);
    return;
  }

  await syncOrgMember(organization.id, public_user_data.user_id, role);
  console.log(
    `[Webhook] Updated organization membership: org=${organization.id}, user=${public_user_data.user_id}, role=${role}`
  );
}

async function handleOrgMembershipDeleted(
  evt: OrganizationMembershipWebhookEvent
): Promise<void> {
  if (evt.type !== "organizationMembership.deleted") {
    return;
  }

  const { organization, public_user_data } = evt.data;

  await deleteOrgMember(organization.id, public_user_data.user_id);
  console.log(
    `[Webhook] Deleted organization membership: org=${organization.id}, user=${public_user_data.user_id}`
  );
}

/**
 * Validate that role is a supported Clerk organization role
 * Clerk only supports: org:admin, org:member
 */
function isValidClerkRole(role: unknown): boolean {
  return role === "org:admin" || role === "org:member";
}
