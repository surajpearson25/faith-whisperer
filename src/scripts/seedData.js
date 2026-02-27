const bcrypt = require('bcryptjs');
const { pool } = require('../db');

const demoUsers = [
  { email: 'mary@faithwhisperer.app', volunteeredToPray: true },
  { email: 'john@faithwhisperer.app', volunteeredToPray: true },
  { email: 'esther@faithwhisperer.app', volunteeredToPray: false }
];

const DEMO_PASSWORD = 'Password123!';
const RANDOM_PRAYER_COUNT = 5;

const randomPrayerTemplates = [
  {
    title: 'Guidance in a decision',
    body: 'Please pray for clarity and wisdom as I choose between two job opportunities.'
  },
  {
    title: 'Family unity',
    body: 'Please pray for reconciliation and peace in our family conversations.'
  },
  {
    title: 'Health and strength',
    body: 'Please pray for healing and renewed strength during this recovery season.'
  },
  {
    title: 'Financial provision',
    body: 'Please pray for God’s provision as we manage urgent household expenses.'
  },
  {
    title: 'Peace over anxiety',
    body: 'Please pray for calm, steady faith, and restful sleep this week.'
  },
  {
    title: 'Workplace favor',
    body: 'Please pray for grace, favor, and good relationships at work.'
  },
  {
    title: 'Safe travel',
    body: 'Please pray for safe flights and health during upcoming travel.'
  },
  {
    title: 'Spiritual growth',
    body: 'Please pray that I stay disciplined in prayer and Scripture daily.'
  }
];

const randomResponseMessages = [
  'Praying for wisdom and peace in this season.',
  'Standing with you in prayer today.',
  'Praying for strength and open doors.',
  'Lifting this up and believing for breakthrough.',
  'Praying God gives you peace and direction.'
];

const randomUpdateMessages = [
  'Thank you for praying. I have started seeing progress.',
  'I appreciate everyone’s support and prayers.',
  'Small breakthrough today. Grateful for your prayers.',
  'Please continue praying, I am feeling encouraged.'
];

function pickRandom(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function pickRandomSubset(items, count) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy.slice(0, count);
}

async function seed() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const emails = demoUsers.map((user) => user.email);
    await client.query('DELETE FROM users WHERE email = ANY($1::text[])', [emails]);

    const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);

    const userMap = {};
    for (const user of demoUsers) {
      const { rows } = await client.query(
        `INSERT INTO users (email, password_hash, volunteered_to_pray)
         VALUES ($1, $2, $3)
         RETURNING id, email`,
        [user.email, passwordHash, user.volunteeredToPray]
      );
      userMap[user.email] = rows[0].id;
    }

    const maryId = userMap['mary@faithwhisperer.app'];
    const johnId = userMap['john@faithwhisperer.app'];
    const estherId = userMap['esther@faithwhisperer.app'];

    const openPrayer1 = await client.query(
      `INSERT INTO prayer_requests (requester_user_id, title, body, status)
       VALUES ($1, $2, $3, 'OPEN')
       RETURNING id`,
      [maryId, 'Healing & peace', 'Please pray for my mom’s recovery and peace for our family this week.']
    );

    const openPrayer2 = await client.query(
      `INSERT INTO prayer_requests (requester_user_id, title, body, status)
       VALUES ($1, $2, $3, 'OPEN')
       RETURNING id`,
      [johnId, 'Job interview', 'Please pray for wisdom and confidence for my interview tomorrow.']
    );

    const closedPrayer = await client.query(
      `INSERT INTO prayer_requests (requester_user_id, title, body, status, closed_at)
       VALUES ($1, $2, $3, 'CLOSED', NOW() - INTERVAL '1 day')
       RETURNING id`,
      [estherId, 'Travel safety', 'Please pray for safe travel and health during my trip.']
    );

    const openPrayer1Id = openPrayer1.rows[0].id;
    const openPrayer2Id = openPrayer2.rows[0].id;
    const closedPrayerId = closedPrayer.rows[0].id;

    await client.query(
      `INSERT INTO prayer_responses (prayer_request_id, from_user_id, response_type, message)
       VALUES
         ($1, $2, 'MESSAGE', $3),
         ($1, $4, 'QUICK', NULL),
         ($5, $6, 'MESSAGE', $7),
         ($8, $2, 'MESSAGE', $9),
         ($8, $6, 'QUICK', NULL)`,
      [
        openPrayer1Id,
        johnId,
        'Praying for strength and comfort for your family.',
        estherId,
        openPrayer2Id,
        maryId,
        'Praying that you speak clearly and walk in favor.',
        closedPrayerId,
        'Thankful this went well. Praying continued peace.'
      ]
    );

    await client.query(
      `INSERT INTO prayer_updates (prayer_request_id, from_user_id, body)
       VALUES
         ($1, $2, $3),
         ($4, $5, $6),
         ($7, $8, $9)`,
      [
        openPrayer1Id,
        maryId,
        'Thank you all. She has started treatment and we are hopeful.',
        openPrayer2Id,
        johnId,
        'Interview completed today. Thank you for your prayers.',
        closedPrayerId,
        estherId,
        'Trip completed safely. Grateful for everyone praying.'
      ]
    );

    await client.query(
      `INSERT INTO notifications (to_user_id, type, prayer_request_id, text, is_read)
       VALUES
         ($1, 'NEW_PRAYER_REQUEST', $2, $3, FALSE),
         ($4, 'PRAYER_RESPONSE', $2, $5, FALSE),
         ($6, 'PRAYER_UPDATE', $2, $7, FALSE),
         ($4, 'PRAYER_CLOSED', $8, $9, FALSE),
         ($1, 'PRAYER_CLOSED', $8, $9, TRUE)`,
      [
        johnId,
        openPrayer1Id,
        'Healing & peace: Please pray for my mom’s recovery and peace for our family this week.',
        maryId,
        'Someone is praying for you: Praying for strength and comfort for your family.',
        estherId,
        'Prayer request update: Thank you all. She has started treatment and we are hopeful.',
        closedPrayerId,
        'A prayer request you supported has been closed.'
      ]
    );

    const allUserIds = [maryId, johnId, estherId];

    for (let index = 0; index < RANDOM_PRAYER_COUNT; index += 1) {
      const template = pickRandom(randomPrayerTemplates);
      const requesterId = pickRandom(allUserIds);
      const status = Math.random() < 0.8 ? 'OPEN' : 'CLOSED';

      const createdPrayer = await client.query(
        `INSERT INTO prayer_requests (requester_user_id, title, body, status, closed_at)
         VALUES (
           $1,
           $2,
           $3,
           $4,
           CASE WHEN $4 = 'CLOSED' THEN NOW() - ($5::INT || ' hours')::INTERVAL ELSE NULL END
         )
         RETURNING id, requester_user_id, status`,
        [
          requesterId,
          template.title,
          template.body,
          status,
          Math.floor(Math.random() * 48) + 1
        ]
      );

      const prayer = createdPrayer.rows[0];
      const otherUsers = allUserIds.filter((userId) => userId !== prayer.requester_user_id);
      const responderCount = Math.floor(Math.random() * otherUsers.length) + 1;
      const responders = pickRandomSubset(otherUsers, responderCount);

      for (const responderId of responders) {
        const hasMessage = Math.random() < 0.7;
        const responseType = hasMessage ? 'MESSAGE' : 'QUICK';
        const message = hasMessage ? pickRandom(randomResponseMessages) : null;

        await client.query(
          `INSERT INTO prayer_responses (prayer_request_id, from_user_id, response_type, message)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (prayer_request_id, from_user_id) DO NOTHING`,
          [prayer.id, responderId, responseType, message]
        );
      }

      if (prayer.status === 'OPEN' && Math.random() < 0.6) {
        await client.query(
          `INSERT INTO prayer_updates (prayer_request_id, from_user_id, body)
           VALUES ($1, $2, $3)`,
          [prayer.id, prayer.requester_user_id, pickRandom(randomUpdateMessages)]
        );
      }
    }

    await client.query('COMMIT');

    console.log('Seed data inserted successfully.');
    console.log(`Random prayer requests added: ${RANDOM_PRAYER_COUNT}`);
    console.log('Demo users (password for all):', DEMO_PASSWORD);
    for (const user of demoUsers) {
      console.log(`- ${user.email} (volunteeredToPray=${user.volunteeredToPray})`);
    }
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Failed to seed data:', error);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
