import { useEffect, useState } from "react";
import Chat from "../components/Chat";
import { db } from "../firebase";
import { doc, getDoc, collection, query, where, getDocs } from "firebase/firestore";
import "../styles/chat.css";

interface User {
  uid: string;
  role: "patient" | "doctor";
  profileDocId: string;
}

interface PatientInfo {
  uid: string;
  name: string;
}

const ChatPage = ({ currentUser }: { currentUser: User }) => {
  const [patientId, setPatientId] = useState<string | null>(null);
  const [doctorId, setDoctorId] = useState<string | null>(null);
  const [patients, setPatients] = useState<PatientInfo[]>([]);
  const [selectedPatientName, setSelectedPatientName] = useState<string>("");

  // 🔥 PATIENT FLOW
  useEffect(() => {
    const fetchPatientData = async () => {
      if (currentUser.role !== "patient") return;

      const patientRef = doc(db, "patients", currentUser.profileDocId);
      const patientSnap = await getDoc(patientRef);

      if (patientSnap.exists()) {
        const data = patientSnap.data();
        setPatientId(currentUser.uid); // chatId = uid
        setDoctorId(data.assignedDoctorId);
      }
    };

    fetchPatientData();
  }, [currentUser]);

  // 🔥 DOCTOR FLOW
  useEffect(() => {
    const fetchDoctorPatients = async () => {
      if (currentUser.role !== "doctor") return;

      const q = query(
        collection(db, "patients"),
        where("assignedDoctorId", "==", currentUser.uid)
      );

      const snapshot = await getDocs(q);

      const patientList = snapshot.docs.map((doc) => ({
        uid: doc.data().uid,
        name: doc.data().displayName || "Unknown",
      }));

      setPatients(patientList);
      setDoctorId(currentUser.uid);
    };

    fetchDoctorPatients();
  }, [currentUser]);

  // 👇 PATIENT VIEW
  if (currentUser.role === "patient") {
    if (!patientId || !doctorId) {
      return (
        <div className="chat-loading">
          <p>Loading chat...</p>
        </div>
      );
    }

    return (
      <Chat
        patientId={patientId}
        doctorId={doctorId}
        currentUserId={currentUser.uid}
        patientName="Your Doctor"
      />
    );
  }

  // 👇 DOCTOR VIEW
  return (
    <div className="doctor-chat-container">
      {/* Patients Sidebar */}
      <div className="patients-sidebar">
        <div className="patients-header">
          <h3>Patients ({patients.length})</h3>
        </div>
        <div className="patients-list">
          {patients.length === 0 ? (
            <div className="patients-empty">No patients assigned yet</div>
          ) : (
            patients.map((patient) => (
              <div
                key={patient.uid}
                className={`patient-item ${patientId === patient.uid ? "active" : ""}`}
                onClick={() => {
                  setPatientId(patient.uid);
                  setSelectedPatientName(patient.name);
                }}
              >
                {patient.name}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Chat Area */}
      <div className="chat-area">
        {patientId ? (
          <Chat
            patientId={patientId}
            doctorId={doctorId!}
            currentUserId={currentUser.uid}
            patientName={selectedPatientName || "Patient"}
          />
        ) : (
          <div className="no-patient-selected">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
              />
            </svg>
            <p>Select a patient to start messaging</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ChatPage;