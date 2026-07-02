import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "./firebase";

export interface UnavailableDate {
  date: string; // YYYY-MM-DD
  reason: string;
}

export interface AppSettings {
  reasons: string[];
  amSlots: number;
  pmSlots: number;
  amEnabled: boolean;
  pmEnabled: boolean;
  unavailableDates: UnavailableDate[];
  monthlyLimit: number; // global default max bookings per student per month
  availableDays: number[]; // 0=Sun..6=Sat, days students may book
}

export const defaultSettings: AppSettings = {
  reasons: ["Consultation", "Enrollment", "Advising", "Records Request"],
  amSlots: 5,
  pmSlots: 5,
  amEnabled: true,
  pmEnabled: true,
  unavailableDates: [],
  monthlyLimit: 5,
  availableDays: [1, 2, 3, 4, 5],
};

export const DEFAULT_ADMIN_EMAIL = "mjfernandez@tsu.edu.ph";

export async function getSettings(): Promise<AppSettings> {
  const snap = await getDoc(doc(db, "settings", "config"));
  if (!snap.exists()) return defaultSettings;
  return { ...defaultSettings, ...(snap.data() as Partial<AppSettings>) };
}

export async function saveSettings(s: AppSettings) {
  await setDoc(doc(db, "settings", "config"), s, { merge: true });
}