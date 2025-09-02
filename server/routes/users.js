const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const pool = require('../config/database');
const authenticateToken = require('../middleware/auth');

const router = express.Router();

// Configure multer for avatar uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads/avatars');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `avatar-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Only image files are allowed'), false);
  }
};

const upload = multer({ 
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 2 * 1024 * 1024 // 2MB limit
  }
});

// Get user profile
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, full_name, email, account_type, bio, avatar_url, created_at FROM users WHERE id = $1',
      [req.params.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    res.json({ user: result.rows[0] });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update profile
router.patch('/profile', authenticateToken, async (req, res) => {
  try {
    const { full_name, bio } = req.body;
    
    const result = await pool.query(
      'UPDATE users SET full_name = $1, bio = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3 RETURNING id, full_name, email, account_type, bio, avatar_url',
      [full_name, bio, req.user.id]
    );
    
    res.json({ 
      message: 'Profile updated successfully',
      user: result.rows[0] 
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Upload avatar
router.post('/avatar', authenticateToken, upload.single('avatar'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    const avatar_url = `/uploads/avatars/${req.file.filename}`;
    
    // Get old avatar to delete
    const oldAvatarResult = await pool.query(
      'SELECT avatar_url FROM users WHERE id = $1',
      [req.user.id]
    );
    
    const result = await pool.query(
      'UPDATE users SET avatar_url = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING avatar_url',
      [avatar_url, req.user.id]
    );
    
    // Delete old avatar file if exists
    if (oldAvatarResult.rows[0]?.avatar_url) {
      const oldFilePath = path.join(__dirname, '..', oldAvatarResult.rows[0].avatar_url);
      if (fs.existsSync(oldFilePath)) {
        fs.unlinkSync(oldFilePath);
      }
    }
    
    res.json({ 
      message: 'Avatar updated successfully',
      avatar_url: result.rows[0].avatar_url 
    });
  } catch (error) {
    console.error('Upload avatar error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Search users
router.get('/', async (req, res) => {
  try {
    const { search, type, page = 1, limit = 10 } = req.query;
    const pageNum = Number(page) || 1;
    const limitNum = Math.min(50, Number(limit) || 10);
    const offset = (pageNum - 1) * limitNum;
    
    let baseWhere = 'WHERE 1=1';
    const whereParams = [];
    
    if (search) {
      baseWhere += ` AND (full_name ILIKE $${whereParams.length + 1} OR email ILIKE $${whereParams.length + 1})`;
      whereParams.push(`%${search}%`);
    }
    
    if (type) {
      baseWhere += ` AND account_type = $${whereParams.length + 1}`;
      whereParams.push(type);
    }

    // total count
    const countResult = await pool.query(`SELECT COUNT(*)::int AS total FROM users ${baseWhere}`, whereParams);
    const total = countResult.rows[0]?.total || 0;

    // page data
    const dataQuery = `SELECT id, full_name, email, account_type, bio, avatar_url FROM users ${baseWhere} ORDER BY full_name LIMIT $${whereParams.length + 1} OFFSET $${whereParams.length + 2}`;
    const dataParams = [...whereParams, limitNum, offset];
    const result = await pool.query(dataQuery, dataParams);
    res.json({ users: result.rows, total });
  } catch (error) {
    console.error('Search users error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
