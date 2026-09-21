import { History } from "lucide-react";
import ComingSoon from "../_components/ComingSoon";

export const metadata = { title: "History · PsychDx" };

export default function HistoryPage() {
  return (
    <ComingSoon
      title="History"
      subtitle="Past analyses across your caseload"
      icon={<History size={22} />}
      headline="History isn't built yet"
      description="This page will collect every analysis you have run, newest first, so you can pick up a case without going through the patient record."
      planned={[
        "A chronological feed of completed analyses",
        "Filters by patient, date range, and risk level",
        "Jump straight from an entry to the session it came from",
      ]}
    />
  );
}
