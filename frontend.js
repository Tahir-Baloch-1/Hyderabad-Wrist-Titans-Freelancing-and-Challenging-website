// frontend.js - For additional functionality

// Check if user is logged in on main page
function checkIfLoggedIn() {
    const userEmail = localStorage.getItem('userEmail');
    if (userEmail) {
        // User is logged in, update login button
        const loginBtn = document.getElementById('login-btn');
        if (loginBtn) {
            const userName = localStorage.getItem('userName') || 'User';
            loginBtn.innerHTML = `<i class="fas fa-user"></i> ${userName}`;
            loginBtn.href = "dashboard.html";
            loginBtn.removeAttribute('id');
        }
    }
}

// Update navbar for logged in users
function updateNavbar() {
    const userEmail = localStorage.getItem('userEmail');
    if (userEmail) {
        // Add dashboard link to navbar
        const navLinks = document.querySelector('.nav-links');
        if (navLinks) {
            const dashboardLi = document.createElement('li');
            dashboardLi.innerHTML = '<a href="dashboard.html"><i class="fas fa-tachometer-alt"></i> Dashboard</a>';
            
            // Insert before login button
            const loginLi = document.querySelector('#login-btn')?.parentElement;
            if (loginLi) {
                navLinks.insertBefore(dashboardLi, loginLi);
            }
        }
    }
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', function() {
    checkIfLoggedIn();
    updateNavbar();
    
    // Auto login after registration
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('registered') === 'true') {
        alert('Registration successful! Please login.');
    }
});