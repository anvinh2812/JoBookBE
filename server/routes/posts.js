const express = require('express');
const pool = require('../config/database');
const authenticateToken = require('../middleware/auth');

const router = express.Router();

// Get all posts (with user info and following status)
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { page = 1, limit = 10, type } = req.query;
    const offset = (page - 1) * limit;
    
    let query = `
      SELECT 
        p.*,
        u.full_name as author_name,
        u.account_type as author_type,
        u.avatar_url as author_avatar,
        c.file_url as cv_file_url,
        CASE WHEN f.follower_id IS NOT NULL THEN true ELSE false END as is_following_author,
        CASE 
          WHEN p.post_type = 'find_candidate' AND p.created_at < (CURRENT_TIMESTAMP - INTERVAL '10 days') THEN true
          ELSE false
        END AS is_expired
      FROM posts p
      JOIN users u ON p.user_id = u.id
      LEFT JOIN cvs c ON p.attached_cv_id = c.id
      LEFT JOIN follows f ON f.following_id = p.user_id AND f.follower_id = $1
    `;
    
    const params = [req.user.id];
    
    if (type) {
      query += ` WHERE p.post_type = $${params.length + 1}`;
      params.push(type);
    }
    
    query += ` ORDER BY 
      -- Non-expired posts first
      CASE 
        WHEN p.post_type = 'find_candidate' AND p.created_at < (CURRENT_TIMESTAMP - INTERVAL '10 days') THEN 1
        ELSE 0
      END ASC,
      -- Then priority for following authors
      CASE WHEN f.follower_id IS NOT NULL THEN 0 ELSE 1 END,
      -- Newest first within the same group
      p.created_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;
    
    params.push(limit, offset);
    
    const result = await pool.query(query, params);
    res.json({ posts: result.rows });
  } catch (error) {
    console.error('Get posts error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get posts by user
router.get('/user/:userId', authenticateToken, async (req, res) => {
  try {
    const { userId } = req.params;
    const { type } = req.query;
    
    let query = `
      SELECT 
        p.*,
        u.full_name as author_name,
        u.account_type as author_type,
        u.avatar_url as author_avatar,
        c.file_url as cv_file_url,
        CASE 
          WHEN p.post_type = 'find_candidate' AND p.created_at < (CURRENT_TIMESTAMP - INTERVAL '10 days') THEN true
          ELSE false
        END AS is_expired
      FROM posts p
      JOIN users u ON p.user_id = u.id
      LEFT JOIN cvs c ON p.attached_cv_id = c.id
      WHERE p.user_id = $1
    `;
    
    const params = [userId];
    
    if (type) {
      query += ` AND p.post_type = $2`;
      params.push(type);
    }
    
    query += ` ORDER BY 
      CASE 
        WHEN p.post_type = 'find_candidate' AND p.created_at < (CURRENT_TIMESTAMP - INTERVAL '10 days') THEN 1
        ELSE 0
      END ASC,
      p.created_at DESC`;
    
    const result = await pool.query(query, params);
    res.json({ posts: result.rows });
  } catch (error) {
    console.error('Get user posts error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Create post
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { post_type, title, description, attached_cv_id } = req.body;
    
    // Validate post type with account type
    if (post_type === 'find_job' && req.user.account_type !== 'candidate') {
      return res.status(400).json({ message: 'Only candidates can create find_job posts' });
    }
    
    if (post_type === 'find_candidate' && req.user.account_type !== 'company') {
      return res.status(400).json({ message: 'Only companies can create find_candidate posts' });
    }
    
    // For find_job posts, attached_cv_id is required
    if (post_type === 'find_job' && !attached_cv_id) {
      return res.status(400).json({ message: 'CV is required for job seeking posts' });
    }
    
    const result = await pool.query(
      'INSERT INTO posts (user_id, post_type, title, description, attached_cv_id) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [req.user.id, post_type, title, description, attached_cv_id || null]
    );
    
    res.status(201).json({ post: result.rows[0] });
  } catch (error) {
    console.error('Create post error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Update post
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { title, description, attached_cv_id } = req.body;
    const postId = req.params.id;
    
    // Check if user owns the post
    const checkResult = await pool.query(
      'SELECT * FROM posts WHERE id = $1 AND user_id = $2',
      [postId, req.user.id]
    );
    
    if (checkResult.rows.length === 0) {
      return res.status(404).json({ message: 'Post not found or not authorized' });
    }
    
    const post = checkResult.rows[0];
    
    // For find_job posts, attached_cv_id is required
    if (post.post_type === 'find_job' && !attached_cv_id) {
      return res.status(400).json({ message: 'CV is required for job seeking posts' });
    }
    
    const result = await pool.query(
      'UPDATE posts SET title = $1, description = $2, attached_cv_id = $3, updated_at = CURRENT_TIMESTAMP WHERE id = $4 AND user_id = $5 RETURNING *',
      [title, description, attached_cv_id || null, postId, req.user.id]
    );
    
    res.json({ post: result.rows[0] });
  } catch (error) {
    console.error('Update post error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get single post
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT 
        p.*,
        u.full_name as author_name,
        u.account_type as author_type,
        u.avatar_url as author_avatar,
        c.file_url as cv_file_url,
        CASE 
          WHEN p.post_type = 'find_candidate' AND p.created_at < (CURRENT_TIMESTAMP - INTERVAL '10 days') THEN true
          ELSE false
        END AS is_expired
      FROM posts p
      JOIN users u ON p.user_id = u.id
      LEFT JOIN cvs c ON p.attached_cv_id = c.id
      WHERE p.id = $1`,
      [req.params.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Post not found' });
    }
    
    res.json({ post: result.rows[0] });
  } catch (error) {
    console.error('Get post error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete post
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM posts WHERE id = $1 AND user_id = $2 RETURNING *',
      [req.params.id, req.user.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Post not found or not authorized' });
    }
    
    res.json({ message: 'Post deleted successfully' });
  } catch (error) {
    console.error('Delete post error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
