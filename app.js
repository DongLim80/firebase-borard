// ===== 1) Firebase 초기화 (본인 값으로 교체) =====
const firebaseConfig = {
  apiKey: "AIzaSyCkzhNacaNeZncYJ2f3dm7JnQllrP_N8hY",
  authDomain: "my-board-1980.firebaseapp.com",
  projectId: "my-board-1980",
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// ===== 2) 전역 상태 =====
let currentUser = null;     // firebase.User 또는 null
let currentRole = null;     // 'admin' | 'user' | null
let editingDocId = null;    // 수정 중인 글 문서ID

// ===== 3) 공통 유틸 =====
function fmtDate(ts) {
  if (!ts) return '';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const day = String(d.getDate()).padStart(2,'0');
  const hh = String(d.getHours()).padStart(2,'0');
  const mm = String(d.getMinutes()).padStart(2,'0');
  return `${y}-${m}-${day} ${hh}:${mm}`;
}

async function getMyRole(uid) {
  if (!uid) return null;
  const snap = await db.collection('roles').doc(uid).get();
  return snap.exists ? (snap.data().role || 'user') : 'user';
}

// ===== 4) 인증 상태 감시 =====
auth.onAuthStateChanged(async (user) => {
  currentUser = user || null;
  currentRole = user ? await getMyRole(user.uid) : null;
  updateAuthUI();
  if (window.whenAuthReady) {
    window.whenAuthReady({ user: currentUser, role: currentRole });
  }
});

function updateAuthUI() {
  const loginBtn = document.getElementById('loginBtn');
  const logoutBtn = document.getElementById('logoutBtn');
  const composer = document.getElementById('composer');
  const adminLink = document.getElementById('adminLink');

  if (loginBtn) loginBtn.classList.toggle('hide', !!currentUser);
  if (logoutBtn) logoutBtn.classList.toggle('hide', !currentUser);
  if (composer) composer.classList.toggle('hide', !currentUser);
  if (adminLink) adminLink.classList.toggle('hide', currentRole !== 'admin');
}

// ===== 5) 로그인/로그아웃 =====
async function login() {
  const provider = new firebase.auth.GoogleAuthProvider();
  await auth.signInWithPopup(provider);
}
function logout() { auth.signOut(); }

window.login = login;
window.logout = logout;

// ===== 6) 글 목록/생성/수정/삭제 =====
const postListEl = document.getElementById('postList');
const tpl = document.getElementById('postCardTpl');
const titleInput = document.getElementById('titleInput');
const bodyInput = document.getElementById('bodyInput');
const postBtn = document.getElementById('postBtn');
const cancelEditBtn = document.getElementById('cancelEditBtn');
const loginBtn = document.getElementById('loginBtn');
const logoutBtn = document.getElementById('logoutBtn');

if (loginBtn) loginBtn.addEventListener('click', login);
if (logoutBtn) logoutBtn.addEventListener('click', logout);
if (postBtn) postBtn.addEventListener('click', onSubmitPost);
if (cancelEditBtn) cancelEditBtn.addEventListener('click', resetComposer);

function resetComposer() {
  editingDocId = null;
  if (postBtn) postBtn.textContent = '등록';
  if (cancelEditBtn) cancelEditBtn.classList.add('hide');
  if (titleInput) titleInput.value = '';
  if (bodyInput) bodyInput.value = '';
}

async function onSubmitPost() {
  if (!currentUser) return alert('로그인 후 작성하세요.');
  const title = (titleInput?.value || '').trim();
  const body = (bodyInput?.value || '').trim();
  if (!title || !body) return alert('제목과 본문을 입력하세요.');

  if (!editingDocId) {
    // create
    await db.collection('posts').add({
      title,
      body,
      authorUid: currentUser.uid,
      authorName: currentUser.displayName || currentUser.email,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
  } else {
    // update
    const ref = db.collection('posts').doc(editingDocId);
    await ref.update({
      title, body,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
  }
  resetComposer();
}

function canManage(post) {
  if (!currentUser) return false;
  return (post.authorUid === currentUser.uid) || (currentRole === 'admin');
}

function renderPostCard(doc) {
  const data = doc.data();
  const node = tpl.content.cloneNode(true);
  const el = node.querySelector('.card');
  const titleEl = node.querySelector('.title');
  const metaEl = node.querySelector('.meta');
  const bodyEl = node.querySelector('.body');
  const actions = node.querySelector('.card-actions');
  const editBtn = node.querySelector('.editBtn');
  const deleteBtn = node.querySelector('.deleteBtn');

  titleEl.textContent = data.title || '(제목 없음)';
  metaEl.textContent = `${data.authorName || '익명'} · ${fmtDate(data.createdAt)}${data.updatedAt ? ' (수정: '+fmtDate(data.updatedAt)+')' : ''}`;
  if (window.marked) {
    bodyEl.innerHTML = marked.parse(data.body || '');
  } else {
    bodyEl.textContent = data.body || '';
  }

  if (canManage(data)) {
    actions.classList.remove('hide');
    editBtn.addEventListener('click', () => {
      editingDocId = doc.id;
      titleInput.value = data.title || '';
      bodyInput.value = data.body || '';
      postBtn.textContent = '수정 저장';
      cancelEditBtn.classList.remove('hide');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
    deleteBtn.addEventListener('click', async () => {
      if (confirm('정말 삭제하시겠습니까?')) {
        await db.collection('posts').doc(doc.id).delete();
      }
    });
  }

  postListEl.appendChild(node);
}

// 실시간 목록 구독
if (postListEl) {
  db.collection('posts')
    .orderBy('createdAt', 'desc')
    .limit(50)
    .onSnapshot((snap) => {
      postListEl.innerHTML = '';
      snap.forEach((doc) => renderPostCard(doc));
    });
}

// ===== 7) 관리자 전용 도우미 =====
// admin.html에서 사용. (Rules에서 admin만 roles 컬렉션 접근 가능)
async function setUserRole(uid, role) {
  if (!currentUser) throw new Error('로그인이 필요합니다');
  // 단순 client write. 보안은 Firestore Rules가 처리
  const ref = db.collection('roles').doc(uid);
  await ref.set({ role }, { merge: true });
}

window.setUserRole = setUserRole;

// 외부에서 인증 준비 후 호출할 수 있게 훅 제공
window.whenAuthReady = (fn) => fn({ user: currentUser, role: currentRole });
