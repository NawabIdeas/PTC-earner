// Authentication functions for login/register page

let currentUser = null;

// Check authentication state
auth.onAuthStateChanged(async (user) => {
    if (user) {
        currentUser = user;
        const userData = await getCurrentUserData();
        
        if (userData && userData.role === 'admin') {
            window.location.href = 'admin.html';
        } else {
            window.location.href = 'user.html';
        }
    }
});

// Check URL for referral code
function checkReferralCode() {
    const urlParams = new URLSearchParams(window.location.search);
    const ref = urlParams.get('ref');
    if (ref) {
        document.getElementById('referralCode').value = ref;
    }
}

// Toggle password visibility
function togglePassword(fieldId) {
    const field = document.getElementById(fieldId);
    if (field.type === 'password') {
        field.type = 'text';
    } else {
        field.type = 'password';
    }
}

// Show register form
function showRegisterForm() {
    document.getElementById('loginForm').classList.add('hidden');
    document.getElementById('registerForm').classList.remove('hidden');
}

// Show login form
function showLoginForm() {
    document.getElementById('registerForm').classList.add('hidden');
    document.getElementById('loginForm').classList.remove('hidden');
}

// Handle login
document.getElementById('loginFormElement').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    
    if (!email || !password) {
        showAlert('Please fill in all fields', 'error');
        return;
    }
    
    showLoading();
    
    try {
        await auth.signInWithEmailAndPassword(email, password);
        // Auth state change will handle redirect
    } catch (error) {
        hideLoading();
        let errorMessage = 'Login failed. Please try again.';
        
        switch (error.code) {
            case 'auth/user-not-found':
                errorMessage = 'No account found with this email.';
                break;
            case 'auth/wrong-password':
                errorMessage = 'Incorrect password.';
                break;
            case 'auth/invalid-email':
                errorMessage = 'Invalid email address.';
                break;
            case 'auth/user-disabled':
                errorMessage = 'This account has been disabled.';
                break;
        }
        
        showAlert(errorMessage, 'error');
    }
});

// Handle registration
document.getElementById('registerFormElement').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const username = document.getElementById('registerUsername').value;
    const email = document.getElementById('registerEmail').value;
    const password = document.getElementById('registerPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    const referralCode = document.getElementById('referralCode').value;
    
    if (!username || !email || !password || !confirmPassword) {
        showAlert('Please fill in all required fields', 'error');
        return;
    }
    
    if (password !== confirmPassword) {
        showAlert('Passwords do not match', 'error');
        return;
    }
    
    if (password.length < 6) {
        showAlert('Password must be at least 6 characters long', 'error');
        return;
    }
    
    showLoading();
    
    try {
        // Create user account
        const userCredential = await auth.createUserWithEmailAndPassword(email, password);
        const user = userCredential.user;
        
        // Create user profile in database
        const userData = {
            uid: user.uid,
            username: username,
            email: email,
            balance: 0,
            role: 'user',
            referralCount: 0,
            referralEarnings: 0,
            createdAt: firebase.database.ServerValue.TIMESTAMP,
            lastLogin: firebase.database.ServerValue.TIMESTAMP
        };
        
        await database.ref(`users/${user.uid}`).set(userData);
        
        // Handle referral if provided
        if (referralCode) {
            try {
                // Find referrer
                const usersSnapshot = await database.ref('users').orderByChild('uid').equalTo(referralCode).once('value');
                const users = usersSnapshot.val();
                
                if (users) {
                    const referrerId = Object.keys(users)[0];
                    const referrer = users[referrerId];
                    
                    // Get referral reward from settings
                    const settingsSnapshot = await database.ref('settings/referral_reward').once('value');
                    const referralReward = settingsSnapshot.val() || 0.05;
                    
                    // Update referrer's data
                    await database.ref(`users/${referrerId}`).update({
                        referralCount: (referrer.referralCount || 0) + 1,
                        referralEarnings: (referrer.referralEarnings || 0) + referralReward,
                        balance: (referrer.balance || 0) + referralReward
                    });
                    
                    // Add referral record
                    await database.ref(`referrals/${referrerId}/${user.uid}`).set({
                        referredUser: user.uid,
                        referredUsername: username,
                        referredEmail: email,
                        reward: referralReward,
                        timestamp: firebase.database.ServerValue.TIMESTAMP
                    });
                }
            } catch (referralError) {
                console.error('Error processing referral:', referralError);
                // Don't fail registration if referral processing fails
            }
        }
        
        hideLoading();
        showAlert('Account created successfully!', 'success');
        
        // Auth state change will handle redirect
    } catch (error) {
        hideLoading();
        let errorMessage = 'Registration failed. Please try again.';
        
        switch (error.code) {
            case 'auth/email-already-in-use':
                errorMessage = 'An account with this email already exists.';
                break;
            case 'auth/invalid-email':
                errorMessage = 'Invalid email address.';
                break;
            case 'auth/weak-password':
                errorMessage = 'Password is too weak. Please choose a stronger password.';
                break;
        }
        
        showAlert(errorMessage, 'error');
    }
});

// Initialize page
document.addEventListener('DOMContentLoaded', () => {
    checkReferralCode();
});