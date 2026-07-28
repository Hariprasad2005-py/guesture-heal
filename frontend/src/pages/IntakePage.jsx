import { useState } from "react";
import { patientApi } from "../utils/apiService";
import { useAppStore } from "../store/appStore";
import toast from "react-hot-toast";
import { useNavigate } from 'react-router-dom';
export default function IntakePage() {
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { setCurrentPatient } = useAppStore();

  const [form, setForm] = useState({
    name: "",
    age: "",
    gender: "",
    contact: "",
    condition: "",
    surgeryType: "",
    surgeryDate: "",
    affectedSide: "",
    goals: "",
    painLevel: 5,
    notes: "",
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);

    try {
      const data = await patientApi.create(form);
      setCurrentPatient(data.patient);
      toast.success("Patient created successfully!");
      navigate("/dashboard");
    } catch (err) {
      toast.error(err.message || "Failed to create patient");
    } finally {
      setLoading(false);
    }
  }

  const steps = [
    {
      title: "Personal Information",
      fields: ["name", "age", "gender", "contact"],
    },
    {
      title: "Clinical Information",
      fields: ["condition", "surgeryType", "surgeryDate", "affectedSide"],
    },
    {
      title: "Goals & Notes",
      fields: ["goals", "painLevel", "notes"],
    },
  ];

  const currentStep = steps[step];

  return (
    <div className="max-w-2xl mx-auto py-12 px-4">
      <div className="bg-white rounded-lg border border-slate-200 p-8 shadow-sm">
        <h1 className="text-3xl font-bold text-slate-900 mb-2">Patient Intake Form</h1>
        <p className="text-slate-600 mb-8">
          Step {step + 1} of {steps.length}: {currentStep.title}
        </p>

        {/* Progress bar */}
        <div className="mb-8 h-2 bg-slate-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-teal-600 transition-all"
            style={{ width: `${((step + 1) / steps.length) * 100}%` }}
          />
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {step === 0 && (
            <>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Name *
                </label>
                <input
                  type="text"
                  name="name"
                  value={form.name}
                  onChange={handleChange}
                  className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Age *
                  </label>
                  <input
                    type="number"
                    name="age"
                    value={form.age}
                    onChange={handleChange}
                    className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Gender *
                  </label>
                  <select
                    name="gender"
                    value={form.gender}
                    onChange={handleChange}
                    className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500"
                    required
                  >
                    <option value="">Select</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Contact (Phone/Email)
                </label>
                <input
                  type="text"
                  name="contact"
                  value={form.contact}
                  onChange={handleChange}
                  className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Condition *
                </label>
                <select
                  name="condition"
                  value={form.condition}
                  onChange={handleChange}
                  className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500"
                  required
                >
                  <option value="">Select Condition</option>
                  <option value="Rotator Cuff">Rotator Cuff</option>
                  <option value="ACL Reconstruction">ACL Reconstruction</option>
                  <option value="Stroke Rehabilitation">Stroke Rehabilitation</option>
                  <option value="Hand Surgery Recovery">Hand Surgery Recovery</option>
                  <option value="Fracture Recovery">Fracture Recovery</option>
                  <option value="Nerve Injury Rehabilitation">Nerve Injury Rehabilitation</option>
                  <option value="Wrist Rehabilitation">Wrist Rehabilitation</option>
                  <option value="Parkinson's">Parkinson's</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Surgery Type
                </label>
                <input
                  type="text"
                  name="surgeryType"
                  value={form.surgeryType}
                  onChange={handleChange}
                  className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500"
                  placeholder="e.g., Arthroscopic Rotator Cuff Repair"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Surgery Date
                </label>
                <input
                  type="date"
                  name="surgeryDate"
                  value={form.surgeryDate}
                  onChange={handleChange}
                  className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Affected Side
                </label>
                <select
                  name="affectedSide"
                  value={form.affectedSide}
                  onChange={handleChange}
                  className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500"
                >
                  <option value="">Select</option>
                  <option value="Left">Left</option>
                  <option value="Right">Right</option>
                  <option value="Both">Both</option>
                </select>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Rehabilitation Goals <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    name="goals"
                    value={form.goals}
                    onChange={handleChange}
                    className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500 h-20 resize-none"
                    placeholder="What do you hope to achieve?"
                    required
                  />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Current Pain Level: {form.painLevel}/10
                </label>
                <input
                  type="range"
                  name="painLevel"
                  min="0"
                  max="10"
                  value={form.painLevel}
                  onChange={handleChange}
                  className="w-full pain-slider"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Additional Notes
                </label>
                <textarea
                  name="notes"
                  value={form.notes}
                  onChange={handleChange}
                  className="w-full px-4 py-2.5 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-teal-500 h-20 resize-none"
                  placeholder="Any other relevant information..."
                />
              </div>
            </>
          )}

          {/* Navigation */}
          <div className="flex gap-4 mt-8">
            <button
              type="button"
              onClick={() => setStep(Math.max(0, step - 1))}
              disabled={step === 0}
              className="px-6 py-2.5 rounded-lg border border-slate-200 text-slate-600 font-medium hover:bg-slate-50 disabled:opacity-50"
            >
              Back
            </button>

            {step < steps.length - 1 ? (
              <button
                type="button"
                onClick={() => setStep(step + 1)}
                className="ml-auto px-6 py-2.5 rounded-lg bg-teal-600 text-white font-medium hover:bg-teal-700"
              >
                Next
              </button>
            ) : (
              <button
                type="submit"
                disabled={loading}
                className="ml-auto px-6 py-2.5 rounded-lg bg-teal-600 text-white font-medium hover:bg-teal-700 disabled:opacity-50"
              >
                {loading ? "Creating..." : "Create Patient"}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}