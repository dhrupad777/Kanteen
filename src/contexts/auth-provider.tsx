
"use client";

import type { ReactNode } from "react";
import React, { createContext, useState, useEffect } from 'react';
import { signInWithEmailAndPassword, signOut, User, createUserWithEmailAndPassword } from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import { doc, onSnapshot, setDoc, getDoc } from "firebase/firestore";
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
    const unsubscribeAuth = auth.onAuthStateChanged(async (user) => {
        if (user) {
            setUser(user);
            const userRef = doc(db, "users", user.uid);

            const docSnap = await getDoc(userRef);
            if (!docSnap.exists()) {
                // This is a first-time login for this user.
                // Let's create their profile document.
                const newProfile: UserProfile = {
                    uid: user.uid,
                    email: user.email || 'manager@kanteen.com',
                    name: user.displayName || 'Canteen Manager',
                    role: 'manager'
                };
                try {
                    await setDoc(userRef, newProfile);
                } catch (e) {
                    console.error("Error creating user profile document:", e);
                }
            }

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
