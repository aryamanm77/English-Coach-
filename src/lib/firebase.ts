import { initializeApp, getApps } from "firebase/app";
import { getFirestore, doc, setDoc, getDoc } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDNYUfZPQooPb_nsWi9UKyD-7qrt_xtfis",
  authDomain: "supernova-31273.firebaseapp.com",
  projectId: "supernova-31273",
  storageBucket: "supernova-31273.firebasestorage.app",
  messagingSenderId: "1056660547126",
  appId: "1:1056660547126:web:cf01ceb1dd3076cae35a97"
};

// Prevent re-initialization in Next.js hot reload
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
export const db_firebase = getFirestore(app);

export interface UserSettings {
  selectedPersona: string;
  selectedVoiceURI: string;
  modelTier: string;
  pushToTalk: boolean;
  updatedAt?: number;
}

const SETTINGS_DOC_ID = "default"; // Single shared settings doc; swap for userId when auth is added

export async function saveSettingsToFirebase(settings: UserSettings) {
  try {
    const ref = doc(db_firebase, "settings", SETTINGS_DOC_ID);
    await setDoc(ref, { ...settings, updatedAt: Date.now() }, { merge: true });
  } catch (err) {
    console.error("Failed to save settings to Firebase:", err);
  }
}

export async function loadSettingsFromFirebase(): Promise<UserSettings | null> {
  try {
    const ref = doc(db_firebase, "settings", SETTINGS_DOC_ID);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      return snap.data() as UserSettings;
    }
    return null;
  } catch (err) {
    console.error("Failed to load settings from Firebase:", err);
    return null;
  }
}
