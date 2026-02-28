import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { ZodError } from "zod";
import type { Context } from "./context";

const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError:
          error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    };
  },
});

export const createTRPCRouter = t.router;
export const publicProcedure = t.procedure;

/**
 * Reusable middleware that enforces users are logged in before running the procedure.
 */
const enforceUserIsAuthed = t.middleware(({ ctx, next }) => {
  if (!(ctx.auth.clerkUserId && ctx.auth.userId)) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return next({
    ctx: {
      ...ctx,
      auth: {
        ...ctx.auth,
        clerkUserId: ctx.auth.clerkUserId,
        userId: ctx.auth.userId,
        isSuperAdmin: ctx.auth.isSuperAdmin,
      },
    },
  });
});

export const protectedProcedure = t.procedure.use(enforceUserIsAuthed);

/**
 * Enforces Org context.
 */
const enforceOrg = t.middleware(({ ctx, next }) => {
  if (!ctx.auth.orgId) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Missing Org Context or Org not synced",
    });
  }
  return next({
    ctx: {
      ...ctx,
      auth: {
        ...ctx.auth,
        clerkUserId: ctx.auth.clerkUserId,
        clerkOrgId: ctx.auth.clerkOrgId,
        userId: ctx.auth.userId,
        orgId: ctx.auth.orgId,
        role: ctx.auth.role,
      },
    },
  });
});

export const orgProcedure = protectedProcedure.use(enforceOrg);

/**
 * Enforces Org Admin role.
 */
const enforceOrgAdmin = t.middleware(({ ctx, next }) => {
  if (!(ctx.auth.orgId && ctx.auth.userId)) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }

  const role = ctx.auth.role;

  if (role !== "owner" && role !== "admin") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Org Admin access required",
    });
  }

  return next({ ctx });
});

export const orgAdminProcedure = orgProcedure.use(enforceOrgAdmin);

/**
 * Enforces Org Owner role.
 */

const enforceOrgOwner = t.middleware(({ ctx, next }) => {
  if (!(ctx.auth.orgId && ctx.auth.userId)) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }

  const role = ctx.auth.role;

  if (role !== "owner") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Org Owner access required",
    });
  }

  return next({ ctx });
});

export const orgOwnerProcedure = orgProcedure.use(enforceOrgOwner);

/**
 * Enforces Super Admin role (System wide).
 */
const enforceSuperAdmin = t.middleware(({ ctx, next }) => {
  if (!ctx.auth.userId) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }

  // Placeholder: Check against a hardcoded ID or a special flag in DB
  const isSuperAdmin = ctx.auth.isSuperAdmin;

  if (!isSuperAdmin) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Super Admin access required",
    });
  }

  return next({ ctx });
});

export const superAdminProcedure = protectedProcedure.use(enforceSuperAdmin);
