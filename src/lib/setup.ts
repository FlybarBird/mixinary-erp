import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { getLocalDb, isLocalMode } from "@/lib/local/db";
import { createServiceClient } from "@/lib/supabase/server";

export async function needsSetup(): Promise<boolean> {
  if (isLocalMode()) {
    const db = getLocalDb();
    const row = db
      .prepare("select count(*) as c from user_profiles")
      .get() as { c: number };
    return row.c === 0;
  }

  try {
    const service = createServiceClient();
    const { count, error } = await service
      .from("user_profiles")
      .select("id", { count: "exact", head: true });
    if (error) {
      console.error("needsSetup profile count failed", error.message);
      return false;
    }
    return (count ?? 0) === 0;
  } catch (err) {
    console.error("needsSetup unavailable", err);
    return false;
  }
}

export type CreateAdminInput = {
  email: string;
  password: string;
  fullName: string;
};

export type CreateAdminResult =
  | { ok: true; userId: string; email: string; fullName: string | null }
  | { ok: false; error: string; status: number };

export async function createFirstAdmin(
  input: CreateAdminInput,
): Promise<CreateAdminResult> {
  const email = input.email.trim().toLowerCase();
  const password = input.password;
  const fullName = input.fullName.trim() || null;

  if (!email || !email.includes("@")) {
    return { ok: false, error: "Enter a valid email address", status: 400 };
  }
  if (password.length < 8) {
    return {
      ok: false,
      error: "Password must be at least 8 characters",
      status: 400,
    };
  }

  if (!(await needsSetup())) {
    return {
      ok: false,
      error: "Setup is already complete. Sign in instead.",
      status: 409,
    };
  }

  if (isLocalMode()) {
    const db = getLocalDb();
    const id = randomUUID();
    const hash = bcrypt.hashSync(password, 10);
    try {
      db.prepare(
        `insert into user_profiles (id, email, full_name, role, password_hash)
         values (?, ?, ?, 'administrator', ?)`,
      ).run(id, email, fullName, hash);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create admin";
      return { ok: false, error: message, status: 400 };
    }
    return { ok: true, userId: id, email, fullName };
  }

  try {
    const service = createServiceClient();
    const { data, error } = await service.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        role: "administrator",
      },
    });
    if (error || !data.user) {
      return {
        ok: false,
        error: error?.message || "Failed to create admin user",
        status: 400,
      };
    }

    const userId = data.user.id;
    const { error: profileError } = await service.from("user_profiles").upsert({
      id: userId,
      email,
      full_name: fullName,
      role: "administrator",
    });
    if (profileError) {
      // Auth user exists; try a direct role update if trigger already inserted a row
      await service
        .from("user_profiles")
        .update({
          email,
          full_name: fullName,
          role: "administrator",
        })
        .eq("id", userId);
    }

    return { ok: true, userId, email, fullName };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to create admin user";
    return { ok: false, error: message, status: 500 };
  }
}
