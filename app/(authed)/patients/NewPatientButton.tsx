"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { BlueButton } from "@/components/ui/BlueButton";
import { createClient } from "@/lib/supabase/client";

type FormState = {
  firstName: string;
  middleName: string;
  lastName: string;
  ageRange: string;
  gender: string;
  patientRefId: string;
  initialNotes: string;
};

const INITIAL_FORM: FormState = {
  firstName: "",
  middleName: "",
  lastName: "",
  ageRange: "",
  gender: "",
  patientRefId: "",
  initialNotes: "",
};

export default function NewPatientButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(INITIAL_FORM);

  const close = () => {
    if (saving) return;
    setOpen(false);
    setError(null);
    setForm(INITIAL_FORM);
  };

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(null);

    const supabase = createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      setSaving(false);
      setError(userError?.message ?? "Session expired. Please sign in again.");
      return;
    }

    const payload = {
      clinician_id: user.id,
      first_name: form.firstName.trim(),
      middle_name: form.middleName.trim() || null,
      last_name: form.lastName.trim(),
      age_range: form.ageRange.trim() || null,
      gender: form.gender.trim() || null,
      patient_ref_id: form.patientRefId.trim() || null,
      initial_notes: form.initialNotes.trim() || null,
      status: "active",
    };

    const { error: insertError } = await supabase.from("patients").insert(payload);
    setSaving(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    close();
    router.refresh();
  };

  return (
    <>
      <BlueButton type="button" variant="primary" onClick={() => setOpen(true)}>
        + New patient
      </BlueButton>

      {open ? (
        <div className="patient-modal-backdrop" role="dialog" aria-modal="true" aria-label="Create new patient">
          <form className="patient-modal" onSubmit={onSubmit}>
            <div className="patient-modal-head">
              <h3>New patient</h3>
              <button type="button" onClick={close} className="patient-modal-close" aria-label="Close">
                ×
              </button>
            </div>

            {error ? (
              <p className="message error" role="alert">
                {error}
              </p>
            ) : null}

            <div className="patient-modal-grid">
              <label>
                First name
                <input
                  required
                  value={form.firstName}
                  onChange={(e) => setForm((p) => ({ ...p, firstName: e.target.value }))}
                />
              </label>
              <label>
                Middle name
                <input value={form.middleName} onChange={(e) => setForm((p) => ({ ...p, middleName: e.target.value }))} />
              </label>
              <label>
                Last name
                <input required value={form.lastName} onChange={(e) => setForm((p) => ({ ...p, lastName: e.target.value }))} />
              </label>
              <label>
                Age range
                <select value={form.ageRange} onChange={(e) => setForm((p) => ({ ...p, ageRange: e.target.value }))}>
                  <option value="">Select range</option>
                  <option value="Under 18">Under 18</option>
                  <option value="18 - 30">18 - 30</option>
                  <option value="31 - 45">31 - 45</option>
                  <option value="46 - 60">46 - 60</option>
                  <option value="61 - 75">61 - 75</option>
                  <option value="Over 75">Over 75</option>
                </select>
              </label>
              <label>
                Gender
                <select value={form.gender} onChange={(e) => setForm((p) => ({ ...p, gender: e.target.value }))}>
                  <option value="">Select</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other</option>
                </select>
              </label>
              <label>
                Patient Ref ID
                <input
                  placeholder="Optional"
                  value={form.patientRefId}
                  onChange={(e) => setForm((p) => ({ ...p, patientRefId: e.target.value }))}
                />
              </label>
            </div>

            <label>
              Initial notes
              <textarea
                rows={4}
                value={form.initialNotes}
                onChange={(e) => setForm((p) => ({ ...p, initialNotes: e.target.value }))}
              />
            </label>

            <div className="patient-modal-actions">
              <BlueButton type="button" variant="secondary" onClick={close} disabled={saving}>
                Cancel
              </BlueButton>
              <BlueButton type="submit" variant="primary" disabled={saving}>
                {saving ? "Creating..." : "Create patient"}
              </BlueButton>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}
