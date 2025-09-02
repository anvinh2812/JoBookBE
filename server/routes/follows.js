const express = require('express');
const pool = require('../config/database');
const authenticateToken = require('../middleware/auth');

const router = express.Router();

// Follow a user
router.post('/:userId', authenticateToken, async (req, res) => {
  try {
    const followingId = req.params.userId;
    const followerId = req.user.id;
    
    // Can't follow yourself
    if (followerId === parseInt(followingId)) {
      return res.status(400).json({ message: 'Cannot follow yourself' });
    }
    
    // Check if user exists
    const userResult = await pool.query(
      'SELECT id FROM users WHERE id = $1',
      [followingId]
    );
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Check if already following
    const existingFollow = await pool.query(
      'SELECT * FROM follows WHERE follower_id = $1 AND following_id = $2',
      [followerId, followingId]
    );
    
    if (existingFollow.rows.length > 0) {
      return res.status(400).json({ message: 'Already following this user' });
    }
    
    await pool.query(
      'INSERT INTO follows (follower_id, following_id) VALUES ($1, $2)',
      [followerId, followingId]
    );
    
    res.status(201).json({ message: 'Successfully followed user' });
  } catch (error) {
    console.error('Follow error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Unfollow a user
router.delete('/:userId', authenticateToken, async (req, res) => {
  try {
    const followingId = req.params.userId;
    const followerId = req.user.id;
    
    const result = await pool.query(
      'DELETE FROM follows WHERE follower_id = $1 AND following_id = $2',
      [followerId, followingId]
    );
    
    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'Not following this user' });
    }
    
    res.json({ message: 'Successfully unfollowed user' });
  } catch (error) {
    console.error('Unfollow error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get followers
router.get('/followers', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT 
        u.id, u.full_name, u.email, u.account_type, u.bio, u.avatar_url,
        f.created_at as followed_at
      FROM follows f
      JOIN users u ON f.follower_id = u.id
      WHERE f.following_id = $1
      ORDER BY f.created_at DESC`,
      [req.user.id]
    );
    
    res.json({ followers: result.rows });
  } catch (error) {
    console.error('Get followers error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get following
router.get('/following', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT 
        u.id, u.full_name, u.email, u.account_type, u.bio, u.avatar_url,
        f.created_at as followed_at
      FROM follows f
      JOIN users u ON f.following_id = u.id
      WHERE f.follower_id = $1
      ORDER BY f.created_at DESC`,
      [req.user.id]
    );
    
    res.json({ following: result.rows });
  } catch (error) {
    console.error('Get following error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Check if following a user
router.get('/status/:userId', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM follows WHERE follower_id = $1 AND following_id = $2',
      [req.user.id, req.params.userId]
    );
    
    res.json({ isFollowing: result.rows.length > 0 });
  } catch (error) {
    console.error('Check follow status error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get user's followers and following counts
router.get('/counts/:userId', async (req, res) => {
  try {
    const followersResult = await pool.query(
      'SELECT COUNT(*) as count FROM follows WHERE following_id = $1',
      [req.params.userId]
    );
    
    const followingResult = await pool.query(
      'SELECT COUNT(*) as count FROM follows WHERE follower_id = $1',
      [req.params.userId]
    );
    
    res.json({
      followers: parseInt(followersResult.rows[0].count),
      following: parseInt(followingResult.rows[0].count)
    });
  } catch (error) {
    console.error('Get follow counts error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
// Get followers of a specific userId
router.get('/:userId/followers', authenticateToken, async (req, res) => {
  try {
    const targetUserId = parseInt(req.params.userId, 10);
    if (Number.isNaN(targetUserId)) {
      return res.status(400).json({ message: 'Invalid userId' });
    }

    const result = await pool.query(
      `SELECT 
        u.id, u.full_name, u.email, u.account_type, u.bio, u.avatar_url,
        f.created_at as followed_at
      FROM follows f
      JOIN users u ON f.follower_id = u.id
      WHERE f.following_id = $1
      ORDER BY f.created_at DESC`,
      [targetUserId]
    );

    // Return array for ease of use on client
    res.json(result.rows);
  } catch (error) {
    console.error('Get followers by user error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get following list of a specific userId
router.get('/:userId/following', authenticateToken, async (req, res) => {
  try {
    const targetUserId = parseInt(req.params.userId, 10);
    if (Number.isNaN(targetUserId)) {
      return res.status(400).json({ message: 'Invalid userId' });
    }

    const result = await pool.query(
      `SELECT 
        u.id, u.full_name, u.email, u.account_type, u.bio, u.avatar_url,
        f.created_at as followed_at
      FROM follows f
      JOIN users u ON f.following_id = u.id
      WHERE f.follower_id = $1
      ORDER BY f.created_at DESC`,
      [targetUserId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Get following by user error:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

