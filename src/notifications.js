const db = require('./db');

async function createNotifications({ recipientUserIds, type, prayerRequestId, text, actorUserId }) {
  const uniqueRecipients = [...new Set(recipientUserIds)].filter((userId) => userId && userId !== actorUserId);

  if (uniqueRecipients.length === 0) {
    return [];
  }

  const values = [];
  const params = [];

  uniqueRecipients.forEach((userId, index) => {
    const base = index * 4;
    values.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4})`);
    params.push(userId, type, prayerRequestId, text);
  });

  const query = `
    INSERT INTO notifications (to_user_id, type, prayer_request_id, text)
    VALUES ${values.join(', ')}
    RETURNING id, to_user_id, type, prayer_request_id, text, is_read, created_at
  `;

  const { rows } = await db.query(query, params);

  await Promise.all([
    sendEmailStub(rows),
    sendPushStub(rows)
  ]);

  return rows;
}

async function sendEmailStub() {
  return;
}

async function sendPushStub() {
  return;
}

module.exports = {
  createNotifications
};
