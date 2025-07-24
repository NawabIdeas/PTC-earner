// User panel functionality

let currentUser = null;
let currentUserData = null;

// Check authentication and redirect if not logged in
auth.onAuthStateChanged(async (user) => {
    if (!user) {
        window.location.href = 'index.html';
        return;
    }
    
    currentUser = user;
    currentUserData = await getCurrentUserData();
    
    if (!currentUserData) {
        showAlert('Unable to load user data. Please try logging in again.', 'error');
        return;
    }
    
    // Check if user is blocked
    if (currentUserData.blocked) {
        showAlert('Your account has been blocked. Please contact support.', 'error');
        auth.signOut();
        return;
    }
    
    // Redirect admin to admin panel
    if (currentUserData.role === 'admin') {
        window.location.href = 'admin.html';
        return;
    }
    
    initializeApp();
});

// Initialize app
async function initializeApp() {
    setupEventListeners();
    loadUserData();
    loadBalance();
    loadAds();
    loadWithdrawals();
    loadReferralData();
    setupRealTimeListeners();
}

// Setup event listeners
function setupEventListeners() {
    // Menu functionality
    document.getElementById('menuBtn').addEventListener('click', openMenu);
    document.getElementById('closeMenuBtn').addEventListener('click', closeMenu);
    document.getElementById('menuOverlay').addEventListener('click', closeMenu);
    
    // Profile functionality
    document.getElementById('profileBtn').addEventListener('click', openProfile);
    document.getElementById('profileForm').addEventListener('submit', updateProfile);
    
    // Withdraw functionality
    document.getElementById('withdrawBtn').addEventListener('click', () => showPage('withdraw'));
    document.getElementById('withdrawFormElement').addEventListener('submit', submitWithdrawal);
    
    // Daily check-in
    document.getElementById('checkinBtn').addEventListener('click', dailyCheckin);
    
    // Chat functionality
    document.getElementById('chatForm').addEventListener('submit', sendMessage);
}

// Page navigation
function showPage(pageId) {
    // Hide all pages
    const pages = ['dashboard', 'earnPage', 'withdrawPage', 'statusPage', 'referralPage', 'contactPage'];
    pages.forEach(page => {
        const element = document.getElementById(page);
        if (element) element.classList.add('hidden');
    });
    
    // Show selected page
    const targetPage = document.getElementById(pageId === 'earn' ? 'earnPage' : 
                                          pageId === 'withdraw' ? 'withdrawPage' :
                                          pageId === 'status' ? 'statusPage' :
                                          pageId === 'referral' ? 'referralPage' :
                                          pageId === 'contact' ? 'contactPage' :
                                          'dashboard');
    if (targetPage) {
        targetPage.classList.remove('hidden');
    }
    
    // Load page-specific data
    if (pageId === 'earn') loadAds();
    if (pageId === 'status') loadWithdrawals();
    if (pageId === 'referral') loadReferralData();
    if (pageId === 'contact') loadChat();
    
    closeMenu();
}

// Load user data
function loadUserData() {
    if (currentUserData) {
        document.getElementById('profileName').value = currentUserData.username || '';
        document.getElementById('profileEmail').value = currentUserData.email || '';
    }
}

// Load balance
function loadBalance() {
    if (currentUserData) {
        document.getElementById('currentBalance').textContent = `$${formatCurrency(currentUserData.balance)}`;
    }
}

// Setup real-time listeners
function setupRealTimeListeners() {
    // Listen for balance changes
    database.ref(`users/${currentUser.uid}/balance`).on('value', (snapshot) => {
        const balance = snapshot.val() || 0;
        document.getElementById('currentBalance').textContent = `$${formatCurrency(balance)}`;
    });
}

// Menu functions
function openMenu() {
    document.getElementById('sideMenu').classList.remove('-translate-x-full');
    document.getElementById('menuOverlay').classList.remove('hidden');
}

function closeMenu() {
    document.getElementById('sideMenu').classList.add('-translate-x-full');
    document.getElementById('menuOverlay').classList.add('hidden');
}

// Profile functions
function openProfile() {
    document.getElementById('profileModal').classList.remove('hidden');
}

function closeProfile() {
    document.getElementById('profileModal').classList.add('hidden');
}

async function updateProfile(e) {
    e.preventDefault();
    
    const name = document.getElementById('profileName').value;
    const email = document.getElementById('profileEmail').value;
    const password = document.getElementById('profilePassword').value;
    
    if (!name || !email) {
        showAlert('Please fill in all required fields', 'error');
        return;
    }
    
    showLoading();
    
    try {
        const updates = { username: name };
        
        // Update email if changed
        if (email !== currentUser.email) {
            await currentUser.updateEmail(email);
            updates.email = email;
        }
        
        // Update password if provided
        if (password) {
            await currentUser.updatePassword(password);
        }
        
        // Update database
        await database.ref(`users/${currentUser.uid}`).update(updates);
        
        currentUserData = { ...currentUserData, ...updates };
        
        hideLoading();
        showAlert('Profile updated successfully!', 'success');
        closeProfile();
        
        // Clear password field
        document.getElementById('profilePassword').value = '';
        
    } catch (error) {
        hideLoading();
        let errorMessage = 'Failed to update profile';
        
        if (error.code === 'auth/requires-recent-login') {
            errorMessage = 'Please log in again to update your profile';
        } else if (error.code === 'auth/email-already-in-use') {
            errorMessage = 'This email is already in use';
        }
        
        showAlert(errorMessage, 'error');
    }
}

// Daily check-in functionality
async function dailyCheckin() {
    showLoading();
    
    try {
        const today = new Date().toDateString();
        const checkinRef = database.ref(`checkins/${currentUser.uid}/${today}`);
        const snapshot = await checkinRef.once('value');
        
        if (snapshot.exists()) {
            hideLoading();
            showAlert('You have already checked in today. Come back tomorrow!', 'warning');
            return;
        }
        
        // Get current day of the week (1-7)
        const dayOfWeek = new Date().getDay() || 7; // Sunday = 7, Monday = 1, etc.
        
        // Get reward for current day
        const settingsSnapshot = await database.ref(`settings/daily_rewards/day${dayOfWeek}`).once('value');
        const reward = settingsSnapshot.val() || 0.005;
        
        // Add reward to balance
        await updateUserBalance(currentUser.uid, reward, 'add');
        
        // Record check-in
        await checkinRef.set({
            timestamp: firebase.database.ServerValue.TIMESTAMP,
            reward: reward
        });
        
        hideLoading();
        showAlert(`Daily check-in successful! You earned $${formatCurrency(reward)}`, 'success');
        updateCheckinStatus();
        
    } catch (error) {
        hideLoading();
        showAlert('Check-in failed. Please try again.', 'error');
        console.error('Check-in error:', error);
    }
}

// Update check-in status
async function updateCheckinStatus() {
    try {
        const today = new Date().toDateString();
        const snapshot = await database.ref(`checkins/${currentUser.uid}/${today}`).once('value');
        const statusEl = document.getElementById('checkinStatus');
        const btnEl = document.getElementById('checkinBtn');
        
        if (snapshot.exists()) {
            statusEl.textContent = '✅ Already checked in today!';
            statusEl.className = 'mt-3 text-sm text-center text-green-600';
            btnEl.disabled = true;
            btnEl.classList.add('opacity-50');
        } else {
            statusEl.textContent = 'Available for check-in';
            statusEl.className = 'mt-3 text-sm text-center text-blue-600';
            btnEl.disabled = false;
            btnEl.classList.remove('opacity-50');
        }
    } catch (error) {
        console.error('Error updating check-in status:', error);
    }
}

// Load and display ads
async function loadAds() {
    try {
        const snapshot = await database.ref('ads').once('value');
        const ads = snapshot.val() || {};
        const adsList = document.getElementById('adsList');
        
        if (Object.keys(ads).length === 0) {
            adsList.innerHTML = '<div class="text-center text-gray-500 py-8">No ads available at the moment</div>';
            return;
        }
        
        // Check which ads user has watched today
        const today = new Date().toDateString();
        const watchedSnapshot = await database.ref(`adWatches/${currentUser.uid}/${today}`).once('value');
        const watchedAds = watchedSnapshot.val() || {};
        
        adsList.innerHTML = '';
        
        Object.entries(ads).forEach(([adId, ad]) => {
            const isWatched = watchedAds[adId];
            const adElement = document.createElement('div');
            adElement.className = `bg-white rounded-xl p-6 shadow-lg ${isWatched ? 'opacity-50' : 'hover:shadow-xl transform hover:scale-105 transition-all cursor-pointer'}`;
            
            adElement.innerHTML = `
                <div class="flex justify-between items-center">
                    <div>
                        <h3 class="text-lg font-semibold text-gray-800">${ad.title}</h3>
                        <p class="text-green-600 font-bold">Reward: $${formatCurrency(ad.reward)}</p>
                    </div>
                    <div class="text-right">
                        ${isWatched ? 
                            '<span class="text-gray-500 text-sm">✅ Watched</span>' : 
                            '<button class="bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600 font-semibold">Watch Ad</button>'
                        }
                    </div>
                </div>
            `;
            
            if (!isWatched) {
                adElement.addEventListener('click', () => watchAd(adId, ad));
            }
            
            adsList.appendChild(adElement);
        });
        
    } catch (error) {
        console.error('Error loading ads:', error);
        document.getElementById('adsList').innerHTML = '<div class="text-center text-red-500 py-8">Error loading ads</div>';
    }
}

// Watch ad functionality
function watchAd(adId, ad) {
    const adViewer = document.getElementById('adViewer');
    const adFrame = document.getElementById('adFrame');
    const closeBtn = document.getElementById('closeAdBtn');
    
    // Show ad viewer
    adViewer.classList.remove('hidden');
    adFrame.src = ad.url;
    
    // Hide close button initially
    closeBtn.classList.add('hidden');
    
    // Show close button after 15 seconds
    setTimeout(() => {
        closeBtn.classList.remove('hidden');
        closeBtn.onclick = () => closeAd(adId, ad);
    }, 15000);
}

// Close ad and credit reward
async function closeAd(adId, ad) {
    const adViewer = document.getElementById('adViewer');
    const adFrame = document.getElementById('adFrame');
    
    // Hide ad viewer
    adViewer.classList.add('hidden');
    adFrame.src = '';
    
    showLoading();
    
    try {
        // Credit reward
        await updateUserBalance(currentUser.uid, ad.reward, 'add');
        
        // Mark ad as watched for today
        const today = new Date().toDateString();
        await database.ref(`adWatches/${currentUser.uid}/${today}/${adId}`).set({
            timestamp: firebase.database.ServerValue.TIMESTAMP,
            reward: ad.reward
        });
        
        hideLoading();
        showAlert(`Great! You earned $${formatCurrency(ad.reward)}`, 'success');
        
        // Reload ads to update UI
        loadAds();
        
    } catch (error) {
        hideLoading();
        showAlert('Failed to credit reward. Please try again.', 'error');
        console.error('Error crediting ad reward:', error);
    }
}

// Withdrawal functions
function selectWithdrawMethod(method) {
    const form = document.getElementById('withdrawForm');
    const methodSelect = document.getElementById('methodSelect');
    
    form.classList.remove('hidden');
    
    if (method === 'local') {
        methodSelect.innerHTML = `
            <label class="block text-sm font-medium text-gray-700 mb-2">Payment Method</label>
            <select id="paymentMethod" required class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                <option value="">Select Method</option>
                <option value="jazzcash">JazzCash</option>
                <option value="easypaisa">EasyPaisa</option>
                <option value="nayapay">NayaPay</option>
                <option value="sadapay">SadaPay</option>
            </select>
        `;
    } else {
        methodSelect.innerHTML = `
            <label class="block text-sm font-medium text-gray-700 mb-2">Cryptocurrency</label>
            <select id="paymentMethod" required class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500">
                <option value="">Select Cryptocurrency</option>
                <option value="usdt-trc20">USDT TRC20</option>
                <option value="bitcoin">Bitcoin</option>
                <option value="litecoin">Litecoin</option>
                <option value="solana">Solana</option>
            </select>
        `;
    }
}

async function submitWithdrawal(e) {
    e.preventDefault();
    
    const paymentMethod = document.getElementById('paymentMethod').value;
    const accountName = document.getElementById('accountName').value;
    const accountNumber = document.getElementById('accountNumber').value;
    const amount = parseFloat(document.getElementById('withdrawAmount').value);
    
    if (!paymentMethod || !accountName || !accountNumber || !amount) {
        showAlert('Please fill in all fields', 'error');
        return;
    }
    
    if (amount < 5) {
        showAlert('Minimum withdrawal amount is $5.00', 'error');
        return;
    }
    
    if (amount > (currentUserData.balance || 0)) {
        showAlert('Insufficient balance', 'error');
        return;
    }
    
    showLoading();
    
    try {
        // Deduct amount from balance
        await updateUserBalance(currentUser.uid, amount, 'subtract');
        
        // Create withdrawal request
        const withdrawalData = {
            userId: currentUser.uid,
            userEmail: currentUserData.email,
            username: currentUserData.username,
            paymentMethod: paymentMethod,
            accountName: accountName,
            accountNumber: accountNumber,
            amount: amount,
            status: 'pending',
            timestamp: firebase.database.ServerValue.TIMESTAMP
        };
        
        await database.ref('withdrawals').push(withdrawalData);
        
        hideLoading();
        showAlert('Withdrawal request submitted successfully!', 'success');
        
        // Reset form
        document.getElementById('withdrawFormElement').reset();
        document.getElementById('withdrawForm').classList.add('hidden');
        
        // Go back to dashboard
        showPage('dashboard');
        
    } catch (error) {
        hideLoading();
        showAlert('Failed to submit withdrawal request. Please try again.', 'error');
        console.error('Withdrawal error:', error);
    }
}

// Load withdrawals for status page
async function loadWithdrawals() {
    try {
        const snapshot = await database.ref('withdrawals').orderByChild('userId').equalTo(currentUser.uid).once('value');
        const withdrawals = snapshot.val() || {};
        const withdrawalsList = document.getElementById('withdrawalsList');
        
        if (Object.keys(withdrawals).length === 0) {
            withdrawalsList.innerHTML = '<div class="text-center text-gray-500 py-8">No withdrawal requests found</div>';
            return;
        }
        
        withdrawalsList.innerHTML = '';
        
        Object.entries(withdrawals).reverse().forEach(([id, withdrawal]) => {
            const statusColors = {
                pending: 'bg-yellow-100 text-yellow-800',
                approved: 'bg-green-100 text-green-800',
                rejected: 'bg-red-100 text-red-800'
            };
            
            const withdrawalElement = document.createElement('div');
            withdrawalElement.className = 'bg-white rounded-xl p-6 shadow-lg';
            withdrawalElement.innerHTML = `
                <div class="flex justify-between items-start mb-4">
                    <div>
                        <h3 class="text-lg font-semibold text-gray-800">${withdrawal.paymentMethod.toUpperCase()}</h3>
                        <p class="text-gray-600">${withdrawal.accountName}</p>
                        <p class="text-sm text-gray-500">${withdrawal.accountNumber}</p>
                    </div>
                    <div class="text-right">
                        <p class="text-xl font-bold text-blue-600">$${formatCurrency(withdrawal.amount)}</p>
                        <span class="inline-block px-3 py-1 rounded-full text-sm font-medium ${statusColors[withdrawal.status] || statusColors.pending}">
                            ${withdrawal.status.toUpperCase()}
                        </span>
                    </div>
                </div>
                <div class="text-sm text-gray-500">
                    ${new Date(withdrawal.timestamp).toLocaleString()}
                </div>
            `;
            
            withdrawalsList.appendChild(withdrawalElement);
        });
        
    } catch (error) {
        console.error('Error loading withdrawals:', error);
        document.getElementById('withdrawalsList').innerHTML = '<div class="text-center text-red-500 py-8">Error loading withdrawals</div>';
    }
}

// Referral functions
async function loadReferralData() {
    try {
        // Get user's referral data
        const userSnapshot = await database.ref(`users/${currentUser.uid}`).once('value');
        const userData = userSnapshot.val();
        
        // Get settings for base URL
        const settingsSnapshot = await database.ref('settings').once('value');
        const settings = settingsSnapshot.val() || {};
        
        // Update referral link
        const baseUrl = settings.base_url || 'https://yourapp.com';
        const referralLink = `${baseUrl}/?ref=${currentUser.uid}`;
        document.getElementById('referralLink').value = referralLink;
        
        // Update stats
        document.getElementById('referralCount').textContent = userData.referralCount || 0;
        document.getElementById('referralEarnings').textContent = `$${formatCurrency(userData.referralEarnings)}`;
        
    } catch (error) {
        console.error('Error loading referral data:', error);
    }
}

function copyReferralLink() {
    const linkInput = document.getElementById('referralLink');
    linkInput.select();
    linkInput.setSelectionRange(0, 99999); // For mobile devices
    
    try {
        document.execCommand('copy');
        showAlert('Referral link copied to clipboard!', 'success');
    } catch (error) {
        showAlert('Failed to copy link. Please copy manually.', 'error');
    }
}

// Chat functions
async function loadChat() {
    try {
        const snapshot = await database.ref(`chats/${currentUser.uid}`).orderByChild('timestamp').once('value');
        const messages = snapshot.val() || {};
        const chatMessages = document.getElementById('chatMessages');
        
        chatMessages.innerHTML = '';
        
        Object.values(messages).forEach(message => {
            const messageElement = document.createElement('div');
            messageElement.className = `p-3 rounded-lg max-w-xs ${
                message.sender === currentUser.uid 
                    ? 'bg-blue-500 text-white ml-auto' 
                    : 'bg-gray-200 text-gray-800'
            }`;
            messageElement.innerHTML = `
                <p class="text-sm">${message.text}</p>
                <p class="text-xs opacity-75 mt-1">${new Date(message.timestamp).toLocaleTimeString()}</p>
            `;
            chatMessages.appendChild(messageElement);
        });
        
        // Scroll to bottom
        chatMessages.scrollTop = chatMessages.scrollHeight;
        
        // Setup real-time listener for new messages
        database.ref(`chats/${currentUser.uid}`).on('child_added', (snapshot) => {
            const message = snapshot.val();
            if (message.sender !== currentUser.uid) {
                loadChat(); // Reload chat to show new admin message
            }
        });
        
    } catch (error) {
        console.error('Error loading chat:', error);
    }
}

async function sendMessage(e) {
    e.preventDefault();
    
    const messageInput = document.getElementById('messageInput');
    const messageText = messageInput.value.trim();
    
    if (!messageText) return;
    
    try {
        await database.ref(`chats/${currentUser.uid}`).push({
            sender: currentUser.uid,
            senderName: currentUserData.username,
            text: messageText,
            timestamp: firebase.database.ServerValue.TIMESTAMP
        });
        
        messageInput.value = '';
        loadChat();
        
    } catch (error) {
        console.error('Error sending message:', error);
        showAlert('Failed to send message. Please try again.', 'error');
    }
}

// Logout function
function logout() {
    auth.signOut().then(() => {
        window.location.href = 'index.html';
    }).catch((error) => {
        console.error('Logout error:', error);
        showAlert('Failed to logout. Please try again.', 'error');
    });
}

// Initialize check-in status on load
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(updateCheckinStatus, 1000);
});