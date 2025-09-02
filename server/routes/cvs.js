const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const pool = require('../config/database');
const authenticateToken = require('../middleware/auth');

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../uploads/cvs');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `cv-${uniqueSuffix}${path.extname(file.originalname)}`);
  }
});

const fileFilter = (req, file, cb) => {
  if (file.mimetype === 'application/pdf') {
    cb(null, true);
  } else {
    cb(new Error('Only PDF files are allowed'), false);
  }
};

const upload = multer({ 
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  }
});

// Get user's CVs
router.get('/', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM cvs WHERE user_id = $1 ORDER BY created_at DESC',
      [req.user.id]
    );
    
    res.json({ cvs: result.rows });
  } catch (error) {
    console.error('Get CVs error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Upload CV
router.post('/upload', authenticateToken, upload.single('cv'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    // Only candidates can upload CVs
    if (req.user.account_type !== 'candidate') {
      return res.status(403).json({ message: 'Only candidates can upload CVs' });
    }

    const file_url = `/uploads/cvs/${req.file.filename}`;
    
    const result = await pool.query(
      'INSERT INTO cvs (user_id, file_url) VALUES ($1, $2) RETURNING *',
      [req.user.id, file_url]
    );
    
    res.status(201).json({ 
      message: 'CV uploaded successfully',
      cv: result.rows[0] 
    });
  } catch (error) {
    console.error('Upload CV error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Toggle CV active status
router.patch('/:id/toggle', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'UPDATE cvs SET is_active = NOT is_active WHERE id = $1 AND user_id = $2 RETURNING *',
      [req.params.id, req.user.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'CV not found' });
    }
    
    res.json({ cv: result.rows[0] });
  } catch (error) {
    console.error('Toggle CV error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete CV
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM cvs WHERE id = $1 AND user_id = $2 RETURNING file_url',
      [req.params.id, req.user.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'CV not found' });
    }
    
    // Delete file from filesystem
    const filePath = path.join(__dirname, '..', result.rows[0].file_url);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    
    res.json({ message: 'CV deleted successfully' });
  } catch (error) {
    console.error('Delete CV error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Rename CV (update name)
router.patch('/:id/name', authenticateToken, async (req, res) => {
  try {
    // Only candidates can rename their CVs (ownership enforced below)
    if (req.user.account_type !== 'candidate') {
      return res.status(403).json({ message: 'Only candidates can rename CVs' });
    }

    const { name } = req.body;
    const trimmed = (name || '').trim();
    if (!trimmed) {
      return res.status(400).json({ message: 'Name is required' });
    }
    if (trimmed.length > 150) {
      return res.status(400).json({ message: 'Name is too long (max 150 characters)' });
    }

    // Ensure the CV belongs to the user and update its name
    const result = await pool.query(
      'UPDATE cvs SET name = $1 WHERE id = $2 AND user_id = $3 RETURNING *',
      [trimmed, req.params.id, req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'CV not found' });
    }

    res.json({ 
      message: 'CV renamed successfully',
      cv: result.rows[0]
    });
  } catch (error) {
    console.error('Rename CV error:', error);
    // Likely the column does not exist on DB
    if (error?.message && /column\s+"?name"?\s+does not exist/i.test(error.message)) {
      return res.status(500).json({ message: 'Database is missing column "name" on table cvs. Please run migration to add it.' });
    }
    res.status(500).json({ message: 'Server error' });
  }
});

// Get CV file (for viewing)
router.get('/:id/file', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT file_url FROM cvs WHERE id = $1',
      [req.params.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'CV not found' });
    }
    
    const filePath = path.join(__dirname, '..', result.rows[0].file_url);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ message: 'File not found' });
    }
    
    res.setHeader('Content-Type', 'application/pdf');
    res.sendFile(filePath);
  } catch (error) {
    console.error('Get CV file error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
