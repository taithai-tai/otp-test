document.addEventListener('DOMContentLoaded', () => {
    const API_URL = 'https://api-v2.thaibulksms.com/sms';

    const nameInput = document.getElementById('name');
    const phoneInput = document.getElementById('phone');
    const otpInput = document.getElementById('otp');
    const sendOtpBtn = document.getElementById('send-otp-btn');
    const verifyBtn = document.getElementById('verify-btn');
    const logoutBtn = document.getElementById('logout-btn');
    const messageArea = document.getElementById('message-area');

    let otpToken = null; // To store the OTP token from the backend

    // --- Page specific logic ---
    const page = window.location.pathname;

    if (page.includes('register.html') || page.includes('login.html')) {
        sendOtpBtn.addEventListener('click', sendOTP);
        verifyBtn.addEventListener('click', page.includes('register.html') ? verifyRegistration : verifyLogin);
    }

    if (page.includes('welcome.html')) {
        loadWelcomePage();
        logoutBtn.addEventListener('click', logout);
    }

    // --- Functions ---

    function showMessage(text, isError = false) {
        messageArea.textContent = text;
        messageArea.className = isError ? 'error' : 'success';
    }

    async function sendOTP() {
        const phone = phoneInput.value;
        if (!/^0\d{9}$/.test(phone)) {
            showMessage('เบอร์โทรศัพท์ไม่ถูกต้อง ต้องขึ้นต้นด้วย 0 และมี 10 หลัก', true);
            return;
        }

        // For registration, check name as well
        if (page.includes('register.html') && !nameInput.value) {
            showMessage('กรุณากรอกชื่อ', true);
            return;
        }

        showMessage('กำลังส่ง OTP...');
        sendOtpBtn.disabled = true;

        try {
            const res = await fetch(`${API_URL}/otp/send`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone })
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.message || 'Failed to send OTP');
            }
            
            otpToken = data.otp_token; // Save the OTP token
            showMessage(`OTP ถูกส่งไปที่เบอร์ ${phone} (Ref: ${data.refno})`, false);

            // Show verify form
            document.getElementById(page.includes('register.html') ? 'register-form' : 'login-form').style.display = 'none';
            document.getElementById('verify-form').style.display = 'block';

        } catch (err) {
            showMessage(err.message, true);
        } finally {
            sendOtpBtn.disabled = false;
        }
    }

    async function verifyRegistration() {
        const name = nameInput.value;
        const phone = phoneInput.value;
        const otp_pin = otpInput.value;

        if (otp_pin.length !== 6) {
            showMessage('OTP ต้องมี 6 หลัก', true);
            return;
        }

        showMessage('กำลังยืนยัน...');
        verifyBtn.disabled = true;

        try {
            const res = await fetch(`${API_URL}/register/verify`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, phone, otp_pin, otp_token: otpToken })
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.message || 'Verification failed');
            }
            
            showMessage(data.message, false);
            setTimeout(() => window.location.href = 'login.html', 2000);

        } catch (err) {
            showMessage(err.message, true);
        } finally {
            verifyBtn.disabled = false;
        }
    }

    async function verifyLogin() {
        const phone = phoneInput.value;
        const otp_pin = otpInput.value;

        if (otp_pin.length !== 6) {
            showMessage('OTP ต้องมี 6 หลัก', true);
            return;
        }

        showMessage('กำลังตรวจสอบ...');
        verifyBtn.disabled = true;

        try {
            const res = await fetch(`${API_URL}/login/verify`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone, otp_pin, otp_token: otpToken })
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.message || 'Login failed');
            }

            localStorage.setItem('accessToken', data.accessToken);
            window.location.href = 'welcome.html';

        } catch (err) {
            showMessage(err.message, true);
        } finally {
            verifyBtn.disabled = false;
        }
    }

    async function loadWelcomePage() {
        const token = localStorage.getItem('accessToken');
        if (!token) {
            window.location.href = 'login.html';
            return;
        }

        try {
            const res = await fetch(`${API_URL}/me`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!res.ok) {
                throw new Error('Failed to fetch user data');
            }

            const user = await res.json();
            document.getElementById('welcome-message').textContent = `ยินดีต้อนรับคุณ ${user.name}`;
            document.getElementById('user-phone').textContent = `เบอร์โทรศัพท์: ${user.phone}`;

        } catch (err) {
            console.error(err);
            // If token is invalid or expired, redirect to login
            localStorage.removeItem('accessToken');
            window.location.href = 'login.html';
        }
    }

    function logout() {
        localStorage.removeItem('accessToken');
        window.location.href = 'login.html';
    }
});
