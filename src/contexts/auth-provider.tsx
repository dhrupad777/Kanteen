
"use client";

import type { ReactNode } from "react";
import React, { createContext, useState, useEffect } from 'react';
import { signInWithEmailAndPassword, signOut, User, getRedirectResult } from 'firebase/auth';
import { useRouter } from 'next/navigation';
import { auth, db } from '@/lib/firebase';
import { doc, onSnapshot, setDoc, getDoc, serverTimestamp } from "firebase/firestore";
import type { UserProfile } from "@/types";
import { signInWithGoogle as googleSignIn, BYPASS_AUTH, REDIRECT_PENDING_KEY } from '@/lib/auth';

// Mock user for testing (simulates a logged-in user)
const MOCK_USER = {
  uid: "test-user-123",
  email: "test@kanteen.com",
  displayName: "Test User",
  photoURL: null,
  emailVerified: true,
  getIdToken: () => Promise.resolve("mock-token-for-testing"),
} as unknown as User;

// Mock user profile for testing
const MOCK_USER_PROFILE: UserProfile = {
  uid: "test-user-123",
  name: "Test User",
  email: "test@kanteen.com",
};

interface AuthContextType {
  user: User | null;
  userProfile: UserProfile | null;
  loading: boolean;
  /** True while getRedirectResult is still in-flight after a Google redirect. Prevents sign-in button flash. */
  processingRedirect: boolean;
  signInWithEmail: (email: string, password: string) => Promise<any>;
  signInWithGoogle: () => Promise<any>;
  signOutUser: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(BYPASS_AUTH ? MOCK_USER : null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(BYPASS_AUTH ? MOCK_USER_PROFILE : null);
  const [loading, setLoading] = useState(!BYPASS_AUTH);
  // Always true on first render — cleared only after getRedirectResult resolves (fast if no
  // redirect is in progress). This prevents any flash of the sign-in screen on every load,
  // not just when the sessionStorage key happens to be set.
  const [processingRedirect, setProcessingRedirect] = useState(!BYPASS_AUTH);
  const router = useRouter();

  // Always call getRedirectResult on mount — it resolves in ~1 frame when there's no
  // pending redirect (fast no-op), and correctly processes the result when there is one.
  // This, combined with processingRedirect starting as true, eliminates any sign-in flash.
  useEffect(() => {
    if (BYPASS_AUTH) { setProcessingRedirect(false); return; }

    getRedirectResult(auth).then((result) => {
      sessionStorage.removeItem(REDIRECT_PENDING_KEY);
      setProcessingRedirect(false);
      if (result?.user) {
        router.replace('/student');
      }
    }).catch((error) => {
      console.error('[Auth] getRedirectResult failed:', error?.code, error?.message);
      sessionStorage.removeItem(REDIRECT_PENDING_KEY);
      setProcessingRedirect(false);
    });
  }, [router]);

  useEffect(() => {
    // Skip real auth listener if bypassing authentication
    if (BYPASS_AUTH) {
      console.log("🔓 AUTH BYPASS ENABLED - Using mock user for testing");
      return;
    }

    const unsubscribeAuth = auth.onAuthStateChanged(async (user) => {
      if (user) {
        setUser(user);
        const userRef = doc(db, "users", user.uid);

        // Check once whether the profile document exists.
        // - New user  → create a complete profile from Google data (name, email, photo)
        // - Returning → only sync photoURL + lastLoginAt; never overwrite the stored name
        getDoc(userRef).then((snap) => {
          if (!snap.exists()) {
            // First-ever sign-in: persist the full Google profile
            setDoc(userRef, {
              uid: user.uid,
              name: user.displayName || '',
              email: user.email || '',
              photoURL: user.photoURL || '',
              createdAt: serverTimestamp(),
              lastLoginAt: serverTimestamp(),
            }).catch(() => {});
          } else {
            // Returning user: keep their stored name; refresh photo + timestamp only
            const sync: Record<string, any> = { lastLoginAt: serverTimestamp() };
            if (user.photoURL) sync.photoURL = user.photoURL;
            setDoc(userRef, sync, { merge: true }).catch(() => {});
          }
        }).catch(() => {});

        const unsubscribeFirestore = onSnapshot(userRef, (docSnap) => {
          if (docSnap.exists()) {
            setUserProfile(docSnap.data() as UserProfile);
          } else {
            setUserProfile(null);
          }
          setLoading(false);
        }, (error) => {
          console.error("Firestore snapshot error:", error);
          setUserProfile(null);
          setLoading(false);
        });
        return () => unsubscribeFirestore();
      } else {
        setUser(null);
        setUserProfile(null);
        setLoading(false);
      }
    });

    return () => unsubscribeAuth();
  }, []);

  const signInWithEmail = (email: string, password: string) => {
    if (BYPASS_AUTH) {
      console.log("🔓 AUTH BYPASS: signInWithEmail called (bypassed)");
      return Promise.resolve({ user: MOCK_USER });
    }
    return signInWithEmailAndPassword(auth, email, password);
  };

  const signInWithGoogle = () => {
    if (BYPASS_AUTH) {
      console.log("🔓 AUTH BYPASS: signInWithGoogle called (bypassed)");
      return Promise.resolve(MOCK_USER);
    }
    return googleSignIn();
  };

  const signOutUser = () => {
    if (BYPASS_AUTH) {
      console.log("🔓 AUTH BYPASS: signOutUser called (bypassed)");
      return Promise.resolve();
    }
    return signOut(auth);
  };

  const value = {
    user,
    userProfile,
    loading,
    processingRedirect,
    signInWithEmail,
    signInWithGoogle,
    signOutUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
