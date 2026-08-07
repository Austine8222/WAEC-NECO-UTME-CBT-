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
  getDoc, 
  updateDoc, 
  arrayUnion 
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

// Paystack Key Configuration
const PAYSTACK_PUBLIC_KEY = 'pk_test_ad1aa411e2e8cade2cbf911f346a07bbe0f018ea';

// 2. ALOC API Config
const API_TOKEN = '__INJECT_ALOC_TOKEN__';

// 3. Application State Variables
let questions = [];
let currentQuestionIndex = 0;
let userAnswers = {};
let timerInterval = null;
let timeLeft = 0;
let currentUser = null;
let unlockedSubjects = ['english', 'mathematics'];
let isAllUnlocked = false;

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
      showSetupScreen();
    } else {
      currentUser = null;
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
  document.getElementById('unlock-all-btn').addEventListener('click', () => triggerPaystackPayment('all'));
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
    alert(`Verification code sent to ${email}. Please check your inbox.`);
  } catch (error) {
    alert("Registration Failed: " + error.message);
  } finally {
    regBtn.innerText = "Send Verification Code";
    regBtn.disabled = false;
  }
}

async function handleVerifyRegistrationOtp() {
  const enteredOtp = document.getElementById('verify-code-input').value.trim();
  const verifyBtn = document.getElementById('confirm-verify-btn');

  if (!enteredOtp || enteredOtp.length !== 6) {
    alert("Please enter a valid 6-digit verification code.");
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

    alert("Account verified and created successfully! You can now log in.");
    document.getElementById('register-form').reset();
    document.getElementById('verify-code-input').value = "";
    pendingRegData = null;
    switchAuthTab('login');
  } catch (error) {
    alert("Verification Error: " + error.message);
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
        alert("Access Denied: Your account email is not verified.");
        loginBtn.innerText = "Sign In & Proceed";
        loginBtn.disabled = false;
        return;
      }
    }

    document.getElementById('login-form').reset();
  } catch (error) {
    alert("Login Failed: " + error.message);
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
    alert(`A password reset code has been sent to ${email}.`);
  } catch (error) {
    alert("Password Reset Request Failed: " + error.message);
  } finally {
    resetBtn.innerText = "Send Reset Code";
    resetBtn.disabled = false;
  }
}

async function handleVerifyResetOtp() {
  const enteredOtp = document.getElementById('reset-verify-code-input').value.trim();
  const verifyBtn = document.getElementById('confirm-reset-verify-btn');

  if (!enteredOtp || enteredOtp.length !== 6) {
    alert("Please enter a valid 6-digit code.");
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

    alert("Code verified successfully! Please enter your new password.");
    document.getElementById('reset-verify-box').classList.add('hidden');
    document.getElementById('new-password-box').classList.remove('hidden');
  } catch (error) {
    alert("Verification Failed: " + error.message);
  } finally {
    verifyBtn.innerText = "Verify Code";
    verifyBtn.disabled = false;
  }
}

async function handleSubmitNewPassword() {
  const newPassword = document.getElementById('new-password-input').value;
  const updateBtn = document.getElementById('update-password-btn');

  if (!newPassword || newPassword.length < 6) {
    alert("Password must be at least 6 characters long.");
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

    alert("Password updated successfully! You can now log in with your new password.");
    document.getElementById('reset-form').reset();
    document.getElementById('new-password-input').value = "";
    verifiedResetEmail = "";
    switchAuthTab('login');
  } catch (error) {
    alert("Update Failed: " + error.message);
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
      await setDoc(userDocRef, {
        name: currentUser.name,
        email: currentUser.email,
        unlockedSubjects: ['english', 'mathematics'],
        isAllUnlocked: false,
        createdAt: new Date().toISOString()
      });
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
  const options = select.options;

  for (let i = 0; i < options.length; i++) {
    const val = options[i].value;
    const baseName = options[i].text.split('(')[0].trim();

    if (val === 'english' || val === 'mathematics') {
      options[i].text = `${baseName} (Free)`;
    } else if (isAllUnlocked || unlockedSubjects.includes(val)) {
      options[i].text = `${baseName} (Unlocked ✅)`;
    } else {
      options[i].text = `${baseName} (🔒 ₦500)`;
    }
  }

  const unlockAllBtn = document.getElementById('unlock-all-btn');
  if (isAllUnlocked || ALL_SUBJECTS.every(s => unlockedSubjects.includes(s))) {
    if (unlockAllBtn) unlockAllBtn.style.display = 'none';
  }
}

function handleStartExamClick() {
  const selectedSubject = document.getElementById('subject').value;

  if (isAllUnlocked || unlockedSubjects.includes(selectedSubject)) {
    fetchExamQuestions();
  } else {
    const confirmPay = confirm(`"${selectedSubject.toUpperCase()}" is locked.\n\nWould you like to unlock this subject for ₦500?`);
    if (confirmPay) {
      triggerPaystackPayment(selectedSubject);
    }
  }
}

function triggerPaystackPayment(subjectOrType) {
  if (!currentUser || !currentUser.email) {
    alert("User session not found. Please log in again.");
    return;
  }

  if (typeof PaystackPop === 'undefined') {
    alert("Paystack payment SDK failed to load. Please check your internet connection.");
    return;
  }

  const isUnlockAll = subjectOrType === 'all';
  const amountKobo = isUnlockAll ? 200000 : 50000;

  const handler = PaystackPop.setup({
    key: PAYSTACK_PUBLIC_KEY,
    email: currentUser.email,
    amount: amountKobo,
    currency: 'NGN',
    metadata: {
      custom_fields: [
        { display_name: "User ID", variable_name: "user_id", value: currentUser.uid },
        { display_name: "Unlock Type", variable_name: "unlock_type", value: isUnlockAll ? "ALL_SUBJECTS" : subjectOrType }
      ]
    },
    callback: async function(response) {
      alert(`Payment Successful! Verifying transaction with server...`);
      
      try {
        const res = await fetch('/.netlify/functions/verify-payment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            reference: response.reference,
            userId: currentUser.uid,
            unlockType: subjectOrType
          })
        });

        const result = await res.json();
        if (res.ok && result.success) {
          await recordUnlockInFirestore(subjectOrType);
        } else {
          throw new Error(result.error || "Verification failed");
        }
      } catch (err) {
        console.error("Verification error:", err);
        alert("Payment was made, but server verification failed. Please contact support with reference: " + response.reference);
      }
    },
    onClose: function() {
      alert('Transaction was not completed.');
    }
  });

  handler.openIframe();
}

async function recordUnlockInFirestore(subjectOrType) {
  const userDocRef = doc(db, "users", currentUser.uid);

  try {
    if (subjectOrType === 'all') {
      await updateDoc(userDocRef, {
        isAllUnlocked: true,
        unlockedSubjects: ALL_SUBJECTS
      });
      isAllUnlocked = true;
      unlockedSubjects = ALL_SUBJECTS;
      alert("🎉 Congratulations! You have unlocked ALL subjects!");
    } else {
      await updateDoc(userDocRef, {
        unlockedSubjects: arrayUnion(subjectOrType)
      });
      if (!unlockedSubjects.includes(subjectOrType)) {
        unlockedSubjects.push(subjectOrType);
      }
      alert(`🎉 Subject successfully unlocked! You can now practice ${subjectOrType.toUpperCase()}.`);
    }

    updateSubjectDropdownUI();
  } catch (err) {
    console.error("Error saving payment unlock:", err);
    alert("Payment verified successfully, but we encountered an issue syncing your account display. Please refresh.");
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

async function fetchExamQuestions() {
  const subject = document.getElementById('subject').value;
  const examType = document.getElementById('examtype').value;
  const limit = document.getElementById('question-limit').value;
  const startBtn = document.getElementById('start-btn');
  
  startBtn.innerText = "Fetching Questions...";
  startBtn.disabled = true;

  const url = `https://questions.aloc.com.ng/api/v2/m?subject=${subject}&type=${examType}&limit=${limit}`;

  try {
    const response = await fetch(url, {
      headers: {
        'AccessToken': API_TOKEN,
        'Accept': 'application/json'
      }
    });

    const result = await response.json();

    if (result.status === 200 && result.data && result.data.length > 0) {
      const parsedData = result.data.filter(q => q.question && q.option && q.option.a && q.option.b);

      questions = parsedData.map(q => ({
        id: q.id,
        section: q.section || q.passage || "",
        question: q.question,
        options: [
          `A. ${q.option.a || ''}`,
          `B. ${q.option.b || ''}`,
          `C. ${q.option.c || ''}`,
          `D. ${q.option.d || ''}`
        ],
        correctAnswer: ['a', 'b', 'c', 'd'].indexOf(q.answer ? q.answer.toLowerCase() : 'a'),
        solution: q.solution || "No detailed explanation available for this question."
      }));
    } else {
      throw new Error("Empty API Response");
    }
  } catch (error) {
    console.warn("API Call Failed. Switching to local fallback questions:", error);
    questions = localBackupQuestions;
  }

  startBtn.innerText = "Start Practice Test";
  startBtn.disabled = false;

  document.getElementById('setup-screen').classList.add('hidden');
  document.getElementById('exam-area').classList.remove('hidden');
  document.getElementById('timer').classList.remove('hidden');
  
  currentQuestionIndex = 0;
  userAnswers = {};
  displayQuestion();
  startTimer();
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
      alert("Time is up! Submitting exam automatically.");
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
