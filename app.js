import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
  getAuth, 
  signInWithEmailAndPassword, 
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
  getFirestore, 
  doc, 
  setDoc, 
  getDoc 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// 1. Firebase Configuration
const firebaseConfig = {
  apiKey: "AIzaSyDPhlfTNPORFIzQCvvEkvTsPJtjoqGSxvs",
  authDomain: "waec-neco-utme-cbt.firebaseapp.com",
  projectId: "waec-neco-utme-cbt",
  storageBucket: "waec-neco-utme-cbt.firebasestorage.app",
  messagingSenderId: "485089727740",
  appId: "1:485089727740:web:e69058cbf60cfacddd3379"
};

// Initialize Firebase Services
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// 2. Application State Variables
let questions = [];
let currentQuestionIndex = 0;
let userAnswers = {};
let timerInterval = null;
let timeLeft = 0;
let currentUser = null;
let unlockedSubjects = ['english', 'mathematics'];
let isAllUnlocked = false;
let lastAllowedSubject = 'english';
let pendingUnlockSubject = null;

// Temporary staging data for multi-step flows
let pendingRegData = null;
let verifiedResetEmail = "";

// Constant WhatsApp Channel Configuration
const WHATSAPP_CHANNEL_URL = "https://whatsapp.com/channel/0029VbDoREeFsn0avGYpKC0J";

const localBackupQuestions = [
  {
    id: 1,
    section: "Read the passage carefully and answer the following question: Continuous assessment provides a holistic view of learning over time rather than relying solely on high-stakes final exams.",
    question: "According to the passage, what is a key advantage of continuous assessment?",
    options: ["A. It eliminates all exams", "B. It offers a comprehensive view of student progress", "C. It reduces teacher workload", "D. It focuses only on final scores"],
    correctAnswer: 1,
    solution: "The passage notes that continuous assessment provides a 'holistic view of learning over time'."
  },
  {
    id: 2,
    section: "",
    question: "Solve for x: 3x - 7 = 14",
    options: ["A. 5", "B. 6", "C. 7", "D. 8"],
    correctAnswer: 2,
    solution: "3x = 14 + 7 => 3x = 21 => x = 21 / 3 => x = 7."
  }
];

const ALL_SUBJECTS = [
  'english', 'mathematics', 'biology', 'chemistry', 'physics',
  'government', 'economics', 'commerce', 'crk', 'irk',
  'accounting', 'geography', 'agricultural-science', 'literature', 'civiceducation'
];

document.addEventListener('DOMContentLoaded', () => {
  renderFooterChannelLink();

  onAuthStateChanged(auth, async (user) => {
    if (user) {
      try {
        const userDocRef = doc(db, "users", user.uid);
        const userSnap = await getDoc(userDocRef);

        if (userSnap.exists()) {
          const userData = userSnap.data();
          if (userData.isVerified === false) {
            await signOut(auth);
            return;
          }
        }
      } catch (err) {
        console.error("Auth check error:", err);
      }

      currentUser = {
        uid: user.uid,
        name: user.displayName || user.email.split('@')[0],
        email: user.email
      };

      await loadUserUnlockedSubjects();
      lastAllowedSubject = (isAllUnlocked || unlockedSubjects.includes('english')) ? 'english' : (unlockedSubjects[0] || 'english');
      showSetupScreen();
      await handlePaymentReturn();
    } else {
      currentUser = null;
      // Fixed sign-out state check: explicitly ensure auth screen & login tabs are cleanly re-enabled
      const loginBtn = document.getElementById('login-btn');
      if (loginBtn) {
        loginBtn.innerText = "Sign In & Proceed";
        loginBtn.disabled = false;
      }
      
      if (!document.getElementById('verify-box') || document.getElementById('verify-box').classList.contains('hidden')) {
        if (!document.getElementById('new-password-box') || document.getElementById('new-password-box').classList.contains('hidden')) {
          showAuthScreen();
        }
      }
    }
  });

  document.getElementById('tab-login').addEventListener('click', () => switchAuthTab('login'));
  document.getElementById('tab-register').addEventListener('click', () => switchAuthTab('register'));
  document.getElementById('tab-reset').addEventListener('click', () => switchAuthTab('reset'));

  document.getElementById('login-form').addEventListener('submit', handleLogin);
  document.getElementById('register-form').addEventListener('submit', handleRegistration);
  document.getElementById('confirm-verify-btn').addEventListener('click', handleVerifyRegistrationOtp);
  document.getElementById('reset-form').addEventListener('submit', handlePasswordResetRequest);
  document.getElementById('confirm-reset-verify-btn').addEventListener('click', handleVerifyResetOtp);
  document.getElementById('update-password-btn').addEventListener('click', handleSubmitNewPassword);

  document.getElementById('switch-user-btn').addEventListener('click', handleSignOut);
  document.getElementById('start-btn').addEventListener('click', handleStartExamClick);
  document.getElementById('practice-guide-btn').addEventListener('click', loadPracticeGuide);
  document.getElementById('close-guide-btn').addEventListener('click', () => document.getElementById('practice-guide').classList.add('hidden'));
  document.getElementById('unlock-all-btn').addEventListener('click', () => openUnlockModal(document.getElementById('subject')?.value || 'biology'));
  document.getElementById('close-unlock-modal').addEventListener('click', closeUnlockModal);
  document.getElementById('unlock-subject-btn').addEventListener('click', () => {
    const subject = pendingUnlockSubject;
    closeUnlockModal();
    if (subject) triggerPaystackPayment(subject);
  });
  document.getElementById('unlock-all-modal-btn').addEventListener('click', () => {
    closeUnlockModal();
    triggerPaystackPayment('all');
  });
  document.getElementById('subject').addEventListener('change', handleSubjectSelection);

  document.getElementById('prev-btn').addEventListener('click', () => navigateQuestion(-1));
  document.getElementById('next-btn').addEventListener('click', () => navigateQuestion(1));
  document.getElementById('submit-btn').addEventListener('click', () => submitExam());
  document.getElementById('restart-btn').addEventListener('click', resetExam);
});

function getChannelBannerHTML() {
  return `
    <div class="cbt-channel-box">
      <div class="channel-content">
        <h3>📢 Join Our Official WhatsApp Channel</h3>
        <p>Get instant access to verified WAEC & NECO ANSWERS, past question breakdowns, and daily study alerts.</p>
      </div>
      <a href="${WHATSAPP_CHANNEL_URL}" target="_blank" rel="noopener noreferrer" class="channel-btn">
        Join Channel Now
      </a>
    </div>
  `;
}

function renderFooterChannelLink() {
  const footerLink = document.getElementById('footer-wa-link');
  if (footerLink) {
    footerLink.innerHTML = `
      📢 Need verified WAEC & NECO ANSWERS? 
      <a href="${WHATSAPP_CHANNEL_URL}" target="_blank" rel="noopener noreferrer">
        Join our WhatsApp Channel →
      </a>
    `;
  }
}

function ensureChannelBanner(containerId) {
  const container = document.getElementById(containerId);
  if (container && !container.querySelector('.cbt-channel-box')) {
    const bannerWrapper = document.createElement('div');
    bannerWrapper.innerHTML = getChannelBannerHTML();
    container.insertBefore(bannerWrapper.firstElementChild, container.firstChild);
  }
}

function switchAuthTab(tab) {
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('.auth-form').forEach(form => form.classList.add('hidden'));
  document.getElementById('verify-box').classList.add('hidden');
  document.getElementById('reset-verify-box').classList.add('hidden');
  document.getElementById('new-password-box').classList.add('hidden');

  if (tab === 'login') {
    document.getElementById('tab-login').classList.add('active');
    document.getElementById('login-form').classList.remove('hidden');
  } else if (tab === 'register') {
    document.getElementById('tab-register').classList.add('active');
    document.getElementById('register-form').classList.remove('hidden');
  } else if (tab === 'reset') {
    document.getElementById('tab-reset').classList.add('active');
    document.getElementById('reset-form').classList.remove('hidden');
  }
}

// 1. SECURE REGISTRATION & OTP DISPATCH
async function handleRegistration(e) {
  if (e) e.preventDefault();
  const name = document.getElementById('reg-name').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const password = document.getElementById('reg-password').value;
  const regBtn = document.getElementById('reg-btn');

  if (!email || !password || !name) return;

  regBtn.innerText = "Sending Code...";
  regBtn.disabled = true;

  try {
    const res = await fetch('/.netlify/functions/send-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });

    const result = await res.json();
    if (!res.ok || !result.success) {
      throw new Error(result.error || "Failed to dispatch verification code.");
    }

    pendingRegData = { name, email, password };
    
    document.getElementById('register-form').classList.add('hidden');
    document.getElementById('verify-box').classList.remove('hidden');
    showNotice(`Verification code sent to ${email}. Check your inbox for the code.`, 'success');
  } catch (error) {
    showNotice(getFriendlyError(error, 'Registration could not be completed.'), 'error');
  } finally {
    regBtn.innerText = "Send Verification Code";
    regBtn.disabled = false;
  }
}

async function handleVerifyRegistrationOtp() {
  const enteredOtp = document.getElementById('verify-code-input').value.trim();
  const verifyBtn = document.getElementById('confirm-verify-btn');

  if (!enteredOtp || enteredOtp.length !== 6) {
    showNotice('Enter the 6-digit verification code.', 'error');
    return;
  }

  verifyBtn.innerText = "Verifying & Creating Account...";
  verifyBtn.disabled = true;

  try {
    const res = await fetch('/.netlify/functions/verify-and-register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: pendingRegData.email,
        password: pendingRegData.password,
        name: pendingRegData.name,
        otp: enteredOtp
      })
    });

    const result = await res.json();
    if (!res.ok || !result.success) {
      throw new Error(result.error || "Verification failed.");
    }

    showNotice('Account created successfully. You can now sign in.', 'success');
    document.getElementById('register-form').reset();
    document.getElementById('verify-code-input').value = "";
    pendingRegData = null;
    switchAuthTab('login');
  } catch (error) {
    showNotice(getFriendlyError(error, 'Verification could not be completed.'), 'error');
  } finally {
    verifyBtn.innerText = "Verify Account";
    verifyBtn.disabled = false;
  }
}

// 2. SECURE LOGIN WITH VERIFICATION ENFORCEMENT
async function handleLogin(e) {
  if (e) e.preventDefault();
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const loginBtn = document.getElementById('login-btn');

  if (!email || !password) return;

  loginBtn.innerText = "Signing In...";
  loginBtn.disabled = true;

  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    const userDocRef = doc(db, "users", user.uid);
    const userSnap = await getDoc(userDocRef);

    if (userSnap.exists()) {
      const userData = userSnap.data();
      if (!userData.isVerified) {
        await signOut(auth);
        showNotice('Your email address has not been verified.', 'error');
        loginBtn.innerText = "Sign In & Proceed";
        loginBtn.disabled = false;
        return;
      }
    }
    document.getElementById('login-form').reset();
  } catch (error) {
    showNotice(getFriendlyError(error, 'Sign-in failed. Check your email and password.'), 'error');
    loginBtn.innerText = "Sign In & Proceed";
    loginBtn.disabled = false;
  }
}

// 3. SECURE PASSWORD RESET FLOW
async function handlePasswordResetRequest(e) {
  if (e) e.preventDefault();
  const email = document.getElementById('reset-email').value.trim();
  const resetBtn = document.getElementById('reset-btn');

  if (!email) return;

  resetBtn.innerText = "Sending Code...";
  resetBtn.disabled = true;

  try {
    const res = await fetch('/.netlify/functions/send-reset-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });

    const result = await res.json();
    if (!res.ok || !result.success) {
      throw new Error(result.error || "Failed to dispatch reset code.");
    }

    verifiedResetEmail = email;
    document.getElementById('reset-form').classList.add('hidden');
    document.getElementById('reset-verify-box').classList.remove('hidden');
    showNotice(`Password reset code sent to ${email}.`, 'success');
  } catch (error) {
    showNotice(getFriendlyError(error, 'Password reset could not be started.'), 'error');
  } finally {
    resetBtn.innerText = "Send Reset Code";
    resetBtn.disabled = false;
  }
}

async function handleVerifyResetOtp() {
  const enteredOtp = document.getElementById('reset-verify-code-input').value.trim();
  const verifyBtn = document.getElementById('confirm-reset-verify-btn');

  if (!enteredOtp || enteredOtp.length !== 6) {
    showNotice('Enter the 6-digit reset code.', 'error');
    return;
  }

  verifyBtn.innerText = "Verifying Code...";
  verifyBtn.disabled = true;

  try {
    const res = await fetch('/.netlify/functions/verify-reset-otp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: verifiedResetEmail, otp: enteredOtp })
    });

    const result = await res.json();
    if (!res.ok || !result.success) {
      throw new Error(result.error || "Invalid or expired OTP code.");
    }

    showNotice('Code verified. Enter your new password.', 'success');
    document.getElementById('reset-verify-box').classList.add('hidden');
    document.getElementById('new-password-box').classList.remove('hidden');
  } catch (error) {
    showNotice(getFriendlyError(error, 'The verification code is not valid.'), 'error');
  } finally {
    verifyBtn.innerText = "Verify Code";
    verifyBtn.disabled = false;
  }
}

async function handleSubmitNewPassword() {
  const newPassword = document.getElementById('new-password-input').value;
  const updateBtn = document.getElementById('update-password-btn');

  if (!newPassword || newPassword.length < 6) {
    showNotice('Password must be at least 6 characters long.', 'error');
    return;
  }

  updateBtn.innerText = "Updating Password...";
  updateBtn.disabled = true;

  try {
    const res = await fetch('/.netlify/functions/update-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: verifiedResetEmail, newPassword })
    });

    const result = await res.json();
    if (!res.ok || !result.success) {
      throw new Error(result.error || "Failed to update password.");
    }

    showNotice('Password updated successfully. You can now sign in.', 'success');
    document.getElementById('reset-form').reset();
    document.getElementById('new-password-input').value = "";
    verifiedResetEmail = "";
    switchAuthTab('login');
  } catch (error) {
    showNotice(getFriendlyError(error, 'Password could not be updated.'), 'error');
  } finally {
    updateBtn.innerText = "Save New Password";
    updateBtn.disabled = false;
  }
}

async function handleSignOut() {
  try {
    await signOut(auth);
  } catch (error) {
    console.error("Sign Out Error:", error);
  }
}

async function loadUserUnlockedSubjects() {
  try {
    const userDocRef = doc(db, "users", currentUser.uid);
    const userSnap = await getDoc(userDocRef);

    if (userSnap.exists()) {
      const data = userSnap.data();
      unlockedSubjects = data.unlockedSubjects || ['english', 'mathematics'];
      isAllUnlocked = data.isAllUnlocked || false;
    } else {
      // Registration creates the profile server-side. Do not let the browser create
      // or modify entitlement fields when the profile is missing.
      unlockedSubjects = ['english', 'mathematics'];
      isAllUnlocked = false;
    }
  } catch (err) {
    console.warn("Could not retrieve user unlocks from Firestore:", err);
  }

  updateSubjectDropdownUI();
}

function updateSubjectDropdownUI() {
  const select = document.getElementById('subject');
  if (!select) return;
  // Keep subject names clean. Access status is shown only when a locked
  // subject is selected, not as symbols inside the dropdown.
  Array.from(select.options).forEach(option => {
    option.text = option.text
      .replace(/^[✓🔒]\s*/, '')
      .split('(')[0]
      .trim();
  });

  const unlockAllBtn = document.getElementById('unlock-all-btn');
  if (unlockAllBtn) {
    unlockAllBtn.style.display = (isAllUnlocked || ALL_SUBJECTS.every(s => unlockedSubjects.includes(s))) ? 'none' : '';
  }
}

function openUnlockModal(subject) {
  pendingUnlockSubject = subject;
  const modal = document.getElementById('unlock-modal');
  const title = document.getElementById('unlock-modal-title');
  const message = document.getElementById('unlock-modal-message');
  const subjectBtn = document.getElementById('unlock-subject-btn');
  const displayName = subject === 'all' ? 'all subjects' : subject.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  if (title) title.textContent = subject === 'all' ? 'Unlock All Subjects' : `Unlock ${displayName}`;
  if (message) message.textContent = subject === 'all'
    ? 'Unlock every premium subject and get full access to the practice bank.'
    : `${displayName} is currently locked. Choose a single-subject unlock or unlock all subjects.`;
  if (subjectBtn) subjectBtn.querySelector('strong').textContent = `Unlock ${displayName}`;
  if (modal) {
    modal.classList.remove('hidden');
    document.body.classList.add('modal-open');
  }
}

function closeUnlockModal() {
  const modal = document.getElementById('unlock-modal');
  if (modal) modal.classList.add('hidden');
  document.body.classList.remove('modal-open');
  pendingUnlockSubject = null;
}

function handleSubjectSelection(event) {
  const selectedSubject = event.target.value;
  if (isAllUnlocked || unlockedSubjects.includes(selectedSubject)) {
    lastAllowedSubject = selectedSubject;
    return;
  }
  event.target.value = lastAllowedSubject;
  openUnlockModal(selectedSubject);
}

function handleStartExamClick() {
  const selectedSubject = document.getElementById('subject').value;

  if (isAllUnlocked || unlockedSubjects.includes(selectedSubject)) {
    fetchExamQuestions();
  } else {
    openUnlockModal(selectedSubject);
  }
}

const FRIENDLY_AUTH_ERRORS = {
  'auth/invalid-credential': 'Incorrect email or password.',
  'auth/invalid-login-credentials': 'Incorrect email or password.',
  'auth/user-not-found': 'No account was found with that email address.',
  'auth/wrong-password': 'Incorrect email or password.',
  'auth/invalid-email': 'Enter a valid email address.',
  'auth/too-many-requests': 'Too many attempts. Please wait a moment and try again.',
  'auth/network-request-failed': 'Network connection failed. Check your internet connection.',
  'auth/user-disabled': 'This account has been disabled.',
  'auth/email-already-in-use': 'An account already exists with this email address.',
  'auth/weak-password': 'Choose a stronger password with at least 6 characters.'
};

let noticeTimer = null;

function getFriendlyError(error, fallback = 'Something went wrong. Please try again.') {
  const code = error?.code || '';
  if (FRIENDLY_AUTH_ERRORS[code]) return FRIENDLY_AUTH_ERRORS[code];
  const message = String(error?.message || '').replace(/^Firebase:\s*/i, '').trim();
  // Never expose raw Firebase/provider errors in the interface.
  if (!message || /firebase|auth\//i.test(message)) return fallback;
  return message;
}

function showNotice(message, type = 'info') {
  const notice = document.getElementById('app-notice');
  if (!notice) return;
  clearTimeout(noticeTimer);
  notice.className = `app-notice ${type}`;
  notice.innerHTML = `<span class="notice-icon" aria-hidden="true">${type === 'success' ? '✓' : type === 'error' ? '!' : 'i'}</span><span>${escapeHtml(String(message))}</span>`;
  requestAnimationFrame(() => notice.classList.add('show'));
  noticeTimer = setTimeout(() => notice.classList.remove('show'), 5000);
}

function showPaymentNotice(message, type = 'info') {
  showNotice(message, type);
}

function escapeHtml(value) {
  const div = document.createElement('div');
  div.textContent = value;
  return div.innerHTML;
}

async function triggerPaystackPayment(subjectOrType) {
  if (!currentUser || !auth.currentUser) {
    showPaymentNotice('Your session has expired. Please log in again.', 'error');
    return;
  }

  const subjectButton = document.getElementById('unlock-subject-btn');
  const allButton = document.getElementById('unlock-all-modal-btn');
  if (subjectButton) subjectButton.disabled = true;
  if (allButton) allButton.disabled = true;
  showPaymentNotice('Opening Paystack checkout…', 'info');

  try {
    const idToken = await auth.currentUser.getIdToken(true);
    let initRes = await fetch('/api/initialize-payment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({ unlockType: subjectOrType })
    });
    if (initRes.status === 404) {
      initRes = await fetch('/.netlify/functions/initialize-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ unlockType: subjectOrType })
      });
    }
    const init = await initRes.json();
    if (!initRes.ok || !init.success || !init.authorizationUrl || !init.reference) {
      throw new Error(init.error || 'Payment could not be started. Please try again.');
    }

    // Store only the non-sensitive transaction context. The server remains the
    // authority: access is granted only after verify-payment confirms Paystack.
    sessionStorage.setItem('waec_pending_payment', JSON.stringify({
      reference: init.reference,
      unlockType: subjectOrType,
      userId: currentUser.uid
    }));

    // Redirecting to Paystack avoids mobile-browser popup blocking that can
    // happen when an iframe/popup is opened after an asynchronous API call.
    window.location.assign(init.authorizationUrl);
  } catch (err) {
    console.error('Payment initialization error:', err);
    showPaymentNotice(err.message || 'Payment could not be started. Please try again.', 'error');
    if (subjectButton) subjectButton.disabled = false;
    if (allButton) allButton.disabled = false;
  }
}

async function handlePaymentReturn() {
  const params = new URLSearchParams(window.location.search);
  const reference = params.get('reference') || params.get('trxref');
  const raw = sessionStorage.getItem('waec_pending_payment');
  if (!reference || !raw || !currentUser || !auth.currentUser) return;

  let pending;
  try { pending = JSON.parse(raw); } catch (_) { pending = null; }
  if (!pending || pending.reference !== reference || pending.userId !== currentUser.uid) return;

  // Remove the reference from the address bar without reloading the app.
  window.history.replaceState({}, document.title, window.location.pathname);
  showPaymentNotice('Payment received. Verifying with Paystack…', 'info');

  try {
    const token = await auth.currentUser.getIdToken(true);
    let res = await fetch('/api/verify-payment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ reference, userId: currentUser.uid, unlockType: pending.unlockType })
    });
    if (res.status === 404) {
      res = await fetch('/.netlify/functions/verify-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ reference, userId: currentUser.uid, unlockType: pending.unlockType })
      });
    }
    const result = await res.json();

    if (res.ok && result.success) {
      unlockedSubjects = Array.isArray(result.unlockedSubjects) ? result.unlockedSubjects : unlockedSubjects;
      isAllUnlocked = Boolean(result.isAllUnlocked);
      updateSubjectDropdownUI();
      sessionStorage.removeItem('waec_pending_payment');
      const label = pending.unlockType === 'all'
        ? 'All subjects have been unlocked successfully.'
        : `${pending.unlockType.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())} has been unlocked successfully.`;
      showPaymentNotice(label, 'success');
    } else if (res.status === 202) {
      showPaymentNotice('Paystack is still confirming this payment. Please refresh shortly.', 'info');
    } else {
      sessionStorage.removeItem('waec_pending_payment');
      showPaymentNotice(result.error || 'Payment could not be verified.', 'error');
    }
  } catch (err) {
    console.error('Payment return verification error:', err);
    showPaymentNotice('Payment was completed, but verification could not be reached. Please refresh and try again.', 'error');
  }
}

function showSetupScreen() {
  document.getElementById('auth-screen').classList.add('hidden');
  document.getElementById('setup-screen').classList.remove('hidden');
  document.getElementById('user-badge').classList.remove('hidden');
  document.getElementById('candidate-name').innerText = currentUser.name;
  
  ensureChannelBanner('setup-screen');
}

function showAuthScreen() {
  document.getElementById('setup-screen').classList.add('hidden');
  document.getElementById('exam-area').classList.add('hidden');
  document.getElementById('score-screen').classList.add('hidden');
  document.getElementById('user-badge').classList.add('hidden');
  document.getElementById('auth-screen').classList.remove('hidden');
  switchAuthTab('login');
}

// Production question bank: questions are served from Firestore through Netlify.
async function fetchExamQuestions() {
  const subject = document.getElementById('subject').value;
  const examType = document.getElementById('examtype').value;
  const limit = document.getElementById('question-limit').value;
  const startBtn = document.getElementById('start-btn');

  startBtn.innerText = "Loading Question Bank...";
  startBtn.disabled = true;

  try {
    const url = `/.netlify/functions/get-questions?subject=${encodeURIComponent(subject)}&type=${encodeURIComponent(examType)}&limit=${encodeURIComponent(limit)}`;
    const response = await fetch(url, { headers: { 'Accept': 'application/json' }, cache: 'no-store' });
    const result = await response.json();

    if (!response.ok || !result.success || !Array.isArray(result.data) || !result.data.length) {
      throw new Error(result.error || 'No questions are available for this subject yet.');
    }

    questions = result.data.map(q => ({
      id: q.id,
      section: q.passage || q.section || '',
      question: q.question,
      options: q.options,
      correctAnswer: Number(q.correctAnswer),
      solution: q.explanation || q.solution || 'Explanation not available.'
    }));

    document.getElementById('setup-screen').classList.add('hidden');
    document.getElementById('exam-area').classList.remove('hidden');
    document.getElementById('timer').classList.remove('hidden');
    currentQuestionIndex = 0;
    userAnswers = {};
    displayQuestion();
    startTimer();
  } catch (error) {
    console.error('Question bank error:', error);
    showNotice(getFriendlyError(error, 'Practice could not be started.'), 'error');
  } finally {
    startBtn.innerText = "Start Practice Test";
    startBtn.disabled = false;
  }
}

async function loadPracticeGuide() {
  const subject = document.getElementById('subject').value;
  const panel = document.getElementById('practice-guide');
  const title = document.getElementById('guide-title');
  const intro = document.getElementById('guide-intro');
  const topics = document.getElementById('guide-topics');
  panel.classList.remove('hidden');
  title.textContent = `${subject.replaceAll('-', ' ')} Practice Guide`;
  intro.textContent = 'Loading your study guide...';
  topics.innerHTML = '';

  try {
    const res = await fetch(`/.netlify/functions/get-practice-guide?subject=${encodeURIComponent(subject)}`, { cache: 'no-store' });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.error || 'Guide unavailable.');
    intro.textContent = data.guide.introduction || '';
    const items = Array.isArray(data.guide.topics) ? data.guide.topics : [];
    topics.innerHTML = items.map((topic, index) => `
      <article class="guide-topic">
        <div class="guide-topic-number">${index + 1}</div>
        <div><h4>${topic.title || 'Study Topic'}</h4><p>${topic.content || ''}</p></div>
      </article>`).join('');
  } catch (error) {
    console.error('Practice guide error:', error);
    intro.textContent = 'Unable to load the guide right now. Please try again.';
  }
}

function displayQuestion() {
  const q = questions[currentQuestionIndex];

  const passageBox = document.getElementById('passage-container');
  if (q.section && q.section.trim() !== "") {
    passageBox.innerHTML = `<strong>Passage / Instructions:</strong><br>${q.section}`;
    passageBox.classList.remove('hidden');
  } else {
    passageBox.classList.add('hidden');
  }

  document.getElementById('question-number').innerText = `Question ${currentQuestionIndex + 1} of ${questions.length}`;
  document.getElementById('question-text').innerHTML = q.question;

  const optionsContainer = document.getElementById('options-container');
  optionsContainer.innerHTML = '';

  q.options.forEach((optText, index) => {
    const btn = document.createElement('button');
    btn.className = 'option-btn';
    btn.innerHTML = optText;

    if (userAnswers[currentQuestionIndex] === index) {
      btn.classList.add('selected');
    }

    btn.addEventListener('click', () => selectOption(index));
    optionsContainer.appendChild(btn);
  });

  document.getElementById('prev-btn').disabled = currentQuestionIndex === 0;
  
  if (currentQuestionIndex === questions.length - 1) {
    document.getElementById('next-btn').classList.add('hidden');
    document.getElementById('submit-btn').classList.remove('hidden');
  } else {
    document.getElementById('next-btn').classList.remove('hidden');
    document.getElementById('submit-btn').classList.add('hidden');
  }
}

function selectOption(index) {
  userAnswers[currentQuestionIndex] = index;
  displayQuestion();
}

function navigateQuestion(direction) {
  currentQuestionIndex += direction;
  displayQuestion();
}

function startTimer() {
  const selectedMinutes = parseInt(document.getElementById('exam-duration').value) || 20;
  timeLeft = selectedMinutes * 60;
  
  updateTimerDisplay();
  if (timerInterval) clearInterval(timerInterval);

  timerInterval = setInterval(() => {
    timeLeft--;
    updateTimerDisplay();

    if (timeLeft <= 0) {
      clearInterval(timerInterval);
      showNotice('Time is up. Your test is being submitted.', 'info');
      submitExam();
    }
  }, 1000);
}

function updateTimerDisplay() {
  const mins = Math.floor(timeLeft / 60);
  const secs = timeLeft % 60;
  document.getElementById('timer-time').innerText = `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

async function submitExam() {
  if (timerInterval) clearInterval(timerInterval);

  let score = 0;
  questions.forEach((q, idx) => {
    if (userAnswers[idx] === q.correctAnswer) {
      score++;
    }
  });

  const percentage = Math.round((score / questions.length) * 100);

  document.getElementById('exam-area').classList.add('hidden');
  document.getElementById('timer').classList.add('hidden');
  document.getElementById('score-screen').classList.remove('hidden');

  ensureChannelBanner('score-screen');

  document.getElementById('final-score-text').innerText = 
    `You scored ${score} out of ${questions.length} (${percentage}%)`;

  renderReviewList();

  try {
    const resultDocId = `${currentUser.uid}_${Date.now()}`;
    await setDoc(doc(db, "exam_results", resultDocId), {
      candidateUid: currentUser.uid,
      candidateEmail: currentUser.email,
      score: score,
      totalQuestions: questions.length,
      percentage: percentage,
      subject: document.getElementById('subject').value,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.warn("Firestore Sync Error:", err);
  }
}

function renderReviewList() {
  const reviewContainer = document.getElementById('review-container');
  reviewContainer.innerHTML = '<h4>Detailed Question Review</h4>';

  questions.forEach((q, idx) => {
    const userAns = userAnswers[idx];
    const isCorrect = userAns === q.correctAnswer;

    const item = document.createElement('div');
    item.className = `review-item ${isCorrect ? 'correct' : 'incorrect'}`;

    item.innerHTML = `
      <div class="review-status">${isCorrect ? '✓ Correct' : '✗ Incorrect / Unanswered'}</div>
      ${q.section ? `<div class="review-explanation"><strong>Passage:</strong> ${q.section}</div>` : ''}
      <div class="review-question"><strong>Q${idx + 1}:</strong> ${q.question}</div>
      <div class="review-answer user">Your Answer: ${userAns !== undefined ? q.options[userAns] : '<em>None</em>'}</div>
      <div class="review-answer correct-ans">Correct Answer: ${q.options[q.correctAnswer]}</div>
      <div class="review-explanation"><strong>Explanation:</strong> ${q.solution}</div>
    `;

    reviewContainer.appendChild(item);
  });
}

function resetExam() {
  currentQuestionIndex = 0;
  userAnswers = {};
  document.getElementById('score-screen').classList.add('hidden');
  document.getElementById('setup-screen').classList.remove('hidden');
}
