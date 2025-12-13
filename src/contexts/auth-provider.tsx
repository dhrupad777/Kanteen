
"use client";

import type { ReactNode } from "react";
import React, { createContext, useState, useEffect } from 'react';
import { signInWithEmailAndPassword, signOut, User } from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import { doc, onSnapshot } from "firebase/firestore";
import type { UserProfile } from "@/types";

interface AuthContextType {
  user: User | null;
  userProfile: UserProfile | null;
  loading: boolean;
  signInWithEmail: (email: string, password: string) => Promise<any>;
  signOutUser: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribeAuth = auth.onAuthStateChanged((user) => {
        if (user) {
            setUser(user);
            const userRef = doc(db, "users", user.uid);
            const unsubscribeFirestore = onSnapshot(userRef, (docSnap) => {
                if (docSnap.exists()) {
                    setUserProfile(docSnap.data() as UserProfile);
                } else {
                    setUserProfile(null);
                }
                setLoading(false);
            }, () => {
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
    return signInWithEmailAndPassword(auth, email, password);
  };

  const signOutUser = () => {
    return signOut(auth);
  };

  const value = {
    user,
    userProfile,
    loading,
    signInWithEmail,
    signOutUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
