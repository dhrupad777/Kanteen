
"use client";

import type { ReactNode } from "react";
import React, { createContext, useState, useEffect } from 'react';
import { signInWithEmailAndPassword, signOut, User, createUserWithEmailAndPassword } from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import { doc, onSnapshot, setDoc, getDoc } from "firebase/firestore";
import type { UserProfile } from "@/types";
import { signInWithGoogle as googleSignIn, BYPASS_AUTH } from '@/lib/auth';

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
  signInWithEmail: (email: string, password: string) => Promise<any>;
  signInWithGoogle: () => Promise<any>;
  signOutUser: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(BYPASS_AUTH ? MOCK_USER : null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(BYPASS_AUTH ? MOCK_USER_PROFILE : null);
  const [loading, setLoading] = useState(!BYPASS_AUTH);

  useEffect(() => {
    // Skip real auth listener if bypassing authentication
    if (BYPASS_AUTH) {
      console.log("🔓 AUTH BYPASS ENABLED - Using mock user for testing");
      return;
    }

    const unsubscribeAuth = auth.onAuthStateChanged(async (user) => {
      if (user) {
        setUser(user);
        // Default to fetching from 'users' collection
        const userRef = doc(db, "users", user.uid);

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
        // Cleanup firestore listener on user change
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
    signInWithEmail,
    signInWithGoogle,
    signOutUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
