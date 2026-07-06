import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore, collection, addDoc, doc, updateDoc, deleteDoc, onSnapshot, query, orderBy, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword, GoogleAuthProvider, signInWithPopup, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-analytics.js";

const firebaseConfig = {
  apiKey: "AIzaSyASYcouPGDMx5_V9ZUZ3RcFifCxcbpcst8",
  authDomain: "spidy-book-dbe32.firebaseapp.com",
  projectId: "spidy-book-dbe32",
  storageBucket: "spidy-book-dbe32.firebasestorage.app",
  messagingSenderId: "681583149252",
  appId: "1:681583149252:web:f679d1847cd749d0a7c991",
  measurementId: "G-DKH77K3KEH"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();

const analytics = getAnalytics(app); 

let booksData = [];
let loadedCount = 0; 
let isLoadingMore = false;
let activeBookSlug = ""; 
let activeBookTitle = "";

let IS_SUPER_ADMIN = false;
let isUserLoggedIn = false; 

let adminFilteredBooks = [];
let adminCurrentPage = 1;
const adminBooksPerPage = 10;

const urlParamsCheck = new URLSearchParams(window.location.search);
let isDeepLinkLoad = urlParamsCheck.has('book'); 
let pendingBookSlug = urlParamsCheck.get('book');

if (isDeepLinkLoad) {
    document.getElementById('mainAppWrapper').style.display = 'none';
    document.getElementById('downloadModal').style.display = 'none';
}


let loadingProgress = 0;
let loaderInterval;

function updateLoaderUI(percent) {
    const loaderFill = document.getElementById('loaderFill');
    const loaderPercentage = document.getElementById('loaderPercentage');
    const loaderStatusText = document.getElementById('loaderStatusText');
    
    if (loaderFill) loaderFill.style.width = percent + "%";
    if (loaderPercentage) loaderPercentage.innerText = percent + "%";
    
    if (loaderStatusText) {
        if (percent < 30) loaderStatusText.innerText = "Initializing System...";
        else if (percent < 60) loaderStatusText.innerText = "Fetching Secure Data...";
        else if (percent < 99) loaderStatusText.innerText = "Preparing Content...";
        else loaderStatusText.innerText = "Ready to Launch!";
    }
}

loaderInterval = setInterval(() => {
    if (loadingProgress < 90) {
        loadingProgress += Math.floor(Math.random() * 8) + 2; 
        if (loadingProgress > 90) loadingProgress = 90;
        updateLoaderUI(loadingProgress);
    }
}, 150);
/* ========================================= */

const quotes = [
    { text: "Be the change that you wish to see in the world.", author: "Mahatma Gandhi" },
    { text: "I have not failed. I've just found 10,000 ways that won't work.", author: "Thomas A. Edison" },
    { text: "The only way to do great work is to love what you do.", author: "Steve Jobs" },
    { text: "In the middle of difficulty lies opportunity.", author: "Albert Einstein" },
    { text: "It does not matter how slowly you go as long as you do not stop.", author: "Confucius" },
    { text: "Whatever you are, be a good one.", author: "Abraham Lincoln" }
];
const todayDays = Math.floor(Date.now() / (1000 * 60 * 60 * 24));
const currentQuoteIndex = todayDays % quotes.length;
document.getElementById('daily-quote-text').innerHTML = `<i class="fas fa-quote-left" style="color: rgba(255,255,255,0.3); margin-right:5px;"></i> ${quotes[currentQuoteIndex].text}`;
document.getElementById('daily-quote-author').innerText = `— ${quotes[currentQuoteIndex].author}`;

let isAppReady = { auth: false, data: false, time: false };
let hasTransitioned = false;
let popupShown = false;

setTimeout(() => {
    isAppReady.time = true;
    tryTransition();
}, 2000);

function triggerWhatsAppPopup() {
    if(!popupShown && !isDeepLinkLoad) {
        popupShown = true;
        document.getElementById("popupOverlay").style.display = "flex";
    }
}

function tryTransition() {
    if (isAppReady.auth && isAppReady.data && isAppReady.time && !hasTransitioned) {
        hasTransitioned = true;
        
        clearInterval(loaderInterval);
        updateLoaderUI(100);

        setTimeout(() => {
            document.getElementById('mainAppWrapper').style.display = 'block';

            if (isDeepLinkLoad && pendingBookSlug) {
                if (isUserLoggedIn) {
                    window.openDownloadPage(pendingBookSlug, true);
                } else {
                    const loginOverlay = document.getElementById('loginOverlay');
                    loginOverlay.style.display = 'flex';
                    setTimeout(() => loginOverlay.style.opacity = '1', 10);
                }
            } else {
                setTimeout(triggerWhatsAppPopup, 15000); 
            }

            const loader = document.getElementById("loaderScreen");
            loader.style.opacity = "0"; 

            setTimeout(() => {
                loader.style.display = "none";
            }, 300);
        }, 500); 
    }
}

window.closeLoginOverlay = function() {
    const loginOverlay = document.getElementById('loginOverlay');
    loginOverlay.style.opacity = '0';
    setTimeout(() => { 
        loginOverlay.style.display = 'none'; 
        
        if (isDeepLinkLoad && !isUserLoggedIn) {
            isDeepLinkLoad = false;
            window.history.replaceState({}, '', window.location.pathname);
            setTimeout(triggerWhatsAppPopup, 15000);
        }
    }, 500);
};

// ==========================================
// SECURE ADMIN & AUTO USER CREATION LOGIC
// ==========================================
onAuthStateChanged(auth, async (user) => {
    if (user) {
        isUserLoggedIn = true;
        localStorage.setItem('isUserLoggedIn', 'true');

        let dName = user.displayName;
        if (!dName || dName.trim() === "") { dName = user.email.split('@')[0]; }
        document.getElementById('sidebarProfileName').innerText = dName;

        try {
            // NAYI LOGIC: User ka data Firebase me auto-save karna
            const userRef = doc(db, "users", user.uid);
            const userSnap = await getDoc(userRef);

            if (!userSnap.exists()) {
                await setDoc(userRef, {
                    email: user.email,
                    name: dName,
                    photo: user.photoURL || "",
                    createdAt: new Date().getTime()
                });
            }

            // Firebase Firestore se check kar rahe hain ki kya user email admins collection me hai
            const adminDocRef = doc(db, "admins", user.email);
            const adminDocSnap = await getDoc(adminDocRef);

            if (adminDocSnap.exists()) {
                IS_SUPER_ADMIN = true;
                document.getElementById('sidebarRoleText').innerText = "Super Admin";
                document.getElementById('uploadMenuText').innerText = "Manage Vault";
                document.getElementById('admTabManage').style.display = 'inline-flex';
                document.getElementById('addYtLinkContainer').style.display = 'flex'; 
                document.getElementById('editYtLinkContainer').style.display = 'flex'; 
            } else {
                IS_SUPER_ADMIN = false;
                document.getElementById('sidebarRoleText').innerText = "Verified User";
                document.getElementById('uploadMenuText').innerText = "Upload Books";
                document.getElementById('admTabManage').style.display = 'none';
                document.getElementById('addYtLinkContainer').style.display = 'none'; 
                document.getElementById('editYtLinkContainer').style.display = 'none'; 
                switchAdminTab('add');
            }
        } catch (error) {
            console.error("Verification failed:", error);
            IS_SUPER_ADMIN = false;
        }
    } else {
        isUserLoggedIn = false;
        IS_SUPER_ADMIN = false;
        localStorage.removeItem('isUserLoggedIn');
        
        document.getElementById('sidebarProfileName').innerText = "Guest User";
        document.getElementById('sidebarRoleText').innerText = "Please Login";
        document.getElementById('uploadMenuText').innerText = "Upload Books";
    }

    isAppReady.auth = true;
    tryTransition();

    onSnapshot(query(collection(db, "prompts"), orderBy("createdAt", "asc")), (snapshot) => {
        const container = document.getElementById('promptsContainer');
        container.innerHTML = '';
        if(snapshot.empty) {
            container.innerHTML = `<div style="text-align:center; padding:20px; color:#a1a1aa; font-weight:800;">No prompts available yet.</div>`;
            return;
        }

        snapshot.forEach(doc => {
            const data = doc.data();
            const id = doc.id;
            const safeText = data.text.replace(/</g, "&lt;").replace(/>/g, "&gt;");
            const safeInstruction = data.instruction ? data.instruction.replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>") : "";
            
            let instructionHTML = '';
            if(safeInstruction) {
                instructionHTML = `<div style="color: #ffffff; font-weight: 600; font-size: 14px; margin-bottom: 8px; margin-left: 2px; line-height: 1.5; font-family: 'Inter', sans-serif;">${safeInstruction}</div>`;
            }

            container.innerHTML += `
                <div class="telegram-prompt-wrapper">
                    ${instructionHTML}
                    <div class="telegram-prompt-card">
                        <div class="telegram-prompt-header" style="display:flex; align-items:center;">
                            ${data.title}
                        </div>
                        <div class="telegram-prompt-body">${safeText}</div>
                        <div class="telegram-prompt-footer">
                            <button class="telegram-copy-btn" id="copy-btn-${id}" onclick="copyPromptText(decodeURIComponent('${encodeURIComponent(data.text)}'), 'copy-btn-${id}')"><i class="far fa-copy"></i> COPY CODE</button>
                        </div>
                    </div>
                </div>
            `;
        });
    });

    onSnapshot(query(collection(db, "tutorials"), orderBy("createdAt", "desc")), (snapshot) => {
        const grid = document.getElementById('adminTutorialsGrid');
        if(grid) {
            grid.innerHTML = '';
            snapshot.forEach(doc => {
                const data = doc.data();
                renderTutorialCard(data);
            });
        }
    });

    const q = query(collection(db, "books"), orderBy("createdAt", "desc"));
    onSnapshot(q, (snapshot) => {
        booksData = [];
        snapshot.forEach((doc) => {
            let data = doc.data(); data.id = doc.id;
            data.slug = data.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
            booksData.push(data);
        });
        loadedCount = 0;
        const searchInput = document.getElementById('app-search-input').value;
        if(searchInput.trim() === "") { window.renderBooksUI(0, getBatchSize() * 2); } else { performFuzzySearch(searchInput); }
        window.generateNotifications();
        
        adminFilteredBooks = [...booksData];
        document.getElementById('adminSearchBook').value = '';
        renderAdminBooksTable(); 
        
        isAppReady.data = true;
        tryTransition();
    });
});

window.copyPromptText = function(text, btnId) {
    if(!text) return;
    navigator.clipboard.writeText(text).then(() => {
        const btn = document.getElementById(btnId);
        const originalHTML = btn.innerHTML;
        btn.innerHTML = `<i class="fas fa-check" style="color: #25D366;"></i> COPIED`;
        btn.style.color = "#25D366";
        setTimeout(() => {
            btn.innerHTML = originalHTML;
            btn.style.color = "#B5BAC1";
        }, 2000);
    }).catch(err => {
        showToast("Failed to copy!");
    });
};

async function renderTutorialCard(data) {
    try {
        const videoUrl = data.url;
        const customViews = data.views || "10K"; 
        const customDuration = data.duration || "10:00";
        const customAvatar = data.avatarUrl || "https://i.postimg.cc/D0BF1b77/file-000000000e847207a64f6711d825a859.png"; 
        
        const videoIdMatch = videoUrl.match(/(?:youtu\.be\/|youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtube\.com\/shorts\/)([^"&?\/\s]{11})/i);
        if (!videoIdMatch) return;
        const videoId = videoIdMatch[1];
        const standardUrl = `https://www.youtube.com/watch?v=${videoId}`;

        let title = "YouTube Video";
        let channelName = "Tutorial";
        
        try {
            const response = await fetch(`https://noembed.com/embed?url=${standardUrl}`);
            const vidData = await response.json();
            if(vidData.title) title = vidData.title;
            if(vidData.author_name) channelName = vidData.author_name;
        } catch(e) {}

        const thumbnailUrl = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
        const fallbackUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
        
        const cardHTML = `
            <div class="yt-card">
                <div class="yt-thumbnail-wrapper" onclick="window.open('${videoUrl}', '_blank')">
                    <img src="${thumbnailUrl}" class="yt-thumbnail-img" alt="Thumbnail" onerror="this.src='${fallbackUrl}'" oncontextmenu="return false;" draggable="false" style="-webkit-touch-callout: none; pointer-events: none;">
                    <div class="yt-duration">${customDuration}</div>
                </div>
                <div class="yt-info-box" onclick="window.open('${videoUrl}', '_blank')">
                    <img src="${customAvatar}" class="yt-avatar" alt="Avatar" oncontextmenu="return false;" draggable="false" style="-webkit-touch-callout: none; pointer-events: none;">
                    <div class="yt-text-content">
                        <div class="yt-video-title">${title}</div>
                        <div class="yt-channel-name">
                            ${channelName} • ${customViews} views
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.getElementById('adminTutorialsGrid').innerHTML += cardHTML;
    } catch (error) {}
}

document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault(); 
    const email = document.getElementById('loginEmail').value; 
    const pass = document.getElementById('loginPassword').value;
    
    const btn = document.getElementById('loginBtn'); 
    const originalContent = btn.innerHTML;
    btn.innerHTML = `<span style="display:flex; align-items:center; gap:8px;"><div class="premium-loader"></div> Authenticating...</span>`;
    
    try { 
        await signInWithEmailAndPassword(auth, email, pass); 
        e.target.reset(); 
        showToast("Login Successful!"); 
        btn.innerHTML = originalContent; 
        
        window.closeLoginOverlay();
        
        if (isDeepLinkLoad && pendingBookSlug) {
            document.getElementById('mainAppWrapper').style.display = 'block';
            setTimeout(() => { window.openDownloadPage(pendingBookSlug, true); }, 300);
        }
    } catch(err) { 
        showToast("Failed: Invalid Credentials!"); 
        btn.innerHTML = originalContent; 
    } 
});

document.getElementById('googleSignInBtn').addEventListener('click', async () => { 
    const btn = document.getElementById('googleSignInBtn');
    const originalContent = btn.innerHTML;
    btn.innerHTML = `<span style="display:flex; align-items:center; gap:8px;"><div class="premium-loader"></div> Connecting...</span>`;
    
    try { 
        await signInWithPopup(auth, provider); 
        showToast("Google Login Successful!");
        btn.innerHTML = originalContent;
        
        window.closeLoginOverlay();
        
        if (isDeepLinkLoad && pendingBookSlug) {
            document.getElementById('mainAppWrapper').style.display = 'block';
            setTimeout(() => { window.openDownloadPage(pendingBookSlug, true); }, 300);
        }
    } catch(err) { 
        showToast("Failed: Google Sign-In Error."); 
        btn.innerHTML = originalContent;
    } 
});

document.getElementById('admin-logout-btn').addEventListener('click', () => { 
    if(confirm("Are you sure you want to logout?")) {
        signOut(auth).then(() => { 
            document.getElementById('admin-dashboard-panel').classList.remove('active'); 
            showToast("Logged out successfully");
        });
    }
});

window.closePopup = function(){ document.getElementById("popupOverlay").style.display = "none"; };
window.joinChannel = function(){ window.open('https://whatsapp.com/channel/0029Vb6NBZx1yT2GByTTVf2A', '_blank'); };

let searchTimeout;
const searchInputEl = document.getElementById('app-search-input');
const closeSearchBtn = document.getElementById('close-search');

searchInputEl.addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    const searchText = e.target.value;
    searchTimeout = setTimeout(() => {
        if(searchText.trim() === "") { document.getElementById('no-results-msg').style.display = 'none'; window.renderBooksUI(0, getBatchSize() * 2); } 
        else { performFuzzySearch(searchText); }
    }, 300);
});

closeSearchBtn.addEventListener('click', () => {
    searchInputEl.value = ''; document.getElementById('no-results-msg').style.display = 'none'; window.renderBooksUI(0, getBatchSize() * 2); document.getElementById('search-box').classList.remove('active');
    if (history.state && history.state.popup === 'search') { history.back(); }
});

function performFuzzySearch(searchText) {
    let normalizedSearch = searchText.toLowerCase().replace(/[^a-z0-9\s]/g, '');
    let searchTokens = normalizedSearch.split(/\s+/).filter(token => token.length > 0);
    const filteredData = booksData.filter(book => {
        let textToSearch = (book.title + " " + book.author).toLowerCase().replace(/[^a-z0-9\s]/g, '');
        return searchTokens.every(token => textToSearch.includes(token));
    });
    if(filteredData.length > 0) { document.getElementById('no-results-msg').style.display = 'none'; window.renderBooksUI(0, filteredData.length, filteredData); } 
    else { document.getElementById("bookContainer").innerHTML = ""; document.getElementById('no-results-msg').style.display = 'flex'; }
}

function getBatchSize() {
    let cols = 2; 
    if (window.innerWidth >= 768) {
        const container = document.getElementById("bookContainer");
        if (container && container.clientWidth) { cols = Math.floor((container.clientWidth + 25) / 225) || 1; } else { cols = 4; }
    }
    return cols * 4; 
}

const mainElement = document.getElementById('mainContentArea');
mainElement.addEventListener('scroll', () => {
    if(document.getElementById('app-search-input').value.trim() !== "") return;
    if (mainElement.scrollTop + mainElement.clientHeight >= mainElement.scrollHeight - 50) {
        const noResultsMsg = document.getElementById('no-results-msg');
        if (loadedCount < booksData.length && !isLoadingMore && noResultsMsg.style.display !== 'flex') {
            isLoadingMore = true;
            document.getElementById("bottomSpinner").style.display = "flex";
            setTimeout(() => {
                window.renderBooksUI(loadedCount, getBatchSize());
                document.getElementById("bottomSpinner").style.display = "none";
                isLoadingMore = false;
            }, 1000); 
        }
    }
});

window.renderBooksUI = function(startIndex, count, customData = null) {
    const container = document.getElementById("bookContainer");
    let dataToRender = customData ? customData : booksData;
    let endIndex = Math.min(startIndex + count, dataToRender.length);
    if(startIndex === 0) container.innerHTML = "";
    for(let i = startIndex; i < endIndex; i++) {
        let book = dataToRender[i];
        let langClass = book.lang.toLowerCase() === 'hindi' ? 'tag-lang-hindi' : 'tag-lang-english';
        container.innerHTML += `
        <div class="book-card" onclick="openDownloadPage('${book.slug}')">
            <div class="card-img-wrapper"><div class="badge-free">FREE</div><img src="${book.image}" class="book-image" oncontextmenu="return false;" draggable="false"></div>
            <div class="book-details"><div class="book-title">${book.title}</div><div class="book-author">${book.author}</div>
            <div class="tags-container"><span class="book-tag tag-year">${book.year}</span><span class="book-tag ${langClass}">${book.lang}</span></div></div>
        </div>`;
    }
    loadedCount = endIndex;
}

window.generateNotifications = function() {
    const notiContainer = document.getElementById('dynamic-noti-container'); 
    notiContainer.innerHTML = ''; 
    booksData.slice(0, 15).forEach((book) => {
        
        let dateStr = "00/00/0000";
        if (book.dateAdded) {
            dateStr = book.dateAdded; 
        } else if (book.createdAt) {
            const d = new Date(book.createdAt);
            dateStr = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth()+1).padStart(2, '0')}/${d.getFullYear()}`;
        }

        notiContainer.innerHTML += `
        <div class="noti-card-dynamic" onclick="openDownloadPage('${book.slug}')" style="cursor:pointer;">
            <img src="${book.image}" class="noti-card-img" alt="Logo">
            <div class="noti-card-content">
                <div class="noti-card-title">${book.title} Book Added ✅</div>
                <div class="noti-card-desc">New book is now available.</div>
                <div style="font-size: 10px; color: #10b981; margin-top: 2px; font-weight: 700; display: flex; align-items: center; gap: 4px;">
                    <i class="far fa-calendar-alt"></i> Added: ${dateStr}
                </div>
            </div>
        </div>`;
    });
}

document.getElementById('open-search').addEventListener('click', () => { history.pushState({ popup: 'search' }, ''); document.getElementById('search-box').classList.add('active'); setTimeout(() => { searchInputEl.focus(); }, 300); });
document.getElementById('open-noti').addEventListener('click', () => { history.pushState({ popup: 'noti' }, ''); document.getElementById('noti-panel').classList.add('active'); document.querySelector('.blink-dot').style.display = 'none'; });
document.getElementById('close-noti').addEventListener('click', () => { if (history.state && history.state.popup) { history.back(); } else { document.getElementById('noti-panel').classList.remove('active'); }});

const sidebar = document.getElementById('sidebar'); const sidebarOverlay = document.getElementById('sidebar-overlay');
document.getElementById('open-menu').addEventListener('click', () => { history.pushState({ popup: 'sidebar' }, ''); sidebar.classList.add('active'); sidebarOverlay.classList.add('active'); });
sidebarOverlay.addEventListener('click', () => { history.back(); });

document.getElementById('menu-home').addEventListener('click', (e) => { e.preventDefault(); history.back(); });
document.getElementById('menu-about-dev').addEventListener('click', (e) => { e.preventDefault(); history.replaceState({ popup: 'dev' }, ''); document.getElementById('about-dev-panel').classList.add('active'); sidebar.classList.remove('active'); sidebarOverlay.classList.remove('active'); });
document.getElementById('close-dev-btn').addEventListener('click', () => { history.back(); });
document.getElementById('menu-dmca').addEventListener('click', (e) => { e.preventDefault(); history.replaceState({ popup: 'dmca' }, ''); document.getElementById('dmca-panel').classList.add('active'); sidebar.classList.remove('active'); sidebarOverlay.classList.remove('active'); });
document.getElementById('close-dmca-btn').addEventListener('click', () => { history.back(); });

document.getElementById('menu-admin-panel').addEventListener('click', (e) => {
    e.preventDefault();
    if(!isUserLoggedIn) {
        sidebar.classList.remove('active'); sidebarOverlay.classList.remove('active');
        document.getElementById('loginOverlay').style.display = 'flex';
        setTimeout(() => document.getElementById('loginOverlay').style.opacity = '1', 10);
        return;
    }
    history.pushState({ popup: 'admin' }, '');
    document.getElementById('admin-dashboard-panel').classList.add('active');
    sidebar.classList.remove('active'); sidebarOverlay.classList.remove('active');
});
document.getElementById('close-admin-btn').addEventListener('click', () => { history.back(); });

window.addEventListener('popstate', (e) => {
    document.getElementById('noti-panel').classList.remove('active'); document.getElementById('sidebar').classList.remove('active'); document.getElementById('sidebar-overlay').classList.remove('active'); document.getElementById('about-dev-panel').classList.remove('active'); document.getElementById('dmca-panel').classList.remove('active'); document.getElementById('admin-dashboard-panel').classList.remove('active'); document.getElementById('search-box').classList.remove('active');
    const sBook = new URLSearchParams(window.location.search).get('book');
    if(sBook) { if(window.openDownloadPage) window.openDownloadPage(sBook, true); } 
    else { document.getElementById("downloadModal").style.display = "none"; }
});

window.openDownloadPage = function(slug, skipPushState = false) {
    if(!isUserLoggedIn) {
        document.getElementById('loginOverlay').style.display = 'flex';
        setTimeout(() => document.getElementById('loginOverlay').style.opacity = '1', 10);
        return;
    }

    const book = booksData.find(b => b.slug === slug); if(!book) return;
    document.getElementById("downloadModal").style.display = "flex";
    
    const previewImg = document.getElementById("dlPreviewImage");
    previewImg.classList.add("image-loading-skeleton"); 
    previewImg.src = book.image; 
    previewImg.onload = () => {
        previewImg.classList.remove("image-loading-skeleton"); 
    };

    document.getElementById("dlBookTitle").innerText = book.title; 
    document.getElementById("dlBookAuthor").innerText = book.author;
    
    document.getElementById("dlPdfLinkBtn").onclick = async function() { 
        if(!isUserLoggedIn || !auth.currentUser) {
            document.getElementById('loginOverlay').style.display = 'flex';
            setTimeout(() => document.getElementById('loginOverlay').style.opacity = '1', 10);
            return;
        }

        const btn = document.getElementById("dlPdfLinkBtn");
        const originalText = btn.innerHTML;
        const uid = auth.currentUser.uid;
        const userDownloadRef = doc(db, "user_downloads", uid);
        
        const MAX_DOWNLOADS = 2;

        btn.innerHTML = `<span style="display:flex; align-items:center; gap:8px;"><i class="fas fa-spinner fa-spin"></i> Processing...</span>`;
        btn.disabled = true;

        try {
            const docSnap = await getDoc(userDownloadRef);
            const now = new Date().getTime();

            if (docSnap.exists()) {
                let data = docSnap.data();
                let lastDownloadTime = data.lastTime || 0;
                let count = data.count || 0;

                const hoursPassed = (now - lastDownloadTime) / (1000 * 60 * 60);

                if (hoursPassed < 24) {
                    if (count >= MAX_DOWNLOADS && !IS_SUPER_ADMIN) {
                        showToast("Your plan is exhausted! Please try again after 24 hours.");
                        btn.innerHTML = originalText;
                        btn.disabled = false;
                        return; 
                    }
                    await updateDoc(userDownloadRef, { count: count + 1 });
                } else {
                    await updateDoc(userDownloadRef, { count: 1, lastTime: now });
                }
            } else {
                await setDoc(userDownloadRef, { count: 1, lastTime: now });
            }

            if(book.pdfLink) {
                window.open(book.pdfLink, '_blank'); 
            }
            
        } catch (error) {
            console.error("Download tracking error:", error);
            showToast("Failed to initiate download. Try again.");
        } finally {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    };
    
    document.getElementById("dlYoutubeLinkBtn").onclick = function() { 
        if(book.ytLink && book.ytLink !== "#" && book.ytLink !== "") { 
            window.open(book.ytLink, '_blank'); 
        } else {
            window.open('https://youtube.com/@madxprince', '_blank');
        }
    };

    let examsArray = (book.exams || "General").split(',').map(item => item.trim());
    document.getElementById("dlModalTags").innerHTML = examsArray.map(exam => `<div class="dl-modal-tag">${exam}</div>`).join('');
    
    activeBookSlug = book.slug;
    activeBookTitle = book.title;
    
    if (!skipPushState) { history.pushState({ popup: 'book' }, '', '?book=' + book.slug); }
}

window.closeDownloadPage = function() {
    if (history.state && history.state.popup === 'book') { 
        history.back(); 
    } else { 
        document.getElementById("downloadModal").style.display = "none"; 
        window.history.replaceState({}, '', window.location.pathname); 
    }

    if(isDeepLinkLoad) {
        isDeepLinkLoad = false;
        const loader = document.getElementById("loaderScreen");
        loader.style.display = "flex";
        loader.style.opacity = "1";
        
        updateLoaderUI(100);

        setTimeout(() => {
            loader.style.opacity = "0";
            setTimeout(() => {
                loader.style.display = "none";
                document.getElementById("popupOverlay").style.display = "flex";
            }, 300);
        }, 1500); 
    }
}
window.shareBook = function() {
    const shareUrl = window.location.origin + window.location.pathname + "?book=" + activeBookSlug;
    if (navigator.share) navigator.share({ title: activeBookTitle, text: "Download free book", url: shareUrl });
    else { navigator.clipboard.writeText(shareUrl); alert("Link Copied!"); }
}

function showToast(message) {
    const toast = document.getElementById('toast'); 
    if (message.toLowerCase().includes('failed') || message.toLowerCase().includes('error') || message.toLowerCase().includes('invalid') || message.toLowerCase().includes('exhausted')) {
        toast.style.background = '#ef4444';
        toast.innerHTML = `<i class="fas fa-exclamation-circle"></i> <span id="toastMsg">${message}</span>`;
    } else {
        toast.style.background = '#10b981';
        toast.innerHTML = `<i class="fas fa-check-circle"></i> <span id="toastMsg">${message}</span>`;
    }
    toast.classList.add('show'); 
    setTimeout(() => { toast.classList.remove('show'); }, 3000);
}

document.getElementById('addBookForm').addEventListener('submit', async (e) => {
    e.preventDefault(); 
    
    const btn = document.getElementById('publishBtn');
    const originalText = btn.innerHTML;
    
    const titleInput = document.getElementById('inTitle').value; 
    const imgInput = document.getElementById('inImage').value;
    const pdfUrlInput = document.getElementById('inPdfUrl').value;
    const ytUrlInput = document.getElementById('inYtUrl').value;

    if (!IS_SUPER_ADMIN) {
        if (!pdfUrlInput.includes('drive.google.com')) {
            showToast("Failed: Normal users can only upload Google Drive links!");
            return;
        }
    }

    btn.innerHTML = `<span class="btn-text" style="display: flex; align-items: center; justify-content: center; gap: 10px;"><div class="premium-loader" style="border-color:#000;"></div> Publishing...</span>`;
    btn.disabled = true;

    const newBook = { 
        title: titleInput, 
        author: document.getElementById('inAuthor').value, 
        image: imgInput, 
        year: document.getElementById('inYear').value, 
        lang: document.getElementById('inLang').value, 
        exams: document.getElementById('inExams').value, 
        pdfLink: pdfUrlInput, 
        ytLink: IS_SUPER_ADMIN ? ytUrlInput : "", 
        dateAdded: new Date().toLocaleDateString('en-GB').toUpperCase(), 
        createdAt: new Date().getTime() 
    };

    try { 
        await addDoc(collection(db, "books"), newBook); 
        showToast("Book Published Successfully!"); 
        e.target.reset(); 
    } catch (error) { 
        if(error.message.includes("Missing or insufficient permissions")) { showToast("Failed: Firebase Security Rules Blocked Save!"); } 
        else { showToast("Failed: " + error.message); }
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
});

document.getElementById('adminSearchBook').addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase().replace(/[^a-z0-9\s]/g, '');
    const tokens = term.split(/\s+/).filter(t => t.length > 0);
    adminFilteredBooks = booksData.filter(b => {
        const str = (b.title + " " + b.author).toLowerCase().replace(/[^a-z0-9\s]/g, '');
        return tokens.every(t => str.includes(t));
    });
    adminCurrentPage = 1;
    renderAdminBooksTable();
});

window.changeAdminPage = function(dir) {
    adminCurrentPage += dir;
    renderAdminBooksTable();
}

function renderAdminBooksTable() {
    if(!document.getElementById('adminBooksTableBody')) return;
    if(document.getElementById('adminSearchBook').value.trim() === "") { adminFilteredBooks = [...booksData]; }

    const totalPages = Math.ceil(adminFilteredBooks.length / adminBooksPerPage) || 1;
    if(adminCurrentPage > totalPages) adminCurrentPage = totalPages;
    if(adminCurrentPage < 1) adminCurrentPage = 1;

    document.getElementById('admPageInfo').innerText = `Page ${adminCurrentPage} of ${totalPages}`;
    document.getElementById('admPrevPage').disabled = adminCurrentPage === 1;
    document.getElementById('admNextPage').disabled = adminCurrentPage === totalPages;

    const startIdx = (adminCurrentPage - 1) * adminBooksPerPage;
    const paginated = adminFilteredBooks.slice(startIdx, startIdx + adminBooksPerPage);
    const tbody = document.getElementById('adminBooksTableBody');
    let htmlString = "";
    
    if(paginated.length === 0) {
         tbody.innerHTML = `<tr><td colspan="3" style="text-align:center; padding:20px; color:#a1a1aa; font-weight:800;">No books found matching search.</td></tr>`;
         return;
    }

    paginated.forEach((book) => { 
        htmlString += `<tr>
            <td><img src="${book.image}" style="width:40px; border-radius:5px;"></td>
            <td><strong style="color:#fff;">${book.title}</strong><br><span style="font-size:0.8rem; color:#a1a1aa;">${book.author}</span></td>
            <td>
                <button class="adm-btn-edit" onclick="openAdminEditModal('${book.id}')"><i class="fas fa-edit"></i></button>
                <button class="adm-btn-delete" onclick="deleteBookRecord('${book.id}')"><i class="fas fa-trash"></i></button>
            </td>
        </tr>`; 
    });
    tbody.innerHTML = htmlString;
}

window.deleteBookRecord = async function(id) { 
    if(confirm("Delete this book permanently?")) { 
        try { 
            await deleteDoc(doc(db, "books", id)); 
            showToast("Deleted Successfully!"); 
        } catch (error) { showToast("Failed: Rules Blocked Delete!"); } 
    } 
}

window.openAdminEditModal = function(id) {
    const book = booksData.find(x => x.id === id); 
    document.getElementById('editDocId').value = book.id; 
    document.getElementById('edTitle').value = book.title; 
    document.getElementById('edAuthor').value = book.author || ""; 
    document.getElementById('edYear').value = book.year || "2026"; 
    document.getElementById('edLang').value = book.lang || "Hindi"; 
    document.getElementById('edExams').value = book.exams || ""; 
    document.getElementById('edImage').value = book.image; 
    document.getElementById('edPdfUrl').value = book.pdfLink || ""; 
    document.getElementById('edYtUrl').value = book.ytLink || ""; 
    document.getElementById('adminEditModal').style.display = 'flex';
}

document.getElementById('editBookForm').addEventListener('submit', async (e) => {
    e.preventDefault(); 
    
    const btn = document.getElementById('editSaveBtn');
    const originalText = btn.innerHTML;
    const pdfUrlInput = document.getElementById('edPdfUrl').value;

    if (!IS_SUPER_ADMIN) {
        if (!pdfUrlInput.includes('drive.google.com')) {
            showToast("Failed: You can only upload Google Drive links!");
            return;
        }
    }

    btn.innerHTML = `<span class="btn-text" style="display: flex; align-items: center; justify-content: center; gap: 10px;"><div class="premium-loader"></div> Saving...</span>`;
    btn.disabled = true;

    const docId = document.getElementById('editDocId').value;
    const updatedData = { 
        title: document.getElementById('edTitle').value, 
        author: document.getElementById('edAuthor').value, 
        year: document.getElementById('edYear').value, 
        lang: document.getElementById('edLang').value, 
        exams: document.getElementById('edExams').value, 
        image: document.getElementById('edImage').value, 
        pdfLink: pdfUrlInput, 
        ytLink: IS_SUPER_ADMIN ? document.getElementById('edYtUrl').value : ""
    };

    try { 
        await updateDoc(doc(db, "books", docId), updatedData); 
        document.getElementById('adminEditModal').style.display='none'; 
        showToast("Updated Successfully!"); 
    } catch (error) { showToast("Failed: Rules Blocked Update!"); } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
});
