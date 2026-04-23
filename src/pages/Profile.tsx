import { useEffect, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { auth, db } from "../firebase";
import type { SessionUser } from "../types/auth";

type ProfileProps = {
  session: SessionUser;
};

type ProfileDoc = {
  displayName?: string;
  email?: string;
  role?: string;
  createdAt?: string;
  age?: number;
  surgery?: string;
  condition?: string;
  stage?: string;
  therapist?: string;
};

export default function Profile({ session }: ProfileProps) {
  const [profile, setProfile] = useState<ProfileDoc | null>(null);

  useEffect(() => {
    const collectionName = session.role === "doctor" ? "doctors" : "patients";
    const profileQuery = query(
      collection(db, collectionName),
      where("uid", "==", session.uid),
    );
    const unsubscribe = onSnapshot(profileQuery, (snapshot) => {
      if (snapshot.empty) {
        setProfile(null);
        return;
      }
      setProfile(snapshot.docs[0].data() as ProfileDoc);
    });
    return unsubscribe;
  }, [session.role, session.uid]);

  const displayName = profile?.displayName || session.displayName;
  const roleLabel = session.role === "doctor" ? "Doctor" : "Patient";
  const email = profile?.email || auth.currentUser?.email || "--";
  const createdAt = profile?.createdAt
    ? new Date(profile.createdAt).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "--";

  return (
    <>
      <div className="page-header">
        <div className="page-title">Profile</div>
        <div className="page-subtitle">Account details and role info</div>
      </div>

      <div className="section">
        <div className="card" style={{ maxWidth: "720px" }}>
          <div className="card-header">
            <div className="card-title">{displayName}</div>
          </div>
          <div style={{ display: "grid", gap: "12px" }}>
            <div
              className="patient-row"
              style={{ border: "1px solid var(--border-light)" }}
            >
              <div className="patient-row-main">
                <div style={{ fontSize: "12px", color: "var(--color-text)" }}>
                  Role
                </div>
                <div style={{ fontSize: "14px", fontWeight: 700 }}>
                  {roleLabel}
                </div>
              </div>
              <div className="patient-row-stat">
                <div style={{ fontSize: "12px", color: "var(--color-text)" }}>
                  UID
                </div>
                <div style={{ fontFamily: "var(--mono)", fontSize: "12px" }}>
                  {session.uid}
                </div>
              </div>
            </div>

            <div
              className="patient-row"
              style={{ border: "1px solid var(--border-light)" }}
            >
              <div className="patient-row-main">
                <div style={{ fontSize: "12px", color: "var(--color-text)" }}>
                  Email
                </div>
                <div style={{ fontSize: "14px", fontWeight: 700 }}>{email}</div>
              </div>
              <div className="patient-row-stat">
                <div style={{ fontSize: "12px", color: "var(--color-text)" }}>
                  Created
                </div>
                <div style={{ fontFamily: "var(--mono)", fontSize: "12px" }}>
                  {createdAt}
                </div>
              </div>
            </div>

            {session.role === "patient" ? (
              <div
                className="patient-row"
                style={{ border: "1px solid var(--border-light)" }}
              >
                <div className="patient-row-main">
                  <div style={{ fontSize: "12px", color: "var(--color-text)" }}>
                    Surgery
                  </div>
                  <div style={{ fontSize: "14px", fontWeight: 700 }}>
                    {profile?.surgery || profile?.condition || "--"}
                  </div>
                  <div
                    style={{
                      fontSize: "12px",
                      color: "var(--color-text)",
                      marginTop: "6px",
                    }}
                  >
                    Stage: {profile?.stage || "--"}
                  </div>
                </div>
                <div className="patient-row-stat">
                  <div style={{ fontSize: "12px", color: "var(--color-text)" }}>
                    Therapist
                  </div>
                  <div style={{ fontFamily: "var(--mono)", fontSize: "12px" }}>
                    {profile?.therapist || "--"}
                  </div>
                </div>
              </div>
            ) : (
              <div
                className="patient-row"
                style={{ border: "1px solid var(--border-light)" }}
              >
                <div className="patient-row-main">
                  <div style={{ fontSize: "12px", color: "var(--color-text)" }}>
                    Clinic Access
                  </div>
                  <div style={{ fontSize: "14px", fontWeight: 700 }}>
                    Active
                  </div>
                </div>
                <div className="patient-row-stat">
                  <div style={{ fontSize: "12px", color: "var(--color-text)" }}>
                    Patients
                  </div>
                  <div style={{ fontFamily: "var(--mono)", fontSize: "12px" }}>
                    Managed in Doctor Dashboard
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
