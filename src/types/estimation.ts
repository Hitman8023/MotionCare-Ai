export type DoctorEstimation = {
  patientId: string;
  doctorId: string;
  minWeeks: number;
  maxWeeks: number;
  confidence: number;
  notes?: string;
  createdAt: number;
  updatedAt: number;
};

export type EstimationFormData = {
  minWeeks: number;
  maxWeeks: number;
  confidence: number;
  notes: string;
};
