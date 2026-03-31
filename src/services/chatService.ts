import {
  doc,
  setDoc,
  getDoc,
  collection,
  addDoc,
  query,
  orderBy,
  onSnapshot,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase";

/**
 * Message Type
 */
interface Message {
  id: string;
  text: string;
  senderId: string;
  timestamp?: any;
}

/**
 * Ensure chat exists (1 patient = 1 chat)
 */
export const ensureChatExists = async (
  patientId: string,
  doctorId: string
) => {
  try {
    const chatRef = doc(db, "chats", patientId);
    const chatSnap = await getDoc(chatRef);

    if (!chatSnap.exists()) {
      await setDoc(chatRef, {
        patientId,
        doctorId,
        createdAt: serverTimestamp(),
      });
    }

    return patientId; // chatId
  } catch (error) {
    console.error("Error ensuring chat exists:", error);
    throw error;
  }
};

/**
 * Send a message
 */
export const sendMessage = async (
  patientId: string,
  message: string,
  senderId: string
) => {
  if (!message.trim()) return;

  try {
    const messagesRef = collection(db, "chats", patientId, "messages");

    await addDoc(messagesRef, {
      text: message,
      senderId,
      timestamp: serverTimestamp(),
    });
  } catch (error) {
    console.error("Error sending message:", error);
    throw error;
  }
};

/**
 * Listen to real-time messages
 */
export const listenMessages = (
  patientId: string,
  callback: (messages: Message[]) => void
) => {
  const q = query(
    collection(db, "chats", patientId, "messages"),
    orderBy("timestamp", "asc")
  );

  const unsubscribe = onSnapshot(
    q,
    (snapshot) => {
      const messages: Message[] = snapshot.docs.map((doc) => {
        const data = doc.data() as {
          text?: string;
          senderId?: string;
          timestamp?: any;
        };

        return {
          id: doc.id,
          text: data.text || "",
          senderId: data.senderId || "",
          timestamp: data.timestamp || null,
        };
      });

      callback(messages);
    },
    (error) => {
      console.error("Listener error:", error);
    }
  );

  return unsubscribe;
};