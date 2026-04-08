// ============================================================
// firebase.js — Configuración central de Firebase
// ⚠️  Reemplaza los valores con los de tu proyecto Firebase
// ============================================================

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDcJ9mpGXRgD0g5txV3xKKqPqSSgSB9B2Q",
  authDomain: "pana-84c2a.firebaseapp.com",
  projectId: "pana-84c2a",
  storageBucket: "pana-84c2a.firebasestorage.app",
  messagingSenderId: "981129591651",
  appId: "1:981129591651:web:d6ee1ba5964fd992fcf156"
};

// ── Inicialización ──────────────────────────────────────────
import { initializeApp }       from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore }        from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getAuth }             from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const app  = initializeApp(FIREBASE_CONFIG);
const db   = getFirestore(app);
const auth = getAuth(app);

export { app, db, auth };
