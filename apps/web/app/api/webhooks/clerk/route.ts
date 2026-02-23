import {
  deleteOrg,
  deleteOrgMember,
  deleteUser,
  syncOrg,
  syncOrgMember,
  syncUser,
} from "@axon/database";
import type { WebhookEvent } from "@clerk/nextjs/server";
import { headers } from "next/headers";
import { Webhook } from "svix";

export async function POST(req: Request) {
  const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET;

  if (!WEBHOOK_SECRET) {
    throw new Error(
      "Please add CLERK_WEBHOOK_SECRET from Clerk Dashboard to .env or .env.local"
    );
  }

  // Get the headers
  const headerPayload = await headers();
  const svix_id = headerPayload.get("svix-id");
  const svix_timestamp = headerPayload.get("svix-timestamp");
  const svix_signature = headerPayload.get("svix-signature");

  if (!(svix_id && svix_timestamp && svix_signature)) {
    return new Response("Error occured -- no svix headers", { status: 400 });
  }

  // Get the body
  const payload = await req.json();
  const body = JSON.stringify(payload);

  // Create a new Svix instance with your secret.
  const wh = new Webhook(WEBHOOK_SECRET);

  let evt: WebhookEvent;

  // Verify the payload with the headers
  try {
    evt = wh.verify(body, {
      "svix-id": svix_id,
      "svix-timestamp": svix_timestamp,
      "svix-signature": svix_signature,
    }) as WebhookEvent;
  } catch (err) {
    console.error("Error verifying webhook:", err);
    return new Response("Error occured", { status: 400 });
  }

  const eventType = evt.type;

  // 1. Handle User Sync
  if (eventType === "user.created" || eventType === "user.updated") {
    const { id, email_addresses, first_name, last_name, image_url, password } =
      evt.data as any;
    const email = email_addresses[0]?.email_address;

    if (email) {
      await syncUser({
        clerkId: id,
        email,
        password,
        firstName: first_name,
        lastName: last_name,
        imageUrl: image_url,
      });
    }
  }

  if (eventType === "user.deleted") {
    const { id } = evt.data;
    if (id) {
      await deleteUser(id);
    }
  }

  // 2. Sync Organizations
  if (
    eventType === "organization.created" ||
    eventType === "organization.updated"
  ) {
    const { id, name } = evt.data as any;
    await syncOrg(id, name);
  }

  if (eventType === "organization.deleted") {
    const { id } = evt.data as any;
    await deleteOrg(id);
  }

  // 3. Sync Memberships
  if (
    eventType === "organizationMembership.created" ||
    eventType === "organizationMembership.updated"
  ) {
    const { organization, public_user_data, role } = evt.data as any;
    await syncOrgMember(organization.id, public_user_data.user_id, role);
  }

  // 4. Handle Deletions
  if (eventType === "organizationMembership.deleted") {
    const { organization, public_user_data } = evt.data as any;
    await deleteOrgMember(organization.id, public_user_data.user_id);
  }

  return new Response("Webhook processed", { status: 200 });
}
