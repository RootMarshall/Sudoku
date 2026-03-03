import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);
const TABLE_NAME = process.env.TABLE_NAME || 'SudokuDailyCompletions';

function getUserId(event) {
  const claims = event.requestContext?.authorizer?.claims;
  if (!claims || !claims.sub) {
    throw new Error('Unauthorized');
  }
  return claims.sub;
}

export async function handler(event) {
  const method = event.httpMethod;
  const userId = getUserId(event);

  if (method === 'PUT') {
    const body = JSON.parse(event.body || '{}');
    const { date, difficulty, time, nickname, lives } = body;
    if (!date || difficulty == null || time == null) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'Missing required fields: date, difficulty, time' }),
      };
    }

    const item = {
      userId,
      date: String(date),
      difficulty: String(difficulty),
      time: Number(time),
      nickname: nickname || '',
      lives: lives != null ? Number(lives) : null,
    };
    if (item.lives == null) delete item.lives;

    await docClient.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: item,
    }));

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ ok: true }),
    };
  }

  if (method === 'GET') {
    const date = event.queryStringParameters?.date;
    const leaderboard = event.queryStringParameters?.leaderboard === 'true';
    if (!date) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: 'Missing date query parameter' }),
      };
    }

    if (leaderboard) {
      const result = await docClient.send(new ScanCommand({
        TableName: TABLE_NAME,
        FilterExpression: '#d = :date',
        ExpressionAttributeNames: { '#d': 'date' },
        ExpressionAttributeValues: { ':date': String(date) },
      }));

      const items = (result.Items || [])
        .map((item) => ({
          nickname: item.nickname || 'Anonymous',
          difficulty: item.difficulty,
          time: item.time,
          lives: item.lives,
        }))
        .sort((a, b) => a.time - b.time);

      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ date, leaderboard: items }),
      };
    }

    const result = await docClient.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: {
        userId,
        date: String(date),
      },
    }));

    const item = result.Item;
    if (!item) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify(null),
      };
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({
        date: item.date,
        difficulty: item.difficulty,
        time: item.time,
        nickname: item.nickname || '',
        lives: item.lives,
      }),
    };
  }

  return {
    statusCode: 405,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify({ error: 'Method not allowed' }),
  };
}
