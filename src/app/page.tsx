import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/session";

/** Single entry point — staff land on the internal dashboard, clients on theirs. */
export default async function RootPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  redirect(user.isClientUser ? "/portal" : "/dashboard");
}
