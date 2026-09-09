// Lightweight local logic check - no AWS account/credentials needed.
// Monkey-patches the DynamoDB/SNS SDK clients with an in-memory fake so we
// can exercise the Lambda handlers' actual logic (validation, status
// transitions, slot-count math) before ever touching real AWS.

process.env.LEADS_TABLE = 'Leads';
process.env.SLOTS_TABLE = 'Slots';
process.env.AIDEN_PHONE = '+15555550100';
process.env.NOTIFICATION_TOPIC_ARN = 'arn:aws:sns:us-east-1:000000000000:fake-topic';

const path = require('path');
const dynamoLibPath = require.resolve('@aws-sdk/lib-dynamodb', { paths: [path.join(__dirname, 'src')] });
const snsLibPath = require.resolve('@aws-sdk/client-sns', { paths: [path.join(__dirname, 'src')] });

const dynamodb = require(dynamoLibPath);
const sns = require(snsLibPath);

const fakeTables = { Leads: new Map(), Slots: new Map() };
const smsLog = [];

dynamodb.DynamoDBDocumentClient.from = () => ({
  send: async (command) => {
    const table = fakeTables[command.input.TableName];
    if (command instanceof dynamodb.PutCommand) {
      table.set(command.input.Item.id, command.input.Item);
      return {};
    }
    if (command instanceof dynamodb.GetCommand) {
      const key = Object.values(command.input.Key)[0];
      return { Item: table.get(key) };
    }
    if (command instanceof dynamodb.UpdateCommand) {
      const key = Object.values(command.input.Key)[0];
      const existing = table.get(key) || {};
      const values = command.input.ExpressionAttributeValues;
      if (command.input.UpdateExpression.includes('booked = if_not_exists')) {
        existing.booked = (existing.booked ?? 0) + values[':delta'];
        existing.capacity = existing.capacity ?? values[':defaultCap'];
      } else {
        existing.status = values[':status'];
        existing.assignedTeacher = values[':teacher'];
        existing.displacementNote = values[':note'];
      }
      table.set(key, existing);
      return {};
    }
    throw new Error('Unhandled command in fake: ' + command.constructor.name);
  },
});

class FakeSNSClient { send(command) { smsLog.push(command.input); return Promise.resolve({}); } }
sns.SNSClient = FakeSNSClient;

const submitLead = require('./src/submitLead');
const leadStatusPage = require('./src/leadStatusPage');

let passed = 0, failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; console.log('  ok - ' + msg); }
  else { failed++; console.error('  FAIL - ' + msg); }
}

async function main() {
  console.log('1) missing required fields -> 400');
  let res = await submitLead.handler({ requestContext: { domainName: 'example.execute-api.us-east-1.amazonaws.com' }, body: JSON.stringify({ parentName: 'Sarah' }) });
  assert(res.statusCode === 400, 'returns 400');

  console.log('2) honeypot filled -> 200, no DB write');
  res = await submitLead.handler({ requestContext: { domainName: 'example.execute-api.us-east-1.amazonaws.com' }, body: JSON.stringify({ website: 'http://spam.example', parentName: 'Bot', parentPhone: '1', childName: 'x', childAge: '5', area: 'a', day: 'saturday', time: 't' }) });
  assert(res.statusCode === 200, 'returns 200 (silent)');
  assert(fakeTables.Leads.size === 0, 'no lead written for honeypot submission');

  console.log('3) valid submission -> 200, lead stored, email + SMS both "sent"');
  res = await submitLead.handler({ requestContext: { domainName: 'example.execute-api.us-east-1.amazonaws.com' }, body: JSON.stringify({
    parentName: 'Sarah Johnson', parentPhone: '2485551234', childName: 'Emma', childAge: '7',
    favoriteSong: 'Let It Go', area: 'Troy — near Long Lake / John R / Rochester Rd', day: 'saturday', time: 'Morning (9am–12pm)',
  }) });
  const body = JSON.parse(res.body);
  assert(res.statusCode === 200 && body.ok, 'returns 200 ok');
  assert(fakeTables.Leads.size === 1, 'lead written to fake table');
  const emailPublish = smsLog.find((m) => m.TopicArn);
  const smsPublish = smsLog.find((m) => m.PhoneNumber);
  assert(emailPublish && emailPublish.TopicArn === 'arn:aws:sns:us-east-1:000000000000:fake-topic', 'notification published to email topic');
  assert(emailPublish && emailPublish.Message.includes('Emma'), 'email body includes child name');
  assert(smsPublish && smsPublish.PhoneNumber === '+15555550100', 'SMS also published to Aiden\'s number');
  assert(smsPublish && smsPublish.Message.includes('Emma'), 'SMS body includes child name');
  const leadId = body.id;
  const lead = fakeTables.Leads.get(leadId);
  const token = lead.token;

  console.log('4) status page with wrong token -> 404');
  res = await leadStatusPage.handler({ pathParameters: { id: leadId }, requestContext: { http: { method: 'GET' } }, queryStringParameters: { token: 'wrong' } });
  assert(res.statusCode === 404, 'returns 404 for bad token');

  console.log('5) status page with correct token -> 200');
  res = await leadStatusPage.handler({ pathParameters: { id: leadId }, requestContext: { http: { method: 'GET' } }, queryStringParameters: { token } });
  assert(res.statusCode === 200 && res.body.includes('Emma'), 'renders lead details');

  console.log('6) assign Josh + status=booked -> slot count josh#saturday becomes 1');
  res = await leadStatusPage.handler({
    pathParameters: { id: leadId }, requestContext: { http: { method: 'POST' } }, queryStringParameters: { token },
    body: 'teacher=josh&status=booked&displacementNote=',
  });
  assert(res.statusCode === 200, 'POST returns 200');
  let slot = fakeTables.Slots.get('josh#saturday');
  assert(slot && slot.booked === 1, 'josh#saturday booked count is 1, got ' + JSON.stringify(slot));

  console.log('7) new lead used for displacement scenario');
  res = await submitLead.handler({ requestContext: { domainName: 'example.execute-api.us-east-1.amazonaws.com' }, body: JSON.stringify({
    parentName: 'Jason', parentPhone: '2485559999', childName: 'Max', childAge: '9',
    area: 'Troy — near Long Lake / John R / Rochester Rd', day: 'saturday', time: 'Afternoon (3–6pm)',
  }) });
  const lead2Id = JSON.parse(res.body).id;
  const lead2Token = fakeTables.Leads.get(lead2Id).token;

  console.log('8) lead2 marked displacement_pending (trial given, bumped legacy family) -> slot count unchanged (still 1)');
  await leadStatusPage.handler({
    pathParameters: { id: lead2Id }, requestContext: { http: { method: 'POST' } }, queryStringParameters: { token: lead2Token },
    body: 'teacher=josh&status=displacement_pending&displacementNote=bumped+the+Smith+family',
  });
  slot = fakeTables.Slots.get('josh#saturday');
  assert(slot.booked === 1, 'still 1 booked - pending displacement does not occupy a slot yet, got ' + slot.booked);

  console.log('9) legacy family declines -> displacement_slot_won -> slot count becomes 2');
  await leadStatusPage.handler({
    pathParameters: { id: lead2Id }, requestContext: { http: { method: 'POST' } }, queryStringParameters: { token: lead2Token },
    body: 'teacher=josh&status=displacement_slot_won&displacementNote=Smith+family+declined+new+rate',
  });
  slot = fakeTables.Slots.get('josh#saturday');
  assert(slot.booked === 2, 'josh#saturday booked count is 2 after this family wins the slot, got ' + slot.booked);

  console.log('10) alternate outcome: if legacy family had paid instead (displacement_slot_kept_by_legacy), slot count would NOT increment for the new family');
  // Re-run scenario 8 fresh with a third lead to check the other branch in isolation.
  res = await submitLead.handler({ requestContext: { domainName: 'example.execute-api.us-east-1.amazonaws.com' }, body: JSON.stringify({
    parentName: 'Dana', parentPhone: '2485557777', childName: 'Lily', childAge: '6',
    area: 'Troy — near Long Lake / John R / Rochester Rd', day: 'saturday', time: 'Evening (6–8pm)',
  }) });
  const lead3Id = JSON.parse(res.body).id;
  const lead3Token = fakeTables.Leads.get(lead3Id).token;
  await leadStatusPage.handler({ pathParameters: { id: lead3Id }, requestContext: { http: { method: 'POST' } }, queryStringParameters: { token: lead3Token }, body: 'teacher=josh&status=displacement_pending' });
  await leadStatusPage.handler({ pathParameters: { id: lead3Id }, requestContext: { http: { method: 'POST' } }, queryStringParameters: { token: lead3Token }, body: 'teacher=josh&status=displacement_slot_kept_by_legacy' });
  slot = fakeTables.Slots.get('josh#saturday');
  assert(slot.booked === 2, 'booked count stays 2 - legacy family kept the slot, new family did not gain one, got ' + slot.booked);

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => { console.error(err); process.exit(1); });
