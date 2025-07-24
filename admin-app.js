// Admin panel functionality

let currentUser = null;
let currentUserData = null;
let selectedUserId = null;
let selectedChatUserId = null;

// Check authentication and redirect if not admin
auth.onAuthStateChanged(async (user) => {
    if (!user) {
        window.location.href = 'index.html';
        return;
    }
    
    currentUser = user;
    currentUserData = await getCurrentUserData();
    
    if (!currentUserData || currentUserData.role !== 'admin') {
        showAlert('Access denied. Admin privileges required.', 'error');
        auth.signOut();
        return;
    }
    
    initializeAdminApp();
});

// Initialize admin app
async function initializeAdminApp() {
    setupEventListeners();
    loadDashboardStats();
    setupRealTimeListeners();
}

// Setup event listeners
function setupEventListeners() {
    // Menu functionality
    document.getElementById('menuBtn').addEventListener('click', openMenu);
    document.getElementById('closeMenuBtn').addEventListener('click', closeMenu);
    document.getElementById('menuOverlay').addEventListener('click', closeMenu);
    
    // Forms
    document.getElementById('userEditForm').addEventListener('submit', saveUserChanges);
    document.getElementById('addAdForm').addEventListener('submit', addNewAd);
    document.getElementById('checkinSettingsForm').addEventListener('submit', saveCheckinSettings);
    document.getElementById('referralSettingsForm').addEventListener('submit', saveReferralSettings);
    document.getElementById('adminChatForm').addEventListener('submit', sendAdminMessage);
}

// Page navigation
function showPage(pageId) {
    // Hide all pages
    const pages = ['dashboard', 'usersPage', 'withdrawalsPage', 'adsPage', 'chatPage', 'checkinPage', 'settingsPage'];
    pages.forEach(page => {
        const element = document.getElementById(page);
        if (element) element.classList.add('hidden');
    });
    
    // Show selected page
    const targetPage = document.getElementById(pageId === 'users' ? 'usersPage' :
                                          pageId === 'withdrawals' ? 'withdrawalsPage' :
                                          pageId === 'ads' ? 'adsPage' :
                                          pageId === 'chat' ? 'chatPage' :
                                          pageId === 'checkin' ? 'checkinPage' :
                                          pageId === 'settings' ? 'settingsPage' :
                                          'dashboard');
    if (targetPage) {
        targetPage.classList.remove('hidden');
    }
    
    // Load page-specific data
    if (pageId === 'users') loadUsers();
    if (pageId === 'withdrawals') loadWithdrawals();
    if (pageId === 'ads') loadAds();
    if (pageId === 'chat') loadChatUsers();
    if (pageId === 'checkin') loadCheckinSettings();
    if (pageId === 'settings') loadSettings();
    
    closeMenu();
}

// Load dashboard statistics
async function loadDashboardStats() {
    try {
        // Load total users
        const usersSnapshot = await database.ref('users').once('value');
        const users = usersSnapshot.val() || {};
        const totalUsers = Object.keys(users).length;
        document.getElementById('totalUsers').textContent = totalUsers;
        
        // Load pending withdrawals
        const withdrawalsSnapshot = await database.ref('withdrawals').orderByChild('status').equalTo('pending').once('value');
        const pendingWithdrawals = withdrawalsSnapshot.val() || {};
        document.getElementById('pendingWithdrawals').textContent = Object.keys(pendingWithdrawals).length;
        
        // Load total ads
        const adsSnapshot = await database.ref('ads').once('value');
        const ads = adsSnapshot.val() || {};
        document.getElementById('totalAds').textContent = Object.keys(ads).length;
        
        // Load unread messages (simplified - count all messages)
        // In a real implementation, you'd track read status
        document.getElementById('unreadMessages').textContent = '0';
        
    } catch (error) {
        console.error('Error loading dashboard stats:', error);
    }
}

// Setup real-time listeners
function setupRealTimeListeners() {
    // Listen for new users
    database.ref('users').on('child_added', () => {
        loadDashboardStats();
    });
    
    // Listen for new withdrawal requests
    database.ref('withdrawals').on('child_added', () => {
        loadDashboardStats();
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

// Users management
async function loadUsers() {
    try {
        const snapshot = await database.ref('users').once('value');
        const users = snapshot.val() || {};
        const usersList = document.getElementById('usersList');
        const usersCount = document.getElementById('usersCount');
        
        usersCount.textContent = Object.keys(users).length;
        usersList.innerHTML = '';
        
        Object.entries(users).forEach(([userId, user]) => {
            if (user.role === 'admin') return; // Skip admin users
            
            const userElement = document.createElement('div');
            userElement.className = 'bg-white rounded-xl p-4 shadow-lg flex justify-between items-center hover:shadow-xl transition-all cursor-pointer';
            userElement.innerHTML = `
                <div>
                    <h3 class="font-semibold text-gray-800">${user.username || 'Unknown'}</h3>
                    <p class="text-sm text-gray-600">${user.email}</p>
                    <p class="text-sm text-green-600">Balance: $${formatCurrency(user.balance)}</p>
                    ${user.blocked ? '<span class="text-xs bg-red-100 text-red-800 px-2 py-1 rounded-full">Blocked</span>' : ''}
                </div>
                <div class="flex space-x-2">
                    <button onclick="editUser('${userId}')" class="bg-blue-500 text-white px-3 py-1 rounded text-sm hover:bg-blue-600">
                        Edit
                    </button>
                </div>
            `;
            
            usersList.appendChild(userElement);
        });
        
    } catch (error) {
        console.error('Error loading users:', error);
        document.getElementById('usersList').innerHTML = '<div class="text-center text-red-500 py-8">Error loading users</div>';
    }
}

async function editUser(userId) {
    try {
        const snapshot = await database.ref(`users/${userId}`).once('value');
        const user = snapshot.val();
        
        if (!user) {
            showAlert('User not found', 'error');
            return;
        }
        
        selectedUserId = userId;
        document.getElementById('editUserId').value = userId;
        document.getElementById('editUserBalance').value = formatCurrency(user.balance);
        
        document.getElementById('userEditModal').classList.remove('hidden');
        
    } catch (error) {
        console.error('Error loading user data:', error);
        showAlert('Failed to load user data', 'error');
    }
}

function closeUserEditModal() {
    document.getElementById('userEditModal').classList.add('hidden');
    selectedUserId = null;
}

async function saveUserChanges(e) {
    e.preventDefault();
    
    if (!selectedUserId) return;
    
    const balance = parseFloat(document.getElementById('editUserBalance').value);
    
    showLoading();
    
    try {
        await database.ref(`users/${selectedUserId}`).update({
            balance: balance
        });
        
        hideLoading();
        showAlert('User updated successfully!', 'success');
        closeUserEditModal();
        loadUsers();
        
    } catch (error) {
        hideLoading();
        showAlert('Failed to update user', 'error');
        console.error('Error updating user:', error);
    }
}

async function blockUser() {
    if (!selectedUserId) return;
    
    showLoading();
    
    try {
        await database.ref(`users/${selectedUserId}`).update({
            blocked: true
        });
        
        hideLoading();
        showAlert('User blocked successfully!', 'success');
        closeUserEditModal();
        loadUsers();
        
    } catch (error) {
        hideLoading();
        showAlert('Failed to block user', 'error');
        console.error('Error blocking user:', error);
    }
}

async function deleteUser() {
    if (!selectedUserId) return;
    
    if (!confirm('Are you sure you want to delete this user? This action cannot be undone.')) {
        return;
    }
    
    showLoading();
    
    try {
        // Delete user data
        await database.ref(`users/${selectedUserId}`).remove();
        
        // Delete related data
        await database.ref(`checkins/${selectedUserId}`).remove();
        await database.ref(`adWatches/${selectedUserId}`).remove();
        await database.ref(`chats/${selectedUserId}`).remove();
        await database.ref(`referrals/${selectedUserId}`).remove();
        
        // Delete withdrawal requests
        const withdrawalsSnapshot = await database.ref('withdrawals').orderByChild('userId').equalTo(selectedUserId).once('value');
        const withdrawals = withdrawalsSnapshot.val() || {};
        for (const withdrawalId of Object.keys(withdrawals)) {
            await database.ref(`withdrawals/${withdrawalId}`).remove();
        }
        
        hideLoading();
        showAlert('User deleted successfully!', 'success');
        closeUserEditModal();
        loadUsers();
        
    } catch (error) {
        hideLoading();
        showAlert('Failed to delete user', 'error');
        console.error('Error deleting user:', error);
    }
}

// Withdrawals management
async function loadWithdrawals() {
    try {
        const snapshot = await database.ref('withdrawals').orderByChild('timestamp').once('value');
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
                        <h3 class="text-lg font-semibold text-gray-800">${withdrawal.username}</h3>
                        <p class="text-gray-600">${withdrawal.userEmail}</p>
                        <p class="text-sm text-gray-500">${withdrawal.paymentMethod.toUpperCase()}</p>
                        <p class="text-sm text-gray-500">${withdrawal.accountName} - ${withdrawal.accountNumber}</p>
                    </div>
                    <div class="text-right">
                        <p class="text-xl font-bold text-blue-600">$${formatCurrency(withdrawal.amount)}</p>
                        <span class="inline-block px-3 py-1 rounded-full text-sm font-medium ${statusColors[withdrawal.status] || statusColors.pending}">
                            ${withdrawal.status.toUpperCase()}
                        </span>
                    </div>
                </div>
                <div class="text-sm text-gray-500 mb-4">
                    ${new Date(withdrawal.timestamp).toLocaleString()}
                </div>
                ${withdrawal.status === 'pending' ? `
                    <div class="flex space-x-2">
                        <button onclick="approveWithdrawal('${id}')" 
                                class="flex-1 bg-green-500 text-white py-2 rounded-lg hover:bg-green-600 font-semibold">
                            Approve
                        </button>
                        <button onclick="rejectWithdrawal('${id}', ${withdrawal.amount}, '${withdrawal.userId}')" 
                                class="flex-1 bg-red-500 text-white py-2 rounded-lg hover:bg-red-600 font-semibold">
                            Reject
                        </button>
                        <button onclick="copyToClipboard('${withdrawal.accountNumber}')" 
                                class="bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600 font-semibold">
                            Copy
                        </button>
                    </div>
                ` : ''}
            `;
            
            withdrawalsList.appendChild(withdrawalElement);
        });
        
    } catch (error) {
        console.error('Error loading withdrawals:', error);
        document.getElementById('withdrawalsList').innerHTML = '<div class="text-center text-red-500 py-8">Error loading withdrawals</div>';
    }
}

async function approveWithdrawal(withdrawalId) {
    showLoading();
    
    try {
        await database.ref(`withdrawals/${withdrawalId}`).update({
            status: 'approved',
            processedAt: firebase.database.ServerValue.TIMESTAMP
        });
        
        hideLoading();
        showAlert('Withdrawal approved successfully!', 'success');
        loadWithdrawals();
        
    } catch (error) {
        hideLoading();
        showAlert('Failed to approve withdrawal', 'error');
        console.error('Error approving withdrawal:', error);
    }
}

async function rejectWithdrawal(withdrawalId, amount, userId) {
    showLoading();
    
    try {
        // Refund the balance
        await updateUserBalance(userId, amount, 'add');
        
        // Update withdrawal status
        await database.ref(`withdrawals/${withdrawalId}`).update({
            status: 'rejected',
            processedAt: firebase.database.ServerValue.TIMESTAMP
        });
        
        hideLoading();
        showAlert('Withdrawal rejected and balance refunded!', 'success');
        loadWithdrawals();
        
    } catch (error) {
        hideLoading();
        showAlert('Failed to reject withdrawal', 'error');
        console.error('Error rejecting withdrawal:', error);
    }
}

function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        showAlert('Copied to clipboard!', 'success');
    }).catch(() => {
        showAlert('Failed to copy to clipboard', 'error');
    });
}

// Ads management
async function loadAds() {
    try {
        const snapshot = await database.ref('ads').once('value');
        const ads = snapshot.val() || {};
        const adsList = document.getElementById('adsList');
        
        if (Object.keys(ads).length === 0) {
            adsList.innerHTML = '<div class="text-center text-gray-500 py-8">No ads found</div>';
            return;
        }
        
        adsList.innerHTML = '';
        
        Object.entries(ads).forEach(([adId, ad]) => {
            const adElement = document.createElement('div');
            adElement.className = 'bg-white rounded-xl p-6 shadow-lg';
            adElement.innerHTML = `
                <div class="flex justify-between items-start mb-4">
                    <div>
                        <h3 class="text-lg font-semibold text-gray-800">${ad.title}</h3>
                        <p class="text-green-600 font-bold">Reward: $${formatCurrency(ad.reward)}</p>
                        <p class="text-sm text-gray-500 break-all">${ad.url}</p>
                    </div>
                    <div class="flex space-x-2">
                        <button onclick="deleteAd('${adId}')" 
                                class="bg-red-500 text-white px-3 py-1 rounded text-sm hover:bg-red-600">
                            Delete
                        </button>
                    </div>
                </div>
            `;
            
            adsList.appendChild(adElement);
        });
        
    } catch (error) {
        console.error('Error loading ads:', error);
        document.getElementById('adsList').innerHTML = '<div class="text-center text-red-500 py-8">Error loading ads</div>';
    }
}

function showAddAdModal() {
    document.getElementById('addAdModal').classList.remove('hidden');
}

function closeAddAdModal() {
    document.getElementById('addAdModal').classList.add('hidden');
    document.getElementById('addAdForm').reset();
}

async function addNewAd(e) {
    e.preventDefault();
    
    const title = document.getElementById('adTitle').value;
    const reward = parseFloat(document.getElementById('adReward').value);
    const url = document.getElementById('adUrl').value;
    
    if (!title || !reward || !url) {
        showAlert('Please fill in all fields', 'error');
        return;
    }
    
    showLoading();
    
    try {
        await database.ref('ads').push({
            title: title,
            reward: reward,
            url: url,
            createdAt: firebase.database.ServerValue.TIMESTAMP
        });
        
        hideLoading();
        showAlert('Ad added successfully!', 'success');
        closeAddAdModal();
        loadAds();
        
    } catch (error) {
        hideLoading();
        showAlert('Failed to add ad', 'error');
        console.error('Error adding ad:', error);
    }
}

async function deleteAd(adId) {
    if (!confirm('Are you sure you want to delete this ad?')) return;
    
    showLoading();
    
    try {
        await database.ref(`ads/${adId}`).remove();
        
        hideLoading();
        showAlert('Ad deleted successfully!', 'success');
        loadAds();
        
    } catch (error) {
        hideLoading();
        showAlert('Failed to delete ad', 'error');
        console.error('Error deleting ad:', error);
    }
}

// Chat management
async function loadChatUsers() {
    try {
        const snapshot = await database.ref('chats').once('value');
        const chats = snapshot.val() || {};
        const chatUsersList = document.getElementById('chatUsersList');
        
        if (Object.keys(chats).length === 0) {
            chatUsersList.innerHTML = '<div class="text-center text-gray-500 py-4">No messages found</div>';
            return;
        }
        
        chatUsersList.innerHTML = '';
        
        // Get user names
        const usersSnapshot = await database.ref('users').once('value');
        const users = usersSnapshot.val() || {};
        
        Object.keys(chats).forEach(userId => {
            const user = users[userId];
            if (!user) return;
            
            const userElement = document.createElement('div');
            userElement.className = 'p-3 rounded-lg hover:bg-gray-100 cursor-pointer';
            userElement.innerHTML = `
                <div class="font-semibold text-gray-800">${user.username}</div>
                <div class="text-sm text-gray-600">${user.email}</div>
            `;
            
            userElement.addEventListener('click', () => selectChatUser(userId, user.username));
            chatUsersList.appendChild(userElement);
        });
        
    } catch (error) {
        console.error('Error loading chat users:', error);
    }
}

async function selectChatUser(userId, username) {
    selectedChatUserId = userId;
    
    document.getElementById('selectedUserChat').classList.add('hidden');
    document.getElementById('chatContainer').classList.remove('hidden');
    document.getElementById('chatUserName').textContent = username;
    
    loadChatMessages(userId);
}

async function loadChatMessages(userId) {
    try {
        const snapshot = await database.ref(`chats/${userId}`).orderByChild('timestamp').once('value');
        const messages = snapshot.val() || {};
        const chatMessages = document.getElementById('chatMessages');
        
        chatMessages.innerHTML = '';
        
        Object.values(messages).forEach(message => {
            const messageElement = document.createElement('div');
            messageElement.className = `p-3 rounded-lg max-w-xs ${
                message.sender === userId 
                    ? 'bg-gray-200 text-gray-800' 
                    : 'bg-purple-500 text-white ml-auto'
            }`;
            messageElement.innerHTML = `
                <p class="text-sm">${message.text}</p>
                <p class="text-xs opacity-75 mt-1">${new Date(message.timestamp).toLocaleTimeString()}</p>
            `;
            chatMessages.appendChild(messageElement);
        });
        
        // Scroll to bottom
        chatMessages.scrollTop = chatMessages.scrollHeight;
        
    } catch (error) {
        console.error('Error loading chat messages:', error);
    }
}

async function sendAdminMessage(e) {
    e.preventDefault();
    
    if (!selectedChatUserId) return;
    
    const messageInput = document.getElementById('adminMessageInput');
    const messageText = messageInput.value.trim();
    
    if (!messageText) return;
    
    try {
        await database.ref(`chats/${selectedChatUserId}`).push({
            sender: 'admin',
            senderName: 'Admin',
            text: messageText,
            timestamp: firebase.database.ServerValue.TIMESTAMP
        });
        
        messageInput.value = '';
        loadChatMessages(selectedChatUserId);
        
    } catch (error) {
        console.error('Error sending message:', error);
        showAlert('Failed to send message', 'error');
    }
}

// Check-in settings
async function loadCheckinSettings() {
    try {
        const snapshot = await database.ref('settings/daily_rewards').once('value');
        const rewards = snapshot.val() || {};
        
        for (let i = 1; i <= 7; i++) {
            const input = document.getElementById(`day${i}Reward`);
            if (input) {
                input.value = rewards[`day${i}`] || 0.005;
            }
        }
        
    } catch (error) {
        console.error('Error loading check-in settings:', error);
    }
}

async function saveCheckinSettings(e) {
    e.preventDefault();
    
    showLoading();
    
    try {
        const rewards = {};
        for (let i = 1; i <= 7; i++) {
            const input = document.getElementById(`day${i}Reward`);
            if (input) {
                rewards[`day${i}`] = parseFloat(input.value) || 0.005;
            }
        }
        
        await database.ref('settings/daily_rewards').set(rewards);
        
        hideLoading();
        showAlert('Check-in settings saved successfully!', 'success');
        
    } catch (error) {
        hideLoading();
        showAlert('Failed to save check-in settings', 'error');
        console.error('Error saving check-in settings:', error);
    }
}

// App settings
async function loadSettings() {
    try {
        const snapshot = await database.ref('settings').once('value');
        const settings = snapshot.val() || {};
        
        document.getElementById('baseUrl').value = settings.base_url || 'https://yourapp.com';
        document.getElementById('referralReward').value = settings.referral_reward || 0.05;
        
    } catch (error) {
        console.error('Error loading settings:', error);
    }
}

async function saveReferralSettings(e) {
    e.preventDefault();
    
    const baseUrl = document.getElementById('baseUrl').value;
    const referralReward = parseFloat(document.getElementById('referralReward').value);
    
    if (!baseUrl || !referralReward) {
        showAlert('Please fill in all fields', 'error');
        return;
    }
    
    showLoading();
    
    try {
        await database.ref('settings').update({
            base_url: baseUrl,
            referral_reward: referralReward
        });
        
        hideLoading();
        showAlert('Settings saved successfully!', 'success');
        
    } catch (error) {
        hideLoading();
        showAlert('Failed to save settings', 'error');
        console.error('Error saving settings:', error);
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