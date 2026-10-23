import test from 'node:test';
import assert from 'node:assert/strict';
import { checkChallenge, answerChallenge, challengeReply } from '../lib/challenge.mjs';
const offers = [1, 2].map((id) => ({
  offer_id: String(id),
  name: 'Shop ' + id,
  price: id * 100,
  opening: { state: 'open' },
}));
test('challenge confirmation and no-answer branches are explicit and stable', () => {
  const confirmed = checkChallenge(offers, '1', null, () => 0);
  assert.equal(confirmed.status, 'confirmed');
  assert.equal(confirmed.price, 100);
  assert.equal(confirmed.simulated, true);
  assert.match(challengeReply(confirmed).text, /شبیه‌سازی/);
  assert.equal(
    checkChallenge(offers, '1', confirmed, () => 1),
    confirmed,
  );
  const unanswered = checkChallenge(offers, '1', null, () => 1);
  assert.equal(unanswered.status, 'no_answer');
  assert.equal(challengeReply(unanswered).questions.length, 1);
  assert.equal(answerChallenge(offers, unanswered, false).status, 'declined');
  const next = answerChallenge(offers, unanswered, true, () => 1);
  assert.equal(next.offerId, '2');
  assert.equal(answerChallenge(offers, next, true).status, 'exhausted');
});
test('closed shops are not confirmed and a missing qualifying seller is explicit', () => {
  const closed = checkChallenge(
    [{ ...offers[0], opening: { state: 'closed' } }],
    '1',
    null,
    () => 0,
  );
  assert.equal(closed.status, 'closed');
  assert.equal(answerChallenge([], closed, true).status, 'exhausted');
  assert.throws(() => checkChallenge([], '1', null));
});
