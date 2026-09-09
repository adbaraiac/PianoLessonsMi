const { SNSClient, PublishCommand } = require('@aws-sdk/client-sns');

const sns = new SNSClient({});

async function sendSms(phoneNumber, message) {
  await sns.send(new PublishCommand({
    PhoneNumber: phoneNumber,
    Message: message,
  }));
}

async function publishToTopic(topicArn, subject, message) {
  await sns.send(new PublishCommand({
    TopicArn: topicArn,
    Subject: subject.slice(0, 100), // SNS enforces a 100-char subject limit
    Message: message,
  }));
}

module.exports = { sendSms, publishToTopic };
