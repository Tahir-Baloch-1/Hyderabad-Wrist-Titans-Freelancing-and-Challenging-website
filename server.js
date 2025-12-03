const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');

dotenv.config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static('uploads'));

// Database Connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/wrist_titans', {
    useNewUrlParser: true,
    useUnifiedTopology: true
});

// User Schema
const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    phone: { type: String, required: true },
    weight: { type: String },
    experience: { type: String },
    city: { type: String },
    role: { type: String, default: 'user' }, // user, admin
    status: { type: String, default: 'pending' }, // pending, approved, rejected
    registeredAt: { type: Date, default: Date.now },
    profileImage: { type: String },
    matches: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Match' }],
    events: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Event' }]
});

// Match Schema
const matchSchema = new mongoose.Schema({
    challenger: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    opponent: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    weightClass: { type: String, required: true },
    date: { type: Date, required: true },
    venue: { type: String },
    status: { type: String, default: 'pending' }, // pending, approved, completed
    result: { type: String }, // win, loss, draw
    winner: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    referee: { type: String },
    recordedAt: { type: Date, default: Date.now }
});

// Event Schema
const eventSchema = new mongoose.Schema({
    title: { type: String, required: true },
    description: { type: String, required: true },
    date: { type: Date, required: true },
    venue: { type: String, required: true },
    organizer: { type: String },
    participants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    registrationFee: { type: Number },
    status: { type: String, default: 'upcoming' }, // upcoming, ongoing, completed
    createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
const Match = mongoose.model('Match', matchSchema);
const Event = mongoose.model('Event', eventSchema);

// Auth Middleware
const authMiddleware = async (req, res, next) => {
    try {
        const token = req.header('Authorization').replace('Bearer ', '');
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findOne({ _id: decoded.userId });
        
        if (!user) {
            throw new Error();
        }
        
        req.user = user;
        req.token = token;
        next();
    } catch (error) {
        res.status(401).json({ error: 'Please authenticate' });
    }
};

// Admin Middleware
const adminMiddleware = (req, res, next) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Access denied' });
    }
    next();
};

// Image Upload
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/')
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + path.extname(file.originalname))
    }
});
const upload = multer({ storage: storage });

// Routes

// User Registration
app.post('/api/auth/register', async (req, res) => {
    try {
        const { name, email, password, phone, weight, experience, city } = req.body;
        
        // Check if user exists
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ error: 'User already exists' });
        }
        
        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);
        
        // Create user
        const user = new User({
            name,
            email,
            password: hashedPassword,
            phone,
            weight,
            experience,
            city
        });
        
        await user.save();
        
        // Generate token
        const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET);
        
        res.status(201).json({
            message: 'Registration successful',
            token,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// User Login
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        // Find user
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(400).json({ error: 'Invalid credentials' });
        }
        
        // Check password
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ error: 'Invalid credentials' });
        }
        
        // Generate token
        const token = jwt.sign({ userId: user._id }, process.env.JWT_SECRET);
        
        res.json({
            message: 'Login successful',
            token,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get User Profile
app.get('/api/users/profile', authMiddleware, async (req, res) => {
    try {
        const user = await User.findById(req.user._id)
            .select('-password')
            .populate('matches')
            .populate('events');
        
        res.json(user);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get User Dashboard
app.get('/api/users/dashboard', authMiddleware, async (req, res) => {
    try {
        const user = await User.findById(req.user._id).select('-password');
        
        // Get user's matches
        const matches = await Match.find({
            $or: [{ challenger: user._id }, { opponent: user._id }]
        })
        .populate('challenger', 'name')
        .populate('opponent', 'name')
        .sort({ date: -1 });
        
        // Get upcoming events
        const events = await Event.find({
            date: { $gte: new Date() }
        }).sort({ date: 1 });
        
        // Get announcements
        const announcements = await Event.find({
            status: 'upcoming'
        }).sort({ createdAt: -1 }).limit(5);
        
        res.json({
            user,
            matches,
            events,
            announcements,
            stats: {
                totalMatches: matches.length,
                wins: matches.filter(m => m.result === 'win' && m.winner?.toString() === user._id.toString()).length,
                upcomingEvents: events.length
            }
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Challenge a Player
app.post('/api/matches/challenge', authMiddleware, async (req, res) => {
    try {
        const { opponentId, weightClass, date, venue } = req.body;
        
        const match = new Match({
            challenger: req.user._id,
            opponent: opponentId,
            weightClass,
            date: new Date(date),
            venue
        });
        
        await match.save();
        
        // Add match to user's matches
        await User.findByIdAndUpdate(req.user._id, {
            $push: { matches: match._id }
        });
        
        res.status(201).json({
            message: 'Challenge sent successfully',
            match
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get All Events
app.get('/api/events', async (req, res) => {
    try {
        const events = await Event.find().sort({ date: 1 });
        res.json(events);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Register for Event
app.post('/api/events/register/:eventId', authMiddleware, async (req, res) => {
    try {
        const event = await Event.findById(req.params.eventId);
        
        if (!event) {
            return res.status(404).json({ error: 'Event not found' });
        }
        
        // Check if already registered
        if (event.participants.includes(req.user._id)) {
            return res.status(400).json({ error: 'Already registered' });
        }
        
        // Add user to participants
        event.participants.push(req.user._id);
        await event.save();
        
        // Add event to user's events
        await User.findByIdAndUpdate(req.user._id, {
            $push: { events: event._id }
        });
        
        res.json({
            message: 'Registration successful',
            event
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Admin Routes
app.get('/api/admin/users', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const users = await User.find().select('-password').sort({ registeredAt: -1 });
        res.json(users);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.put('/api/admin/users/:userId/status', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { status } = req.body;
        const user = await User.findByIdAndUpdate(
            req.params.userId,
            { status },
            { new: true }
        ).select('-password');
        
        res.json(user);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Create Event (Admin)
app.post('/api/admin/events', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const event = new Event(req.body);
        await event.save();
        
        res.status(201).json({
            message: 'Event created successfully',
            event
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});