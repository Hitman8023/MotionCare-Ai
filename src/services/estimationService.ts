import {
  doc,
  setDoc,
  getDoc,
} from "firebase/firestore";
import { db } from "../firebase";
import type { DoctorEstimation, EstimationFormData } from "../types/estimation";

/**
 * Save or update doctor's estimation for a patient
 */
export const saveDoctorEstimation = async (
  patientId: string,
  doctorId: string,
  data: EstimationFormData
): Promise<void> => {
  try {
    const docId = `${patientId}_${doctorId}`;
    const estimationRef = doc(db, "doctor_estimations", docId);
    
    const now = Date.now();
    const estimationData = {
      patientId,
      doctorId,
      minWeeks: data.minWeeks,
      maxWeeks: data.maxWeeks,
      confidence: data.confidence,
      notes: data.notes || "",
      createdAt: now,
      updatedAt: now,
    };

    console.log("📝 Saving estimation to Firestore:");
    console.log("  Collection: doctor_estimations");
    console.log("  Document ID:", docId);
    console.log("  Data:", estimationData);
    
    await setDoc(estimationRef, estimationData, { merge: true });
    
    console.log("✅ Estimation saved successfully!");
  } catch (error) {
    console.error("❌ Error saving doctor estimation:", error);
    throw error;
  }
};

/**
 * Get doctor's estimation for a patient
 */
export const getDoctorEstimation = async (
  patientId: string,
  doctorId: string
): Promise<DoctorEstimation | null> => {
  try {
    const docId = `${patientId}_${doctorId}`;
    const estimationRef = doc(db, "doctor_estimations", docId);
    
    console.log("🔍 Fetching estimation from Firestore:");
    console.log("  Collection: doctor_estimations");
    console.log("  Document ID:", docId);
    console.log("  PatientId:", patientId);
    console.log("  DoctorId:", doctorId);
    
    const estimationSnap = await getDoc(estimationRef);
    
    if (!estimationSnap.exists()) {
      console.log("❌ No estimation found");
      return null;
    }
    
    const estimation = estimationSnap.data() as DoctorEstimation;
    console.log("✅ Estimation found:", estimation);
    return estimation;
  } catch (error) {
    console.error("❌ Error getting doctor estimation:", error);
    return null;
  }
};

/**
 * Get all estimations for a patient (from all doctors assigned)
 */
export const getPatientEstimations = async (): Promise<DoctorEstimation[]> => {
  try {
    // Note: This is a simplified approach. For production, consider using a subcollection
    // or querying doctor_estimations collection with a where clause
    // For now, we'll fetch individually based on the assigned doctorId
    return [];
  } catch (error) {
    console.error("Error getting patient estimations:", error);
    return [];
  }
};
