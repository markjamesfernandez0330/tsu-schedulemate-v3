import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { onAuthStateChanged, signInWithPopup, signOut, OAuthProvider, type User } from "firebase/auth";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { ADMIN_EMAIL, auth, db, microsoftProvider } from "./firebase";

type Role = "admin" | "student";

interface AuthState {
  user: User | null;
  role: Role | null;
  loading: boolean;
  photoUrl: string | null;
  signIn: () => Promise<void>;
  signOutUser: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

const PHOTO_KEY = (uid: string) => `tsu.msphoto.${uid}`;

async function fetchGraphPhoto(accessToken: string): Promise<string | null> {
  try {
    const res = await fetch("https://graph.microsoft.com/v1.0/me/photo/$value", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as string);
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [loading, setLoading] = useState(true);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (!u) {
        setRole(null);
        setPhotoUrl(null);
        setLoading(false);
        return;
      }
      // load cached MS Graph photo if available
      try {
        const cached = localStorage.getItem(PHOTO_KEY(u.uid));
        if (cached) setPhotoUrl(cached);
        else if (u.photoURL) setPhotoUrl(u.photoURL);
      } catch { /* ignore */ }

      const email = (u.email ?? "").toLowerCase();
      const isBootstrapAdmin = email === ADMIN_EMAIL.toLowerCase();

      const userRef = doc(db, "users", u.uid);
      const userSnap = await getDoc(userRef);
      let userRole: Role = "student";

      const adminRef = doc(db, "admins", email);
      const adminSnap = await getDoc(adminRef);
      if (isBootstrapAdmin || adminSnap.exists()) userRole = "admin";

      if (!userSnap.exists()) {
        await setDoc(userRef, {
          email,
          displayName: u.displayName ?? "",
          role: userRole,
          createdAt: serverTimestamp(),
        });
      } else if (userSnap.data().role !== userRole) {
        await setDoc(userRef, { role: userRole }, { merge: true });
      }

      if (isBootstrapAdmin && !adminSnap.exists()) {
        await setDoc(adminRef, { email, addedBy: "system", createdAt: serverTimestamp() });
      }

      setRole(userRole);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const signIn = async () => {
    const result = await signInWithPopup(auth, microsoftProvider());
    const cred = OAuthProvider.credentialFromResult(result);
    const accessToken = cred?.accessToken;
    if (accessToken && result.user) {
      const dataUrl = await fetchGraphPhoto(accessToken);
      if (dataUrl) {
        try { localStorage.setItem(PHOTO_KEY(result.user.uid), dataUrl); } catch { /* ignore */ }
        setPhotoUrl(dataUrl);
      } else if (result.user.photoURL) {
        setPhotoUrl(result.user.photoURL);
      }
    }
  };
  const signOutUser = async () => {
    if (user) { try { localStorage.removeItem(PHOTO_KEY(user.uid)); } catch { /* ignore */ } }
    setPhotoUrl(null);
    await signOut(auth);
  };

  return (
    <AuthContext.Provider value={{ user, role, loading, photoUrl, signIn, signOutUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
