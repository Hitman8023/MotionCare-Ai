import { useEffect, useState } from "react";
import Chat from "../components/Chat";
import ChatListItem, { type ChatListItemData } from "../components/ChatListItem";
import { db } from "../firebase";
import {
  doc,
  getDoc,
  collection,
  query,
  where,
  getDocs,
  orderBy,
  limit,
} from "firebase/firestore";
import "../styles/chat.css";

interface User {
  uid: string;
  role: "patient" | "doctor";
  profileDocId: string;
}

const ChatPage = ({ currentUser }: { currentUser: User }) => {
  const [patientId, setPatientId] = useState<string | null>(null);
  const [doctorId, setDoctorId] = useState<string | null>(null);
  const [chats, setChats] = useState<ChatListItemData[]>([]);
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

      const patientList = snapshot.docs.map((patientDoc) => ({
        uid: patientDoc.data().uid,
        name: patientDoc.data().displayName || "Unknown",
      }));

      const chatsWithPreview = await Promise.all(
        patientList.map(async (patient) => {
          let lastMessage = "No messages yet";
          let timestamp: any = undefined;

          try {
            const latestMessageQuery = query(
              collection(db, "chats", patient.uid, "messages"),
              orderBy("timestamp", "desc"),
              limit(1),
            );
            const latestSnapshot = await getDocs(latestMessageQuery);

            if (!latestSnapshot.empty) {
              const latestMessage = latestSnapshot.docs[0].data();
              lastMessage = latestMessage.text || "No messages yet";
              timestamp = latestMessage.timestamp;
            }
          } catch (err) {
            console.error(`Failed to load preview for patient ${patient.uid}`, err);
          }

          return {
            id: patient.uid,
            name: patient.name,
            lastMessage,
            timestamp,
            unreadCount: 0,
          } as ChatListItemData;
        }),
      );

      chatsWithPreview.sort((a, b) => {
        const aTime = a.timestamp?.toDate?.()?.getTime?.() || 0;
        const bTime = b.timestamp?.toDate?.()?.getTime?.() || 0;
        return bTime - aTime;
      });

      setChats(chatsWithPreview);
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
      <div className="chat-page-fixed">
        <Chat
          patientId={patientId}
          doctorId={doctorId}
          currentUserId={currentUser.uid}
          patientName="Your Doctor"
        />
      </div>
    );
  }

  // 👇 DOCTOR VIEW
  return (
    <div className="doctor-chat-container">
      {/* Patients Sidebar */}
      <div className="patients-sidebar">
        <div className="patients-header">
          <h3>Chats ({chats.length})</h3>
        </div>
        <div className="patients-list">
          {chats.length === 0 ? (
            <div className="patients-empty">No patients assigned yet</div>
          ) : (
            chats.map((chat) => (
              <ChatListItem
                key={chat.id}
                chat={chat}
                isActive={patientId === chat.id}
                onClick={() => {
                  setPatientId(chat.id);
                  setSelectedPatientName(chat.name);
                }}
              />
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