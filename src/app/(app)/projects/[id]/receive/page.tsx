import { QrReceiveView } from "@/components/QrReceiveView";
import { canManageProcurement, canReceive, requireProfile } from "@/lib/auth";

export default async function ReceivePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ item?: string }>;
}) {
  const { id } = await params;
  const { item } = await searchParams;
  const profile = await requireProfile();

  return (
    <QrReceiveView
      projectId={id}
      initialItemId={item ?? null}
      canReceive={canReceive(profile.role) || canManageProcurement(profile.role)}
    />
  );
}
