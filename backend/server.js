require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const db = require('./database');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

// --- ThaiBulkSMS API Config ---
const { 
    THAIBULKSMS_API_KEY, 
    THAIBULKSMS_API_SECRET, 
    THAIBULKSMS_OTP_ENDPOINT_SEND,
    THAIBULKSMS_OTP_ENDPOINT_VERIFY,
    JWT_SECRET
} = process.env;

const thaiBulkAuth = Buffer.from(`${THAIBULKSMS_API_KEY}:${THAIBULKSMS_API_SECRET}`).toString('base64');

// --- Rate Limiting ---
const otpLimiter = rateLimit({
	windowMs: 5 * 60 * 1000, // 5 minutes
	max: 5, // Limit each IP to 5 OTP requests per windowMs
	message: 'Too many OTP requests from this IP, please try again after 5 minutes',
});

// --- Middleware to protect routes ---
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (token == null) return res.sendStatus(401); // if there isn't any token

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
};

// --- API Endpoints ---

/**
 * @route   POST /api/otp/send
 * @desc    Send OTP for Registration or Login
 */
app.post('/api/otp/send', otpLimiter, async (req, res) => {
    const { phone } = req.body;

    if (!phone || !/^0\d{9}$/.test(phone)) {
        return res.status(400).json({ message: 'เบอร์โทรศัพท์ไม่ถูกต้อง ต้องขึ้นต้นด้วย 0 และมี 10 หลัก' });
    }

    // Convert to E.164 format for ThaiBulkSMS (e.g., 0812345678 -> 66812345678)
    const msisdn = `66${phone.substring(1)}`;

    try {
        const response = await axios.post(
            THAIBULKSMS_OTP_ENDPOINT_SEND,
            { msisdn },
            {
                headers: {
                    'Authorization': `Basic ${thaiBulkAuth}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        // Return the token and refno from ThaiBulkSMS to the client
        res.json({ 
            message: 'OTP has been sent.',
            otp_token: response.data.token, 
            refno: response.data.refno 
        });

    } catch (error) {
        console.error('Error sending OTP:', error.response ? error.response.data : error.message);
        res.status(500).json({ message: 'Failed to send OTP' });
    }
});

/**
 * @route   POST /api/register/verify
 * @desc    Verify OTP for new user registration
 */
app.post('/api/register/verify', async (req, res) => {
    const { name, phone, otp_pin, otp_token } = req.body;

    if (!name || !phone || !otp_pin || !otp_token) {
        return res.status(400).json({ message: 'กรุณากรอกข้อมูลให้ครบถ้วน' });
    }

    try {
        // 1. Verify OTP with ThaiBulkSMS
        await axios.post(
            THAIBULKSMS_OTP_ENDPOINT_VERIFY,
            { token: otp_token, pin: otp_pin },
            {
                headers: {
                    'Authorization': `Basic ${thaiBulkAuth}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        // 2. OTP is valid, check if user exists
        db.get('SELECT * FROM users WHERE phone = ?', [phone], (err, row) => {
            if (err) return res.status(500).json({ message: 'Database error' });
            if (row) return res.status(400).json({ message: 'เบอร์โทรนี้ถูกสมัครไปแล้ว' });

            // 3. Create new user
            db.run('INSERT INTO users (name, phone) VALUES (?, ?)', [name, phone], function(err) {
                if (err) return res.status(500).json({ message: 'ไม่สามารถสร้างผู้ใช้ได้' });
                res.status(201).json({ message: 'สมัครสมาชิกสำเร็จ! กรุณาเข้าสู่ระบบ' });
            });
        });

    } catch (error) {
        res.status(400).json({ message: 'รหัส OTP ไม่ถูกต้องหรือหมดอายุ' });
    }
});

/**
 * @route   POST /api/login/verify
 * @desc    Verify OTP for login and return JWT
 */
app.post('/api/login/verify', async (req, res) => {
    const { phone, otp_pin, otp_token } = req.body;

    if (!phone || !otp_pin || !otp_token) {
        return res.status(400).json({ message: 'กรุณากรอกข้อมูลให้ครบถ้วน' });
    }

    try {
        // 1. Verify OTP with ThaiBulkSMS
        await axios.post(
            THAIBULKSMS_OTP_ENDPOINT_VERIFY,
            { token: otp_token, pin: otp_pin },
            {
                headers: {
                    'Authorization': `Basic ${thaiBulkAuth}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        // 2. OTP is valid, find the user
        db.get('SELECT * FROM users WHERE phone = ?', [phone], (err, user) => {
            if (err) return res.status(500).json({ message: 'Database error' });
            if (!user) return res.status(404).json({ message: 'ไม่พบผู้ใช้ กรุณาสมัครก่อน' });

            // 3. Generate JWT
            const accessToken = jwt.sign({ id: user.id, name: user.name, phone: user.phone }, JWT_SECRET, { expiresIn: '1h' });
            res.json({ accessToken });
        });

    } catch (error) {
        res.status(400).json({ message: 'รหัส OTP ไม่ถูกต้องหรือหมดอายุ' });
    }
});

/**
 * @route   GET /api/me
 * @desc    Get current user data
 */
app.get('/api/me', authenticateToken, (req, res) => {
    res.json(req.user);
});


app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
