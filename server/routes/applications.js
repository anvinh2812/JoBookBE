const express = require('express');
const pool = require('../config/database');
const authenticateToken = require('../middleware/auth');

const router = express.Router();

// Apply to a post
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { post_id, cv_id } = req.body;
    
    // Only candidates can apply
    if (req.user.account_type !== 'candidate') {
      return res.status(403).json({ message: 'Only candidates can apply to posts' });
    }
    
    // Check if post exists and is find_candidate type
    const postResult = await pool.query(
      'SELECT id, post_type, user_id, created_at FROM posts WHERE id = $1',
      [post_id]
    );
    
    if (postResult.rows.length === 0) {
      return res.status(404).json({ message: 'Post not found' });
    }
    
    const post = postResult.rows[0];
    
    if (post.post_type !== 'find_candidate') {
      return res.status(400).json({ message: 'Can only apply to find_candidate posts' });
    }

    // Disallow applying if the job post is expired (10 days after created_at)
    const isExpired = post.created_at < new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);
    if (isExpired) {
      return res.status(400).json({ message: 'This job post has expired and no longer accepts applications' });
    }
    
    // Check if CV belongs to the user
    const cvResult = await pool.query(
      'SELECT id FROM cvs WHERE id = $1 AND user_id = $2 AND is_active = true',
      [cv_id, req.user.id]
    );
    
    if (cvResult.rows.length === 0) {
      return res.status(400).json({ message: 'CV not found or not active' });
    }
    
    // Check if already applied
    const existingApplication = await pool.query(
      'SELECT id FROM applications WHERE post_id = $1 AND applicant_id = $2',
      [post_id, req.user.id]
    );
    
    if (existingApplication.rows.length > 0) {
      return res.status(400).json({ message: 'Already applied to this post' });
    }
    
    const result = await pool.query(
      'INSERT INTO applications (post_id, cv_id, applicant_id) VALUES ($1, $2, $3) RETURNING *',
      [post_id, cv_id, req.user.id]
    );
    
    res.status(201).json({ 
      message: 'Application submitted successfully',
      application: result.rows[0] 
    });
  } catch (error) {
    console.error('Apply error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get applications for current user (as applicant)
router.get('/my-applications', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT 
        a.*,
        p.title as post_title,
        p.description as post_description,
        u.full_name as company_name,
        c.file_url as cv_file_url
      FROM applications a
      JOIN posts p ON a.post_id = p.id
      JOIN users u ON p.user_id = u.id
      JOIN cvs c ON a.cv_id = c.id
      WHERE a.applicant_id = $1
      ORDER BY a.created_at DESC`,
      [req.user.id]
    );
    
    res.json({ applications: result.rows });
  } catch (error) {
    console.error('Get my applications error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get applications for company's posts
router.get('/received', authenticateToken, async (req, res) => {
  try {
    // Only companies can view received applications
    if (req.user.account_type !== 'company') {
      return res.status(403).json({ message: 'Only companies can view received applications' });
    }
    
    const result = await pool.query(
      `SELECT 
        a.*,
        p.title as post_title,
        p.description as post_description,
        u.full_name as applicant_name,
        u.email as applicant_email,
        u.bio as applicant_bio,
        c.file_url as cv_file_url
      FROM applications a
      JOIN posts p ON a.post_id = p.id
      JOIN users u ON a.applicant_id = u.id
      JOIN cvs c ON a.cv_id = c.id
      WHERE p.user_id = $1
      ORDER BY a.created_at DESC`,
      [req.user.id]
    );
    
    res.json({ applications: result.rows });
  } catch (error) {
    console.error('Get received applications error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update application status
router.patch('/:id/status', authenticateToken, async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ['pending', 'reviewed', 'accepted', 'rejected'];
    
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ message: 'Invalid status' });
    }
    
    // Only the company that posted the job can update status
    const result = await pool.query(
      `UPDATE applications 
       SET status = $1 
       FROM posts 
       WHERE applications.id = $2 
       AND applications.post_id = posts.id 
       AND posts.user_id = $3 
       RETURNING applications.*`,
      [status, req.params.id, req.user.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Application not found or not authorized' });
    }
    
    res.json({ 
      message: 'Application status updated',
      application: result.rows[0] 
    });
  } catch (error) {
    console.error('Update application status error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get applications for a specific post
router.get('/post/:postId', authenticateToken, async (req, res) => {
  try {
    // Check if user owns the post
    const postResult = await pool.query(
      'SELECT user_id FROM posts WHERE id = $1',
      [req.params.postId]
    );
    
    if (postResult.rows.length === 0) {
      return res.status(404).json({ message: 'Post not found' });
    }
    
    if (postResult.rows[0].user_id !== req.user.id) {
      return res.status(403).json({ message: 'Not authorized to view these applications' });
    }
    
    const result = await pool.query(
      `SELECT 
        a.*,
        u.full_name as applicant_name,
        u.email as applicant_email,
        u.bio as applicant_bio,
        c.file_url as cv_file_url
      FROM applications a
      JOIN users u ON a.applicant_id = u.id
      JOIN cvs c ON a.cv_id = c.id
      WHERE a.post_id = $1
      ORDER BY a.created_at DESC`,
      [req.params.postId]
    );
    
    res.json({ applications: result.rows });
  } catch (error) {
    console.error('Get post applications error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
