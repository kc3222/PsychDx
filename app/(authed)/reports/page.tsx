import { FileText } from "lucide-react";
import ComingSoon from "../_components/ComingSoon";

export const metadata = { title: "Reports · PsychDx" };

export default function ReportsPage() {
  return (
    <ComingSoon
      title="Reports"
      subtitle="Exportable clinical summaries"
      icon={<FileText size={22} />}
      headline="Reports isn't built yet"
      description="This page will turn a patient's sessions and diagnostic scores into a summary you can review, print, or hand off."
      planned={[
        "A per-patient summary drawn from their session history",
        "Diagnostic trends and risk changes over time",
        "Export to PDF for records and referrals",
      ]}
    />
  );
}
