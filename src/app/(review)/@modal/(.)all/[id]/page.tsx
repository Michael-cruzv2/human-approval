import AllLeadDetailPage from "../../../all/[id]/page";
import DrawerShell from "./drawer-shell";

export default async function AllLeadModal(
  props: Parameters<typeof AllLeadDetailPage>[0],
) {
  return (
    <DrawerShell>
      <AllLeadDetailPage {...props} />
    </DrawerShell>
  );
}
