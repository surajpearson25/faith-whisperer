const path = require('path');
const express = require('express');
const helmet = require('helmet');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');
const db = require('./db');
const { signToken, requireAuth } = require('./auth');
const { createNotifications } = require('./notifications');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(helmet());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

function sanitizePrayerRequestRow(row) {
  return {
    id: row.id,
    requesterUserId: row.requester_user_id,
    requesterEmail: row.requester_email,
    title: row.title,
    body: row.body,
    status: row.status,
    createdAt: row.created_at,
    closedAt: row.closed_at,
    prayingCount: Number(row.praying_count || 0)
  };
}

app.post('/auth/register', async (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password || password.length < 8) {
    return res.status(400).json({ error: 'Email and password (min 8 chars) are required' });
  }

  const normalizedEmail = String(email).trim().toLowerCase();

  try {
    const existing = await db.query('SELECT id FROM users WHERE email = $1', [normalizedEmail]);
    if (existing.rowCount > 0) {
      return res.status(409).json({ error: 'Email already in use' });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const { rows } = await db.query(
      `INSERT INTO users (email, password_hash)
       VALUES ($1, $2)
       RETURNING id, email, volunteered_to_pray, created_at`,
      [normalizedEmail, passwordHash]
    );

    const user = rows[0];
    const token = signToken(user);

    return res.status(201).json({
      token,
      user: {
        id: user.id,
        email: user.email,
        volunteeredToPray: user.volunteered_to_pray,
        createdAt: user.created_at
      }
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to register user' });
  }
});

app.post('/auth/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    const normalizedEmail = String(email).trim().toLowerCase();
    const { rows } = await db.query(
      'SELECT id, email, password_hash, volunteered_to_pray, created_at FROM users WHERE email = $1',
      [normalizedEmail]
    );

    if (rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = rows[0];
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = signToken(user);
    return res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        volunteeredToPray: user.volunteered_to_pray,
        createdAt: user.created_at
      }
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to login' });
  }
});

app.post('/auth/logout', (req, res) => {
  return res.status(200).json({ success: true });
});

app.get('/me', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT id, email, volunteered_to_pray, created_at FROM users WHERE id = $1',
      [req.auth.userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = rows[0];
    return res.json({
      id: user.id,
      email: user.email,
      volunteeredToPray: user.volunteered_to_pray,
      createdAt: user.created_at
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to load user' });
  }
});

app.patch('/me', requireAuth, async (req, res) => {
  const { volunteeredToPray } = req.body || {};
  if (typeof volunteeredToPray !== 'boolean') {
    return res.status(400).json({ error: 'volunteeredToPray must be boolean' });
  }

  try {
    const { rows } = await db.query(
      `UPDATE users
       SET volunteered_to_pray = $2
       WHERE id = $1
       RETURNING id, email, volunteered_to_pray, created_at`,
      [req.auth.userId, volunteeredToPray]
    );

    const user = rows[0];
    return res.json({
      id: user.id,
      email: user.email,
      volunteeredToPray: user.volunteered_to_pray,
      createdAt: user.created_at
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to update settings' });
  }
});

app.post('/prayers', requireAuth, async (req, res) => {
  const { title, body } = req.body || {};

  if (!body || !String(body).trim()) {
    return res.status(400).json({ error: 'Prayer text is required' });
  }

  const cleanTitle = title ? String(title).trim() : null;
  const cleanBody = String(body).trim();

  try {
    const prayerResult = await db.query(
      `INSERT INTO prayer_requests (requester_user_id, title, body, status)
       VALUES ($1, $2, $3, 'OPEN')
       RETURNING id, requester_user_id, title, body, status, created_at, closed_at`,
      [req.auth.userId, cleanTitle, cleanBody]
    );

    const prayer = prayerResult.rows[0];

    const volunteerResult = await db.query(
      `SELECT id FROM users
       WHERE volunteered_to_pray = TRUE AND id <> $1`,
      [req.auth.userId]
    );

    await createNotifications({
      recipientUserIds: volunteerResult.rows.map((row) => row.id),
      type: 'NEW_PRAYER_REQUEST',
      prayerRequestId: prayer.id,
      text: `${cleanTitle || 'New prayer request'}: ${cleanBody.slice(0, 120)}`,
      actorUserId: req.auth.userId
    });

    return res.status(201).json({
      id: prayer.id,
      requesterUserId: prayer.requester_user_id,
      title: prayer.title,
      body: prayer.body,
      status: prayer.status,
      createdAt: prayer.created_at,
      closedAt: prayer.closed_at,
      prayingCount: 0
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to create prayer request' });
  }
});

app.get('/prayers', requireAuth, async (req, res) => {
  const includeClosed = req.query.includeClosed === 'true';

  try {
    const values = [];
    let statusClause = '';

    if (!includeClosed) {
      values.push('OPEN');
      statusClause = 'WHERE pr.status = $1';
    }

    const { rows } = await db.query(
      `SELECT
          pr.id,
          pr.requester_user_id,
          u.email AS requester_email,
          pr.title,
          pr.body,
          pr.status,
          pr.created_at,
          pr.closed_at,
          COUNT(DISTINCT pres.from_user_id)::INT AS praying_count
       FROM prayer_requests pr
       JOIN users u ON u.id = pr.requester_user_id
       LEFT JOIN prayer_responses pres ON pres.prayer_request_id = pr.id
       ${statusClause}
       GROUP BY pr.id, u.email
       ORDER BY CASE WHEN pr.status = 'OPEN' THEN 0 ELSE 1 END, pr.created_at DESC`,
      values
    );

    return res.json(rows.map(sanitizePrayerRequestRow));
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to load prayers' });
  }
});

app.get('/prayers/:id', requireAuth, async (req, res) => {
  try {
    const prayerResult = await db.query(
      `SELECT
          pr.id,
          pr.requester_user_id,
          u.email AS requester_email,
          pr.title,
          pr.body,
          pr.status,
          pr.created_at,
          pr.closed_at,
          COUNT(DISTINCT pres.from_user_id)::INT AS praying_count
       FROM prayer_requests pr
       JOIN users u ON u.id = pr.requester_user_id
       LEFT JOIN prayer_responses pres ON pres.prayer_request_id = pr.id
       WHERE pr.id = $1
       GROUP BY pr.id, u.email`,
      [req.params.id]
    );

    if (prayerResult.rows.length === 0) {
      return res.status(404).json({ error: 'Prayer request not found' });
    }

    const prayer = sanitizePrayerRequestRow(prayerResult.rows[0]);

    const [responsesResult, updatesResult, userResponseResult] = await Promise.all([
      db.query(
        `SELECT
            pres.id,
            pres.from_user_id,
            u.email AS from_user_email,
            pres.response_type,
            pres.message,
            pres.created_at
         FROM prayer_responses pres
         JOIN users u ON u.id = pres.from_user_id
         WHERE pres.prayer_request_id = $1
         ORDER BY pres.created_at ASC`,
        [req.params.id]
      ),
      db.query(
        `SELECT
            pu.id,
            pu.from_user_id,
            u.email AS from_user_email,
            pu.body,
            pu.created_at
         FROM prayer_updates pu
         JOIN users u ON u.id = pu.from_user_id
         WHERE pu.prayer_request_id = $1
         ORDER BY pu.created_at ASC`,
        [req.params.id]
      ),
      db.query(
        `SELECT id
         FROM prayer_responses
         WHERE prayer_request_id = $1 AND from_user_id = $2`,
        [req.params.id, req.auth.userId]
      )
    ]);

    return res.json({
      ...prayer,
      alreadyPraying: userResponseResult.rows.length > 0,
      responses: responsesResult.rows.map((row) => ({
        id: row.id,
        fromUserId: row.from_user_id,
        fromUserEmail: row.from_user_email,
        type: row.response_type,
        message: row.message,
        createdAt: row.created_at
      })),
      updates: updatesResult.rows.map((row) => ({
        id: row.id,
        fromUserId: row.from_user_id,
        fromUserEmail: row.from_user_email,
        body: row.body,
        createdAt: row.created_at
      }))
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to load prayer details' });
  }
});

app.post('/prayers/:id/respond', requireAuth, async (req, res) => {
  const { message } = req.body || {};
  const cleanMessage = message ? String(message).trim() : '';
  const responseType = cleanMessage ? 'MESSAGE' : 'QUICK';

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    const prayerResult = await client.query(
      'SELECT id, requester_user_id, status, title FROM prayer_requests WHERE id = $1 FOR UPDATE',
      [req.params.id]
    );

    if (prayerResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Prayer request not found' });
    }

    const prayer = prayerResult.rows[0];

    if (prayer.status !== 'OPEN') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Prayer request is closed' });
    }

    if (prayer.requester_user_id === req.auth.userId) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'You cannot respond to your own prayer request' });
    }

    const duplicateResult = await client.query(
      'SELECT id FROM prayer_responses WHERE prayer_request_id = $1 AND from_user_id = $2',
      [req.params.id, req.auth.userId]
    );

    if (duplicateResult.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'You are already praying for this request' });
    }

    const responseResult = await client.query(
      `INSERT INTO prayer_responses (prayer_request_id, from_user_id, response_type, message)
       VALUES ($1, $2, $3, $4)
       RETURNING id, prayer_request_id, from_user_id, response_type, message, created_at`,
      [req.params.id, req.auth.userId, responseType, cleanMessage || null]
    );

    await client.query('COMMIT');

    await createNotifications({
      recipientUserIds: [prayer.requester_user_id],
      type: 'PRAYER_RESPONSE',
      prayerRequestId: req.params.id,
      text: cleanMessage
        ? `Someone is praying for you: ${cleanMessage.slice(0, 120)}`
        : 'Someone clicked “I am praying for you.”',
      actorUserId: req.auth.userId
    });

    const response = responseResult.rows[0];
    return res.status(201).json({
      id: response.id,
      prayerRequestId: response.prayer_request_id,
      fromUserId: response.from_user_id,
      type: response.response_type,
      message: response.message,
      createdAt: response.created_at
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error(error);
    return res.status(500).json({ error: 'Failed to respond to prayer request' });
  } finally {
    client.release();
  }
});

app.post('/prayers/:id/updates', requireAuth, async (req, res) => {
  const { body } = req.body || {};
  if (!body || !String(body).trim()) {
    return res.status(400).json({ error: 'Update body is required' });
  }

  const cleanBody = String(body).trim();

  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    const prayerResult = await client.query(
      'SELECT id, requester_user_id, status FROM prayer_requests WHERE id = $1 FOR UPDATE',
      [req.params.id]
    );

    if (prayerResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Prayer request not found' });
    }

    const prayer = prayerResult.rows[0];

    if (prayer.requester_user_id !== req.auth.userId) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Only requester can post updates' });
    }

    if (prayer.status !== 'OPEN') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Cannot post updates to a closed request' });
    }

    const updateResult = await client.query(
      `INSERT INTO prayer_updates (prayer_request_id, from_user_id, body)
       VALUES ($1, $2, $3)
       RETURNING id, prayer_request_id, from_user_id, body, created_at`,
      [req.params.id, req.auth.userId, cleanBody]
    );

    const subscribersResult = await client.query(
      `SELECT DISTINCT from_user_id AS user_id
       FROM prayer_responses
       WHERE prayer_request_id = $1`,
      [req.params.id]
    );

    await client.query('COMMIT');

    await createNotifications({
      recipientUserIds: subscribersResult.rows.map((row) => row.user_id),
      type: 'PRAYER_UPDATE',
      prayerRequestId: req.params.id,
      text: `Prayer request update: ${cleanBody.slice(0, 120)}`,
      actorUserId: req.auth.userId
    });

    const update = updateResult.rows[0];
    return res.status(201).json({
      id: update.id,
      prayerRequestId: update.prayer_request_id,
      fromUserId: update.from_user_id,
      body: update.body,
      createdAt: update.created_at
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error(error);
    return res.status(500).json({ error: 'Failed to post update' });
  } finally {
    client.release();
  }
});

app.post('/prayers/:id/close', requireAuth, async (req, res) => {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');

    const prayerResult = await client.query(
      'SELECT id, requester_user_id, status FROM prayer_requests WHERE id = $1 FOR UPDATE',
      [req.params.id]
    );

    if (prayerResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Prayer request not found' });
    }

    const prayer = prayerResult.rows[0];

    if (prayer.requester_user_id !== req.auth.userId) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Only requester can close this prayer request' });
    }

    if (prayer.status === 'CLOSED') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Prayer request is already closed' });
    }

    const closedResult = await client.query(
      `UPDATE prayer_requests
       SET status = 'CLOSED', closed_at = NOW()
       WHERE id = $1
       RETURNING id, requester_user_id, title, body, status, created_at, closed_at`,
      [req.params.id]
    );

    const subscribersResult = await client.query(
      `SELECT DISTINCT from_user_id AS user_id
       FROM prayer_responses
       WHERE prayer_request_id = $1`,
      [req.params.id]
    );

    await client.query('COMMIT');

    await createNotifications({
      recipientUserIds: subscribersResult.rows.map((row) => row.user_id),
      type: 'PRAYER_CLOSED',
      prayerRequestId: req.params.id,
      text: 'A prayer request you supported has been closed.',
      actorUserId: req.auth.userId
    });

    const closedPrayer = closedResult.rows[0];
    return res.json({
      id: closedPrayer.id,
      requesterUserId: closedPrayer.requester_user_id,
      title: closedPrayer.title,
      body: closedPrayer.body,
      status: closedPrayer.status,
      createdAt: closedPrayer.created_at,
      closedAt: closedPrayer.closed_at
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error(error);
    return res.status(500).json({ error: 'Failed to close prayer request' });
  } finally {
    client.release();
  }
});

app.get('/notifications', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT id, to_user_id, type, prayer_request_id, text, is_read, created_at
       FROM notifications
       WHERE to_user_id = $1
       ORDER BY created_at DESC`,
      [req.auth.userId]
    );

    return res.json(
      rows.map((row) => ({
        id: row.id,
        toUserId: row.to_user_id,
        type: row.type,
        prayerRequestId: row.prayer_request_id,
        text: row.text,
        isRead: row.is_read,
        createdAt: row.created_at
      }))
    );
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to load notifications' });
  }
});

app.post('/notifications/:id/read', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query(
      `UPDATE notifications
       SET is_read = TRUE
       WHERE id = $1 AND to_user_id = $2
       RETURNING id, to_user_id, type, prayer_request_id, text, is_read, created_at`,
      [req.params.id, req.auth.userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    const notification = rows[0];
    return res.json({
      id: notification.id,
      toUserId: notification.to_user_id,
      type: notification.type,
      prayerRequestId: notification.prayer_request_id,
      text: notification.text,
      isRead: notification.is_read,
      createdAt: notification.created_at
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to mark notification as read' });
  }
});

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.listen(PORT, () => {
  console.log(`Faith Whisperer running on http://localhost:${PORT}`);
});
