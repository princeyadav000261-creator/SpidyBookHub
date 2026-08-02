import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore, collection, addDoc, doc, updateDoc, onSnapshot, query, orderBy, setDoc, getDoc, increment, getDocs } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getAuth, signInWithEmailAndPassword, GoogleAuthProvider, signInWithPopup, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-analytics.js";

// ==========================================
// 1. FIREBASE CONFIGURATION
// ==========================================
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

// ==========================================
// 2. CLOUDFLARE R2 DIRECT API CONFIGURATION
// ==========================================
const R2_UPLOAD_API_URL = "https://your-worker-name.your-subdomain.workers.dev/upload";
const R2_API_TOKEN = "YOUR_SECURE_API_HASH_TOKEN";

// ==========================================
// GLOBAL VARIABLES
// ==========================================
let booksData = [];
let mainFilteredData = []; 
let loadedCount = 0; 
let isLoadingMore = false;
let activeBookSlug = ""; 
let activeBookTitle = "";

let IS_SUPER_ADMIN = false;
let isUserLoggedIn = false; 

let CURRENT_ADMIN_NAME = "USER";
let CURRENT_ADMIN_EMAIL = "";
let CURRENT_ADMIN_PHOTO = "https://i.postimg.cc/D0BF1b77/file-000000000e847207a64f6711d825a859.png";

let savedBooks = JSON.parse(localStorage.getItem('spidy_saved_books')) || [];
let selectedCoverFile = null;
let selectedPdfFile = null;

// ==========================================
// UTILITY FUNCTIONS
// ==========================================
function sanitizeHTML(str) {
    if (typeof str !== 'string') return str;
    return str.replace(/[&<>'"]/g, function(match) {
        const escape = { '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' };
        return escape[match];
    });
}

function showToast(message) {
    const toast = document.getElementById('toast'); 
    const lowerMsg = message.toLowerCase();
    
    if (lowerMsg.includes('deleted')) {
        toast.style.background = 'rgba(239, 68, 68, 0.95)'; 
        toast.innerHTML = `<i class="fas fa-trash"></i> <span id="toastMsg">${sanitizeHTML(message)}</span>`;
    } else if (lowerMsg.includes('failed') || lowerMsg.includes('error') || lowerMsg.includes('limit') || lowerMsg.includes('select')) {
        toast.style.background = 'rgba(239, 68, 68, 0.95)'; 
        toast.innerHTML = `<i class="fas fa-exclamation-circle"></i> <span id="toastMsg">${sanitizeHTML(message)}</span>`;
    } else {
        toast.style.background = 'rgba(16, 185, 129, 0.95)'; 
        toast.innerHTML = `<i class="fas fa-check-circle"></i> <span id="toastMsg">${sanitizeHTML(message)}</span>`;
    }
    
    toast.classList.add('show'); 
    setTimeout(() => { toast.classList.remove('show'); }, 3000);
}

// ==========================================
// INITIAL LOADER & DEEP LINKING
// ==========================================
const urlParamsCheck = new URLSearchParams(window.location.search);
let isDeepLinkLoad = urlParamsCheck.has('book'); 
let pendingBookSlug = urlParamsCheck.get('book');

if (isDeepLinkLoad) {
    document.getElementById('mainAppWrapper').style.display = 'none';
    document.getElementById('downloadModal').style.display = 'none';
}

let isAppReady = { auth: false, data: false }; 
let hasTransitioned = false;
let popupShown = false;
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
        else if (percent < 95) loaderStatusText.innerText = "Preparing Content...";
        else loaderStatusText.innerText = "Ready to Launch!";
    }
}

loaderInterval = setInterval(() => {
    if (loadingProgress < 85) {
        loadingProgress += Math.floor(Math.random() * 5) + 2; 
        if (loadingProgress > 85) loadingProgress = 85;
        updateLoaderUI(loadingProgress);
    }
}, 200);

function tryTransition() {
    if (isAppReady.auth && isAppReady.data && !hasTransitioned) {
        hasTransitioned = true;
        clearInterval(loaderInterval); 
        
        let fastLoad = setInterval(() => {
            loadingProgress += 4;
            if(loadingProgress >= 100) {
                loadingProgress = 100;
                updateLoaderUI(100);
                clearInterval(fastLoad);

                setTimeout(() => {
                    document.getElementById('mainAppWrapper').style.display = 'block';

                    if (isDeepLinkLoad && pendingBookSlug) {
                        if (isUserLoggedIn) { openDownloadPageLocal(pendingBookSlug, true); } 
                        else {
                            const loginOverlay = document.getElementById('loginOverlay');
                            loginOverlay.style.display = 'flex';
                            setTimeout(() => loginOverlay.style.opacity = '1', 10);
                        }
                    } else {
                        setTimeout(() => {
                            if(!popupShown && !isDeepLinkLoad) {
                                popupShown = true;
                                document.getElementById("popupOverlay").style.display = "flex";
                            }
                        }, 15000); 
                    }
                    const loader = document.getElementById("loaderScreen");
                    loader.style.opacity = "0"; 
                    setTimeout(() => { loader.style.display = "none"; }, 300);
                }, 400); 
            } else {
                updateLoaderUI(loadingProgress);
            }
        }, 15);
    }
}

document.getElementById('joinWhatsappBtn').addEventListener('click', () => { window.open('https://whatsapp.com/channel/0029Vb6NBZx1yT2GByTTVf2A', '_blank'); });
document.getElementById('laterPopupBtn').addEventListener('click', () => { document.getElementById("popupOverlay").style.display = "none"; });

// ==========================================
// QUOTE GENERATOR
// ==========================================
const quotes = [
    { text: "Knowledge Builds Power, Hard Work Creates Success, Never Give Up!", author: "MADxPRINCE" },
    { text: "I have not failed. I've just found 10,000 ways that won't work.", author: "Thomas A. Edison" },
    { text: "The only way to do great work is to love what you do.", author: "Steve Jobs" },
    { text: "In the middle of difficulty lies opportunity.", author: "Albert Einstein" }
];
const todayDays = Math.floor(Date.now() / (1000 * 60 * 60 * 24));
const currentQuoteIndex = todayDays % quotes.length;
document.getElementById('daily-quote-text').innerHTML = `<i class="fas fa-quote-left" style="color: rgba(255,255,255,0.3); margin-right:5px;"></i> ${sanitizeHTML(quotes[currentQuoteIndex].text)}`;
document.getElementById('daily-quote-author').innerText = `— ${sanitizeHTML(quotes[currentQuoteIndex].author)}`;

// ==========================================
// AUTHENTICATION & LIVE CREDITS
// ==========================================
function updateLiveCredits(uploads, downloads) {
    if (IS_SUPER_ADMIN) {
        document.getElementById('profile-credits').innerHTML = `<span style="font-size: 24px;">&infin;</span>`; 
        return;
    }
    let allowedDownloads = 2 + (uploads * 2);
    let remainingCredits = allowedDownloads - downloads;
    if (remainingCredits < 0) remainingCredits = 0;
    document.getElementById('profile-credits').innerText = remainingCredits;
}

onAuthStateChanged(auth, async (user) => {
    if (user) {
        isUserLoggedIn = true;
        localStorage.setItem('isUserLoggedIn', 'true');

        let dName = user.displayName || user.email.split('@')[0];
        document.getElementById('sidebarProfileName').innerText = sanitizeHTML(dName);
        
        const sidebarAvatar = document.getElementById('sidebarProfileImg');
        CURRENT_ADMIN_PHOTO = user.photoURL ? user.photoURL : "https://i.postimg.cc/D0BF1b77/file-000000000e847207a64f6711d825a859.png";
        sidebarAvatar.src = CURRENT_ADMIN_PHOTO;
        
        CURRENT_ADMIN_NAME = dName;
        CURRENT_ADMIN_EMAIL = user.email;

        try {
            const userRef = doc(db, "users", user.uid);
            const userSnap = await getDoc(userRef);
            
            const cleanEmail = user.email ? user.email.toLowerCase().trim() : "";
            const adminDocRef = doc(db, "admins", cleanEmail);
            const adminDocSnap = await getDoc(adminDocRef);

            if (adminDocSnap.exists()) {
                IS_SUPER_ADMIN = true;
                document.getElementById('sidebarRoleText').innerText = "Super Admin";
            } else {
                IS_SUPER_ADMIN = false;
                document.getElementById('sidebarRoleText').innerText = "Verified User";
                switchAdminTabLocal('add');
            }

            if (!userSnap.exists()) {
                await setDoc(userRef, { email: user.email, name: dName, photo: user.photoURL || "", totalUploads: 0, lifetimeDownloads: 0, createdAt: new Date().getTime() }, { merge: true });
                updateLiveCredits(0, 0); 
            } else {
                let data = userSnap.data();
                updateLiveCredits(data.totalUploads || 0, data.lifetimeDownloads || 0);
            }

        } catch (error) { console.error("Verification failed:", error); IS_SUPER_ADMIN = false; }
    } else {
        isUserLoggedIn = false; IS_SUPER_ADMIN = false; localStorage.removeItem('isUserLoggedIn');
        document.getElementById('sidebarProfileName').innerText = "Guest User";
        document.getElementById('sidebarRoleText').innerText = "Please Login";
        document.getElementById('sidebarProfileImg').src = "https://i.postimg.cc/D0BF1b77/file-000000000e847207a64f6711d825a859.png";
        document.getElementById('profile-credits').innerText = "--";
    }

    isAppReady.auth = true; tryTransition();

    // Fetch Prompts
    onSnapshot(query(collection(db, "prompts"), orderBy("createdAt", "asc")), (snapshot) => {
        const container = document.getElementById('promptsContainer');
        container.innerHTML = '';
        if(snapshot.empty) { container.innerHTML = `<div style="text-align:center; padding:20px; color:#a1a1aa; font-weight:800;">No prompts available yet.</div>`; return; }
        snapshot.forEach(doc => {
            const data = doc.data(); const id = doc.id;
            const safeText = sanitizeHTML(data.text);
            const safeInstruction = data.instruction ? sanitizeHTML(data.instruction).replace(/\n/g, "<br>") : "";
            const safeTitle = sanitizeHTML(data.title);
            let instructionHTML = '';
            if(safeInstruction) { instructionHTML = `<div style="color: #ffffff; font-weight: 600; font-size: 14px; margin-bottom: 8px; margin-left: 2px; line-height: 1.5; font-family: 'Inter', sans-serif;">${safeInstruction}</div>`; }
            container.innerHTML += `<div class="telegram-prompt-wrapper">${instructionHTML}<div class="telegram-prompt-card"><div class="telegram-prompt-header" style="display:flex; align-items:center;">${safeTitle}</div><div class="telegram-prompt-body">${safeText}</div><div class="telegram-prompt-footer"><button class="telegram-copy-btn" data-text="${encodeURIComponent(data.text)}" id="copy-btn-${id}"><i class="far fa-copy"></i> COPY CODE</button></div></div></div>`;
        });
    });

    // Fetch Books
    const q = query(collection(db, "books"), orderBy("createdAt", "desc"));
    onSnapshot(q, (snapshot) => {
        booksData = [];
        snapshot.forEach((doc) => {
            let data = doc.data(); data.id = doc.id;
            data.slug = data.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
            booksData.push(data);
        });
        mainFilteredData = [...booksData]; 
        updateDynamicFilters(); applyMasterFilter(); generateNotifications();
        
        isAppReady.data = true; tryTransition();
    });
});

// ==========================================
// PROMPT COPY BUTTON FIX (Event Delegation)
// ==========================================
document.getElementById('promptsContainer').addEventListener('click', (e) => {
    const copyBtn = e.target.closest('.telegram-copy-btn');
    if (copyBtn) {
        const textToCopy = decodeURIComponent(copyBtn.getAttribute('data-text'));
        
        navigator.clipboard.writeText(textToCopy).then(() => {
            const originalHtml = copyBtn.innerHTML;
            
            // Yahan par button ka design change hoga green color mein
            copyBtn.innerHTML = '<i class="fas fa-check"></i> COPIED!';
            copyBtn.style.background = 'rgba(16, 185, 129, 0.2)';
            copyBtn.style.color = '#10b981';
            copyBtn.style.border = '1px solid rgba(16, 185, 129, 0.4)';
            
            // 2 second baad button wapas normal ho jayega
            setTimeout(() => {
                copyBtn.innerHTML = originalHtml;
                copyBtn.style.background = 'transparent';
                copyBtn.style.color = '#ffffff';
                copyBtn.style.border = 'none';
            }, 2000);
            
            // showToast("Prompt copied to clipboard!"); // <--- Is line ko hata diya gaya hai popup rokne ke liye
        }).catch(err => {
            console.error('Failed to copy: ', err);
            showToast("Failed to copy text!"); // Error aane par abhi bhi toast dikhega jo useful hai
        });
    }
});


// LOGIN SYSTEM
function closeLoginOverlayLocal() {
    const loginOverlay = document.getElementById('loginOverlay');
    loginOverlay.style.opacity = '0';
    setTimeout(() => { 
        loginOverlay.style.display = 'none'; 
        if (isDeepLinkLoad && !isUserLoggedIn) {
            isDeepLinkLoad = false;
            window.history.replaceState({}, '', window.location.pathname);
            document.getElementById("popupOverlay").style.display = "flex";
        }
    }, 500);
}
document.getElementById('closeLoginBtn').addEventListener('click', closeLoginOverlayLocal);
document.getElementById('toggleEye').addEventListener('click', () => {
    const passInput = document.getElementById('loginPassword'); const eyeIcon = document.getElementById('toggleEye');
    if (passInput.type === 'password') { passInput.type = 'text'; eyeIcon.classList.replace('fa-eye', 'fa-eye-slash'); eyeIcon.style.color = '#00d2ff'; } 
    else { passInput.type = 'password'; eyeIcon.classList.replace('fa-eye-slash', 'fa-eye'); eyeIcon.style.color = '#a1a1aa'; }
});

document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault(); 
    const email = document.getElementById('loginEmail').value; 
    const pass = document.getElementById('loginPassword').value;
    const btn = document.getElementById('loginBtn'); 
    const originalContent = btn.innerHTML;
    btn.innerHTML = `<span style="display:flex; align-items:center; gap:8px;"><div class="premium-loader"></div> Authenticating...</span>`;
    try { 
        await signInWithEmailAndPassword(auth, email, pass); 
        e.target.reset(); showToast("Login Successful!"); btn.innerHTML = originalContent; closeLoginOverlayLocal();
        if (isDeepLinkLoad && pendingBookSlug) {
            document.getElementById('mainAppWrapper').style.display = 'block';
            setTimeout(() => { openDownloadPageLocal(pendingBookSlug, true); }, 300);
        }
    } catch(err) { showToast("Failed: Invalid Credentials!"); btn.innerHTML = originalContent; } 
});

document.getElementById('googleSignInBtn').addEventListener('click', async () => { 
    const btn = document.getElementById('googleSignInBtn');
    const originalContent = btn.innerHTML;
    btn.innerHTML = `<span style="display:flex; align-items:center; gap:8px;"><div class="premium-loader"></div> Connecting...</span>`;
    try { 
        await signInWithPopup(auth, provider); 
        showToast("Google Login Successful!"); btn.innerHTML = originalContent; closeLoginOverlayLocal();
        if (isDeepLinkLoad && pendingBookSlug) {
            document.getElementById('mainAppWrapper').style.display = 'block';
            setTimeout(() => { openDownloadPageLocal(pendingBookSlug, true); }, 300);
        }
    } catch(err) { showToast("Failed: Google Sign-In Error."); btn.innerHTML = originalContent; } 
});

// ==========================================
// 🌟 ADVANCED DUAL FILTER SYSTEM (APPROACH B) 🌟
// ==========================================
const EXAM_CATEGORY_MAP = {
    "Ssc": ["SSC", "CGL", "CHSL", "MTS", "CPO", "GD", "STENOGRAPHER", "SELECTION POST"],
    "Railway": ["RAILWAY", "RRB", "NTPC", "GROUP D", "ALP", "TECHNICIAN", "RPF"],
    "Defence": ["NDA", "CDS", "AFCAT", "NAVY", "ARMY", "AIRFORCE", "AGNIVEER"],
    "Banking": ["BANK", "IBPS", "SBI", "PO", "CLERK", "RBI", "LIC"],
    "Teaching": ["CTET", "STET", "UPTET", "KVS", "NVS", "BPSC TRE", "DSSSB"],
    "State psc & upsc": ["UPSC", "BPSC", "UPPSC", "MPPSC", "STATE PSC", "PCS", "CIVIL SERVICES"],
    "Police": ["POLICE", "UP POLICE", "DELHI POLICE", "BIHAR POLICE", "SI", "CONSTABLE", "DAROGA"],
    "Jee": ["JEE", "IIT", "MAINS", "ADVANCED", "BITSAT"],
    "Neet": ["NEET", "MEDICAL", "AIIMS"]
};

let currentSelectedCategory = "All";
let currentSelectedLanguage = "All";

function updateDynamicFilters() {
    const activeCategories = new Set();
    
    booksData.forEach(book => {
        if(!book.exams) return;
        let bookExamsString = book.exams.toUpperCase();
        let matchedMainCategory = false;
        
        for (let mainCategory in EXAM_CATEGORY_MAP) {
            let keywords = EXAM_CATEGORY_MAP[mainCategory];
            if (keywords.some(keyword => bookExamsString.includes(keyword))) {
                activeCategories.add(mainCategory);
                matchedMainCategory = true;
            }
        }
        
        if (!matchedMainCategory) {
            let examsArray = book.exams.split(',');
            examsArray.forEach(exam => {
                let cleanExam = exam.trim();
                if (cleanExam.length > 0) {
                    let formattedExam = cleanExam.charAt(0).toUpperCase() + cleanExam.slice(1).toLowerCase();
                    activeCategories.add(formattedExam);
                }
            });
        }
    });

    const sortedCategories = Array.from(activeCategories).sort();
    const catGrid = document.getElementById('categoryFilterGrid'); 
    
    let html = `<div class="f-pill ${currentSelectedCategory === 'All' ? 'active' : ''}" data-category="All">All</div>`;
    sortedCategories.forEach(category => {
        let isActive = (category === currentSelectedCategory) ? 'active' : '';
        html += `<div class="f-pill ${isActive}" data-category="${sanitizeHTML(category)}">${sanitizeHTML(category)}</div>`;
    });
    catGrid.innerHTML = html;
}

document.getElementById('categoryFilterGrid').addEventListener('click', (e) => {
    if(e.target.classList.contains('f-pill')) {
        document.querySelectorAll('#categoryFilterGrid .f-pill').forEach(el => el.classList.remove('active'));
        e.target.classList.add('active');
        currentSelectedCategory = e.target.getAttribute('data-category');
    }
});

document.getElementById('languageFilterGrid').addEventListener('click', (e) => {
    if(e.target.classList.contains('f-pill')) {
        document.querySelectorAll('#languageFilterGrid .f-pill').forEach(el => el.classList.remove('active'));
        e.target.classList.add('active');
        currentSelectedLanguage = e.target.getAttribute('data-lang');
    }
});

document.getElementById('applyFiltersBtn').addEventListener('click', () => {
    document.getElementById('filterBottomOverlay').classList.remove('active'); 
    applyMasterFilter();
});

function applyMasterFilter() {
    const searchInputRaw = document.getElementById('app-search-input').value.trim();
    const searchStr = searchInputRaw.toLowerCase();
    let normalizedSearch = searchInputRaw.toLowerCase().replace(/[^a-z0-9\s]/g, '');
    let searchTokens = normalizedSearch.split(/\s+/).filter(token => token.length > 0);

    mainFilteredData = booksData.filter(book => {
        let matchesCategory = true;
        if (currentSelectedCategory !== "All") {
            matchesCategory = false; 
            if (book.exams) {
                let bookExamsString = book.exams.toUpperCase();
                let keywordsToCheck = EXAM_CATEGORY_MAP[currentSelectedCategory] || [currentSelectedCategory.toUpperCase()];
                matchesCategory = keywordsToCheck.some(keyword => bookExamsString.includes(keyword));
            }
        }

        let matchesLanguage = true;
        if (currentSelectedLanguage !== "All") {
            let bookLang = (book.lang || "").toLowerCase().trim();
            let selectedLang = currentSelectedLanguage.toLowerCase().trim();
            matchesLanguage = (bookLang === selectedLang); 
        }

        let matchesSearch = true;
        if (searchInputRaw.length > 0) {
            let textToSearch = (book.title + " " + (book.author || "") + " " + (book.exams || "")).toLowerCase().replace(/[^a-z0-9\s]/g, '');
            matchesSearch = false;
            if (searchTokens.length > 0) { 
                matchesSearch = searchTokens.every(token => textToSearch.includes(token)); 
            }
        }
        
        return matchesCategory && matchesLanguage && matchesSearch;
    });
    
    loadedCount = 0; 
    const infiniteLoader = document.getElementById('infinite-loader');
    
    if(mainFilteredData.length > 0) { 
        document.getElementById('no-results-msg').style.display = 'none'; 
        
        // Loader logic reset
        if(infiniteLoader && mainFilteredData.length > getBatchSize()) {
            infiniteLoader.style.display = 'flex';
        } else if(infiniteLoader) {
            infiniteLoader.style.display = 'none';
        }
        
        renderBooksUI(0, getBatchSize(), mainFilteredData); 
    } else { 
        document.getElementById("bookContainer").innerHTML = ""; 
        document.getElementById('no-results-msg').style.display = 'flex'; 
        if(infiniteLoader) infiniteLoader.style.display = 'none';
    }
}

const searchInputEl = document.getElementById('app-search-input');
let searchTimeout;
searchInputEl.addEventListener('input', () => { clearTimeout(searchTimeout); searchTimeout = setTimeout(() => { applyMasterFilter(); }, 300); });
document.getElementById('close-search').addEventListener('click', () => { searchInputEl.value = ''; applyMasterFilter(); document.getElementById('search-box').classList.remove('active'); if (history.state && history.state.popup === 'search') { history.back(); }});
document.getElementById('openAuthorFilterBtn').addEventListener('click', () => { document.getElementById('filterBottomOverlay').classList.add('active'); });
document.getElementById('closeAuthorFilterBtn').addEventListener('click', () => { document.getElementById('filterBottomOverlay').classList.remove('active'); });

// ==========================================
// RENDERING UI & INFINITE SCROLL (NEW)
// ==========================================

// Calculate dynamic batch size based on screen width
function getBatchSize() {
    const screenWidth = window.innerWidth;
    let columns = 2; // Default Mobile
    
    if (screenWidth >= 1200) columns = 5;
    else if (screenWidth >= 900) columns = 4;
    else if (screenWidth >= 600) columns = 3;
    
    return columns * 4; // Load 4 rows at a time
}

// Set up Intersection Observer for Infinite Scrolling
const infiniteLoader = document.getElementById('infinite-loader');
const scrollSentinel = document.getElementById('scroll-sentinel');

const observerOptions = {
    root: document.getElementById('mainContentArea'),
    rootMargin: '0px 0px 200px 0px', // Trigger 200px before reaching the bottom
    threshold: 0.1
};

const infiniteScrollObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        const noResultsMsg = document.getElementById('no-results-msg');
        
        if (entry.isIntersecting && 
            loadedCount < mainFilteredData.length && 
            !isLoadingMore && 
            noResultsMsg.style.display !== 'flex') 
        {
            isLoadingMore = true;
            if(infiniteLoader) infiniteLoader.style.display = 'flex';
            
            // Add a small delay for smoother UX
            setTimeout(() => {
                renderBooksUI(loadedCount, getBatchSize(), mainFilteredData);
                
                if (loadedCount >= mainFilteredData.length && infiniteLoader) {
                    infiniteLoader.style.display = 'none'; // Hide loader if everything is loaded
                }
                isLoadingMore = false;
            }, 500);
        }
    });
}, observerOptions);

if (scrollSentinel) {
    infiniteScrollObserver.observe(scrollSentinel);
}

function renderBooksUI(startIndex, count, customData = null) {
    const container = document.getElementById("bookContainer");
    let dataToRender = customData ? customData : mainFilteredData;
    let endIndex = Math.min(startIndex + count, dataToRender.length);
    if(startIndex === 0) container.innerHTML = "";
    let htmlChunk = "";
    for(let i = startIndex; i < endIndex; i++) {
        let book = dataToRender[i];
        let langClass = book.lang.toLowerCase() === 'hindi' ? 'tag-lang-hindi' : 'tag-lang-english';
        let isSaved = savedBooks.includes(book.slug);
        let bookmarkIcon = isSaved ? 'fas fa-bookmark' : 'far fa-bookmark';
        
        htmlChunk += `<div class="book-card" data-slug="${book.slug}"><div class="card-img-wrapper"><div class="badge-free">FREE</div><div class="bookmark-btn" data-action="bookmark"><i class="${bookmarkIcon}"></i></div><img src="${book.image}" loading="lazy" class="book-image" oncontextmenu="return false;" draggable="false"></div><div class="book-details"><div class="book-title">${sanitizeHTML(book.title)}</div><div class="book-author">${sanitizeHTML(book.author)}</div><div class="tags-container"><span class="book-tag tag-year">${sanitizeHTML(book.year)}</span><span class="book-tag ${langClass}">${sanitizeHTML(book.lang)}</span></div></div></div>`;
    }
    container.insertAdjacentHTML('beforeend', htmlChunk);
    loadedCount = endIndex;
}

document.getElementById('bookContainer').addEventListener('click', (e) => {
    const card = e.target.closest('.book-card');
    if(card) {
        const slug = card.getAttribute('data-slug');
        const bookmarkBtn = e.target.closest('.bookmark-btn');
        if(bookmarkBtn) { toggleBookmarkLocal(bookmarkBtn.querySelector('i'), slug); } 
        else { openDownloadPageLocal(slug); }
    }
});

function toggleBookmarkLocal(iconElement, slug) {
    const index = savedBooks.indexOf(slug);
    if (index === -1) {
        savedBooks.push(slug);
        iconElement.className = "fas fa-bookmark"; 
    } else {
        savedBooks.splice(index, 1);
        iconElement.className = "far fa-bookmark"; 
    }
    localStorage.setItem('spidy_saved_books', JSON.stringify(savedBooks));
    if(document.getElementById('bookmarks-panel').classList.contains('active')) { renderSavedBooksUI(); }
}

function renderSavedBooksUI() {
    const container = document.getElementById("savedBooksContainer");
    const noMsg = document.getElementById("no-saved-msg");
    container.innerHTML = "";
    const savedBooksData = booksData.filter(book => savedBooks.includes(book.slug));
    if (savedBooksData.length === 0) { noMsg.style.display = "flex"; return; }
    noMsg.style.display = "none";
    let htmlChunk = "";
    savedBooksData.forEach(book => {
        let langClass = book.lang.toLowerCase() === 'hindi' ? 'tag-lang-hindi' : 'tag-lang-english';
        htmlChunk += `<div class="book-card" data-slug="${book.slug}"><div class="card-img-wrapper"><div class="badge-free">FREE</div><div class="bookmark-btn" data-action="bookmark"><i class="fas fa-bookmark"></i></div><img src="${book.image}" loading="lazy" class="book-image" oncontextmenu="return false;" draggable="false"></div><div class="book-details"><div class="book-title">${sanitizeHTML(book.title)}</div><div class="book-author">${sanitizeHTML(book.author)}</div><div class="tags-container"><span class="book-tag tag-year">${sanitizeHTML(book.year)}</span><span class="book-tag ${langClass}">${sanitizeHTML(book.lang)}</span></div></div></div>`;
    });
    container.innerHTML = htmlChunk;
}
document.getElementById('savedBooksContainer').addEventListener('click', (e) => {
    const card = e.target.closest('.book-card');
    if(card) {
        const slug = card.getAttribute('data-slug');
        const bookmarkBtn = e.target.closest('.bookmark-btn');
        if(bookmarkBtn) { toggleBookmarkLocal(bookmarkBtn.querySelector('i'), slug); } 
        else { openDownloadPageLocal(slug); }
    }
});

function generateNotifications() {
    const notiContainer = document.getElementById('dynamic-noti-container'); 
    notiContainer.innerHTML = ''; 
    booksData.slice(0, 45).forEach((book) => {
        let dateStr = "00/00/0000";
        if (book.dateAdded) { dateStr = sanitizeHTML(book.dateAdded); } 
        else if (book.createdAt) { const d = new Date(book.createdAt); dateStr = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth()+1).padStart(2, '0')}/${d.getFullYear()}`; }
        notiContainer.innerHTML += `<div class="noti-card-dynamic" data-slug="${book.slug}" style="cursor:pointer;"><img src="${book.image}" loading="lazy" class="noti-card-img" alt="Logo"><div class="noti-card-content"><div class="noti-card-title">${sanitizeHTML(book.title)} Book Added ✅</div><div class="noti-card-desc">New book is now available.</div><div style="font-size: 10px; color: #10b981; margin-top: 2px; font-weight: 700; display: flex; align-items: center; gap: 4px;"><i class="far fa-calendar-alt"></i> Added: ${dateStr}</div></div></div>`;
    });
}
document.getElementById('dynamic-noti-container').addEventListener('click', (e) => {
    const card = e.target.closest('.noti-card-dynamic');
    if(card) openDownloadPageLocal(card.getAttribute('data-slug'));
});

// ==========================================
// NAVIGATION & OVERLAYS
// ==========================================
document.getElementById('sidebarHeader').addEventListener('click', async () => {
    if(!isUserLoggedIn || !auth.currentUser) {
        document.getElementById('sidebar').classList.remove('active'); document.getElementById('sidebar-overlay').classList.remove('active');
        document.getElementById('loginOverlay').style.display = 'flex'; setTimeout(() => document.getElementById('loginOverlay').style.opacity = '1', 10);
        return;
    }
    document.getElementById('sidebar').classList.remove('active'); document.getElementById('sidebar-overlay').classList.remove('active');
    document.getElementById('profile-name-ui').innerText = sanitizeHTML(CURRENT_ADMIN_NAME);
    document.getElementById('profile-email-ui').innerText = auth.currentUser.email || "No Email linked";
    document.getElementById('profile-email-ui').style.display = 'block';
    document.getElementById('profile-avatar-ui').src = CURRENT_ADMIN_PHOTO;
    document.getElementById('profile-saved').innerText = savedBooks.length;
    document.getElementById('my-profile-panel').classList.add('active'); history.pushState({ popup: 'profile' }, '');

    try {
        const userRef = doc(db, "users", auth.currentUser.uid);
        const userSnap = await getDoc(userRef);
        let uploads = 0; let downloads = 0;
        if (userSnap.exists()) {
            const data = userSnap.data();
            uploads = parseInt(data.totalUploads) || 0; downloads = parseInt(data.lifetimeDownloads) || 0;
            updateLiveCredits(uploads, downloads);
        }
        document.getElementById('profile-downloads').innerText = downloads;

        const usersRef = collection(db, "users");
        const querySnapshot = await getDocs(usersRef);
        let allUsers = [];
        querySnapshot.forEach((docSnap) => { allUsers.push({ id: docSnap.id, ...docSnap.data() }); });
        allUsers.sort((a, b) => {
            let uploadsA = parseInt(a.totalUploads) || 0; let uploadsB = parseInt(b.totalUploads) || 0;
            if (uploadsB !== uploadsA) { return uploadsB - uploadsA; } 
            let timeA = parseInt(a.createdAt) || 9999999999999; let timeB = parseInt(b.createdAt) || 9999999999999;
            if (timeA !== timeB) { return timeA - timeB; } return a.id.localeCompare(b.id);
        });

        let rank = 1; for (let i = 0; i < allUsers.length; i++) { if (allUsers[i].id === auth.currentUser.uid) { rank = i + 1; break; } }
        const rankElement = document.getElementById('profile-rank');
        if (rank === 1 && uploads > 0) { rankElement.style.color = "#fbbf24"; rankElement.innerHTML = `<i class="fas fa-crown"></i> #1`; } 
        else if (rank === 2 && uploads > 0) { rankElement.style.color = "#9ca3af"; rankElement.innerText = "#" + rank; } 
        else if (rank === 3 && uploads > 0) { rankElement.style.color = "#b45309"; rankElement.innerText = "#" + rank; } 
        else { rankElement.style.color = ""; rankElement.innerText = "#" + rank; }
    } catch (error) { console.error("Error fetching profile stats:", error); showToast("Error loading profile data"); }
});

document.getElementById('closeProfileBtn').addEventListener('click', () => { if (history.state && history.state.popup === 'profile') { history.back(); } else { document.getElementById('my-profile-panel').classList.remove('active'); }});
document.getElementById('open-search').addEventListener('click', () => { history.pushState({ popup: 'search' }, ''); document.getElementById('search-box').classList.add('active'); setTimeout(() => { searchInputEl.focus(); }, 300); });
document.getElementById('open-noti').addEventListener('click', () => { history.pushState({ popup: 'noti' }, ''); document.getElementById('noti-panel').classList.add('active'); document.querySelector('.blink-dot').style.display = 'none'; });

const sidebar = document.getElementById('sidebar'); const sidebarOverlay = document.getElementById('sidebar-overlay');
document.getElementById('open-menu').addEventListener('click', () => { history.pushState({ popup: 'sidebar' }, ''); sidebar.classList.add('active'); sidebarOverlay.classList.add('active'); });
sidebarOverlay.addEventListener('click', () => { history.back(); });

document.getElementById('menu-dmca').addEventListener('click', (e) => { e.preventDefault(); history.replaceState({ popup: 'dmca' }, ''); document.getElementById('dmca-panel').classList.add('active'); sidebar.classList.remove('active'); sidebarOverlay.classList.remove('active'); });
document.getElementById('close-dmca-btn').addEventListener('click', () => { history.back(); });
document.getElementById('menu-bookmarks').addEventListener('click', (e) => { e.preventDefault(); history.replaceState({ popup: 'bookmarks' }, ''); document.getElementById('bookmarks-panel').classList.add('active'); sidebar.classList.remove('active'); sidebarOverlay.classList.remove('active'); renderSavedBooksUI(); });
document.getElementById('close-bookmarks-btn').addEventListener('click', () => { history.back(); });

function switchTab(tabId) {
    document.querySelectorAll('.app-tab').forEach(tab => { tab.style.display = 'none'; tab.classList.remove('active'); });
    const target = document.getElementById(tabId);
    if(target) { target.style.display = 'flex'; setTimeout(() => target.classList.add('active'), 10); }
}

function setNavActive(id) {
    document.querySelectorAll('.bottom-nav-item').forEach(el => el.classList.remove('active')); document.getElementById(id).classList.add('active');
}

function closeAllPanels() {
    document.getElementById('noti-panel').classList.remove('active'); document.getElementById('sidebar').classList.remove('active'); document.getElementById('sidebar-overlay').classList.remove('active'); document.getElementById('dmca-panel').classList.remove('active'); document.getElementById('bookmarks-panel').classList.remove('active'); document.getElementById('search-box').classList.remove('active'); document.getElementById('my-profile-panel').classList.remove('active'); 
}

document.getElementById('nav-home').addEventListener('click', () => { setNavActive('nav-home'); closeAllPanels(); switchTab('tab-home'); window.history.replaceState({}, '', window.location.pathname); });
document.getElementById('nav-upload').addEventListener('click', () => {
    if(!isUserLoggedIn) { document.getElementById('loginOverlay').style.display = 'flex'; setTimeout(() => document.getElementById('loginOverlay').style.opacity = '1', 10); setNavActive('nav-home'); return; }
    setNavActive('nav-upload'); closeAllPanels(); switchTab('tab-upload'); setTimeout(() => { document.getElementById('uploadPopup').classList.remove('hidden'); }, 300);
});
document.getElementById('nav-dev').addEventListener('click', () => { setNavActive('nav-dev'); closeAllPanels(); switchTab('tab-about'); });
document.getElementById('closeUploadPopupBtn').addEventListener('click', () => { document.getElementById('uploadPopup').classList.add('hidden'); });

window.addEventListener('popstate', (e) => {
    closeAllPanels(); applyMasterFilter();
    const sBook = new URLSearchParams(window.location.search).get('book');
    if(sBook) { openDownloadPageLocal(sBook, true); } else { document.getElementById("downloadModal").style.display = "none"; }
});

// ==========================================
// DOWNLOAD PAGE
// ==========================================
function openDownloadPageLocal(slug, skipPushState = false) {
    if(!isUserLoggedIn) {
        document.getElementById('loginOverlay').style.display = 'flex'; setTimeout(() => document.getElementById('loginOverlay').style.opacity = '1', 10); return;
    }
    const book = booksData.find(b => b.slug === slug); if(!book) return;
    document.getElementById("downloadModal").style.display = "flex";
    
    const previewImg = document.getElementById("dlPreviewImage");
    previewImg.classList.add("image-loading-skeleton"); previewImg.src = book.image; 
    previewImg.onload = () => { previewImg.classList.remove("image-loading-skeleton"); };

    document.getElementById("dlBookTitle").innerText = sanitizeHTML(book.title); 
    document.getElementById("dlBookAuthor").innerText = sanitizeHTML(book.author);
    
    document.getElementById("dlPdfLinkBtn").onclick = async function() { 
        if(!isUserLoggedIn || !auth.currentUser) { document.getElementById('loginOverlay').style.display = 'flex'; setTimeout(() => document.getElementById('loginOverlay').style.opacity = '1', 10); return; }
        const btn = document.getElementById("dlPdfLinkBtn"); const originalText = btn.innerHTML; const uid = auth.currentUser.uid;
        btn.innerHTML = `<span style="display:flex; align-items:center; gap:8px;"><i class="fas fa-spinner fa-spin"></i> Processing...</span>`; btn.disabled = true;

        try {
            const userRef = doc(db, "users", uid);
            const userSnap = await getDoc(userRef);

            if (userSnap.exists()) {
                let data = userSnap.data(); let uploads = data.totalUploads || 0; let downloads = data.lifetimeDownloads || 0;
                let allowedDownloads = 2 + (uploads * 2);
                if (downloads >= allowedDownloads && !IS_SUPER_ADMIN) {
                    showToast("Limit Reached! Upload 1 book to get 2 more downloads."); closeDownloadPageLocal(); document.getElementById('nav-upload').click(); btn.innerHTML = originalText; btn.disabled = false; return; 
                }
                await updateDoc(userRef, { lifetimeDownloads: increment(1) });
                updateLiveCredits(uploads, downloads + 1);
            }
            if(book.pdfLink) { window.open(book.pdfLink, '_blank'); }
        } catch (error) { showToast("Failed to initiate download. Try again."); } finally { btn.innerHTML = originalText; btn.disabled = false; }
    };
    
    document.getElementById("dlYoutubeLinkBtn").onclick = function() { window.open('https://youtube.com/@madxprince', '_blank'); };
    let examsArray = (book.exams || "General").split(',').map(item => sanitizeHTML(item.trim()));
    document.getElementById("dlModalTags").innerHTML = examsArray.map(exam => `<div class="dl-modal-tag">${exam}</div>`).join('');
    activeBookSlug = book.slug; activeBookTitle = book.title;
    if (!skipPushState) { history.pushState({ popup: 'book' }, '', '?book=' + book.slug); }
}

document.getElementById('closeDlBtn').addEventListener('click', closeDownloadPageLocal);
function closeDownloadPageLocal() {
    if (history.state && history.state.popup === 'book') { history.back(); } 
    else { document.getElementById("downloadModal").style.display = "none"; window.history.replaceState({}, '', window.location.pathname); }
    if(isDeepLinkLoad) {
        isDeepLinkLoad = false; const loader = document.getElementById("loaderScreen"); loader.style.display = "flex"; loader.style.opacity = "1"; updateLoaderUI(100);
        setTimeout(() => { loader.style.opacity = "0"; setTimeout(() => { loader.style.display = "none"; document.getElementById("popupOverlay").style.display = "flex"; }, 300); }, 1500); 
    }
}
document.getElementById('shareBookBtn').addEventListener('click', () => {
    const shareUrl = window.location.origin + window.location.pathname + "?book=" + activeBookSlug;
    if (navigator.share) navigator.share({ title: activeBookTitle, text: "Download free book", url: shareUrl }); else { navigator.clipboard.writeText(shareUrl); alert("Link Copied!"); }
});

// ==========================================
// 🚀 DIRECT CLOUDFLARE R2 UPLOAD LOGIC
// ==========================================

['fileCoverGallery', 'fileCoverBrowse'].forEach(id => {
    document.getElementById(id).addEventListener('change', function(e) {
        if(e.target.files.length > 0) {
            selectedCoverFile = e.target.files[0];
            e.target.closest('.uc-actions').querySelector('p').innerText = "Selected: " + selectedCoverFile.name;
        }
    });
});

['filePdfGallery', 'filePdfBrowse'].forEach(id => {
    document.getElementById(id).addEventListener('change', function(e) {
        if(e.target.files.length > 0) {
            selectedPdfFile = e.target.files[0];
            e.target.closest('.uc-actions').querySelector('p').innerText = "Selected: " + selectedPdfFile.name;
        }
    });
});

function uploadFileToR2(file, type) {
    return new Promise((resolve, reject) => {
        
        const r2Overlay = document.getElementById('r2UploadOverlay');
        const progressBar = document.getElementById('r2ProgressBar');
        const progressText = document.getElementById('r2ProgressText');
        const statusText = document.getElementById('r2StatusText');
        const icon = document.getElementById('r2UploadIcon');
        const title = document.getElementById('r2UploadTitle');

        if(type === 'image') {
            icon.className = "fas fa-image"; title.innerText = "Upload Cover Image"; statusText.innerText = "Uploading Cover Image...";
        } else {
            icon.className = "fas fa-file-pdf"; title.innerText = "Upload PDF File"; statusText.innerText = "Securely transferring to Cloudflare R2...";
        }

        r2Overlay.style.display = 'flex';
        progressBar.style.width = '0%';
        progressText.innerText = '0%';

        const xhr = new XMLHttpRequest();
        xhr.open("POST", R2_UPLOAD_API_URL, true);
        xhr.setRequestHeader("Authorization", "Bearer " + R2_API_TOKEN); 
        
        const formData = new FormData();
        formData.append("file", file);
        formData.append("type", type);

        xhr.upload.addEventListener("progress", (event) => {
            if (event.lengthComputable) {
                let percentComplete = Math.round((event.loaded / event.total) * 100);
                progressBar.style.width = percentComplete + '%';
                progressText.innerText = percentComplete + '%';
            }
        });

        xhr.onload = function() {
            if (xhr.status >= 200 && xhr.status < 300) {
                try {
                    const response = JSON.parse(xhr.responseText);
                    setTimeout(() => { r2Overlay.style.display = 'none'; }, 500);
                    resolve(response.url); 
                } catch(e) {
                    r2Overlay.style.display = 'none'; reject("Invalid Response from Server");
                }
            } else {
                r2Overlay.style.display = 'none'; reject("Upload Failed: " + xhr.status);
            }
        };

        xhr.onerror = function() {
            r2Overlay.style.display = 'none'; reject("Network Error during upload.");
        };

        xhr.send(formData);
    });
}

// ==========================================
// FINAL BOOK PUBLISHING SUBMIT
// ==========================================
document.getElementById('addBookForm').addEventListener('submit', async (e) => {
    e.preventDefault(); 
    const btn = document.getElementById('publishBtn'); 
    const originalText = btn.innerHTML;

    if (!selectedCoverFile) { showToast("Please select a Cover Image!"); return; }
    if (!selectedPdfFile) { showToast("Please select a PDF file!"); return; }

    btn.innerHTML = `<span class="btn-text" style="display: flex; align-items: center; justify-content: center; gap: 10px;"><div class="premium-loader" style="border-color:#000;"></div> Publishing...</span>`;
    btn.disabled = true;

    try {
        let coverR2Url = await uploadFileToR2(selectedCoverFile, 'image');
        let pdfR2Url = await uploadFileToR2(selectedPdfFile, 'pdf');

        const titleInput = document.getElementById('inTitle').value; 
        const newBook = { 
            title: titleInput, 
            author: document.getElementById('inAuthor').value, 
            year: document.getElementById('inYear').value, 
            lang: document.getElementById('inLang').value, 
            exams: document.getElementById('inExams').value, 
            image: coverR2Url, 
            pdfLink: pdfR2Url, 
            dateAdded: new Date().toLocaleDateString('en-GB').toUpperCase(), 
            createdAt: new Date().getTime(), 
            uploaderUid: auth.currentUser.uid 
        };

        await addDoc(collection(db, "books"), newBook); 
        
        const userRef = doc(db, "users", auth.currentUser.uid);
        await updateDoc(userRef, { totalUploads: increment(1) });
        const userSnap = await getDoc(userRef);
        if(userSnap.exists()){
            let data = userSnap.data();
            updateLiveCredits(data.totalUploads, data.lifetimeDownloads || 0);
        }

        showToast("Book Published Successfully!"); 
        e.target.reset(); 
        selectedCoverFile = null; selectedPdfFile = null;
        document.querySelectorAll('.uc-actions p').forEach(p => p.innerText = "Drag & Drop File");

    } catch (error) { 
        console.error("Upload process error:", error);
        if(error.message && error.message.includes("Missing or insufficient permissions")) { showToast("Failed: Firebase Security Rules Blocked Save!"); } 
        else { showToast("Failed: " + error); }
    } finally { 
        btn.innerHTML = originalText; btn.disabled = false; 
    }
});

// Admin Tabs Switching
document.querySelectorAll('.adm-tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
        let tab = 'add'; if(btn.id === 'admTabPrompt') tab = 'prompt'; switchAdminTabLocal(tab);
    });
});
function switchAdminTabLocal(tabName) {
    document.querySelectorAll('.adm-section').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.adm-tab-btn').forEach(el => el.classList.remove('active'));
    if(tabName === 'add') { document.getElementById('sectionAddBook').classList.add('active'); document.getElementById('admTabAdd').classList.add('active'); }
    else if(tabName === 'prompt') { document.getElementById('sectionPrompt').classList.add('active'); document.getElementById('admTabPrompt').classList.add('active'); }
}
