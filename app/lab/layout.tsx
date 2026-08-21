import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { UserRole } from "@/generated/prisma/client";
import { requireUser } from "@/lib/auth";

export default async function LaboratoryLayout({ children }: { children: ReactNode }) {
  const user = await requireUser();
  if (user.role !== UserRole.LAB_TECHNICIAN && user.role !== UserRole.ADMIN) redirect("/studies");
  return children;
}
