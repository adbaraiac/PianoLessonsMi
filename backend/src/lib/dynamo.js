const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');

const client = new DynamoDBClient({});
const doc = DynamoDBDocumentClient.from(client);

module.exports = { doc, GetCommand, PutCommand, UpdateCommand };
