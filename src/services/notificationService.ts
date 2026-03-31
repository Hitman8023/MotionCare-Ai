import {
  addDoc,
  collection,
  onSnapshot,
  orderBy,
  query,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "../firebase";

export type AppNotification = {
  id: string;
  message: string;
  kind: "report" | "system";
  isRead: boolean;
  createdAtMs: number;
  createdAtIso: string;
};

function notificationsCollection(userUid: string) {
  return collection(db, "user_notifications", userUid, "items");
}

export function subscribeToNotifications(
  userUid: string,
  onChange: (items: AppNotification[]) => void,
  maxItems = 20,
): Unsubscribe {
  const q = query(
    notificationsCollection(userUid),
    orderBy("createdAtMs", "desc"),
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const next = snapshot.docs
        .map((docItem) => {
          const data = docItem.data() as Partial<AppNotification>;
          return {
            id: docItem.id,
            message: data.message || "Notification",
            kind: data.kind === "report" ? "report" : "system",
            isRead: Boolean(data.isRead),
            createdAtMs: Number(data.createdAtMs || 0),
            createdAtIso: String(data.createdAtIso || ""),
          } satisfies AppNotification;
        })
        .sort((a, b) => b.createdAtMs - a.createdAtMs)
        .slice(0, maxItems);
      onChange(next);
    },
    () => {
      onChange([]);
    },
  );
}

export async function createNotification(
  userUid: string,
  message: string,
  kind: AppNotification["kind"] = "system",
): Promise<void> {
  const now = new Date();
  await addDoc(notificationsCollection(userUid), {
    message,
    kind,
    isRead: false,
    createdAtMs: now.getTime(),
    createdAtIso: now.toISOString(),
  });
}
