"use client";

import { useRouter } from "next/navigation";
import { BlueButton } from "@/components/ui/BlueButton";

export default function NewAnalysisButton({ patientId }: { patientId: string }) {
  const router = useRouter();

  return (
    <BlueButton type="button" variant="primary" onClick={() => router.push(`/home?patientId=${patientId}`)}>
      + New analysis
    </BlueButton>
  );
}
