# Piano Lessons booking backend

Serverless backend for the booking form on [pianolessonsmi.com](https://pianolessonsmi.com): when a parent submits the form, this stores the lead and texts Aiden automatically via AWS SNS. Aiden keeps assigning teachers and handling sensitive conversations (displacement, price changes) personally by text, exactly as today — the only new step is a private link in the notification text where he logs the outcome, which keeps a simple slot/capacity count accurate.

See the plan this was built from for full context on scope and the displacement-flow logic: it's saved in this session's plan file.

## What's in here

- `template.yaml` — AWS SAM template: HTTP API, 2 Lambda functions, 2 DynamoDB tables, SNS permissions
- `src/submitLead.js` — handles `POST /leads` (the booking form's submission)
- `src/leadStatusPage.js` — handles `GET/POST /leads/{id}` (the tap-link page Aiden uses to log outcomes)
- `src/lib/` — shared config (teacher list, status options) and small SDK wrappers
- `local-test.js` — a from-scratch logic test with no AWS dependency (see "Testing without AWS" below)

## One-time setup

1. **Rotate any credentials you've shared anywhere insecurely.** Never paste AWS passwords or access keys into a chat — use `aws configure` in your own terminal instead.
2. Get an **IAM access key** (not your console password): AWS Console → IAM → Users → your user → Security credentials tab → "Create access key" → choose "Command Line Interface (CLI)".
3. In your own terminal: `aws configure` — paste the access key ID and secret, set your default region (e.g. `us-east-1`), and `json` as output format.
4. Confirm it worked: `aws sts get-caller-identity` should print your account/user info.
5. Install the SAM CLI if you don't have it: `pip install aws-sam-cli` (or the [official installer](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html) if you'd rather not use pip on Windows).

## Deploy

```bash
cd backend
sam build
sam deploy --guided
```

`sam deploy --guided` will ask a few questions the first time (stack name, region, and it'll prompt for the `AidenPhoneNumber` and `AllowedOrigin` parameters — defaults are already set to Aiden's number and pianolessonsmi.com, so hitting enter is usually fine). It saves your answers to `samconfig.toml` so future deploys are just `sam deploy`.

When it finishes, copy the `ApiUrl` value from the output and paste it into [templatemo-personal-javascripts.js](../templatemo-personal-javascripts.js) as `LEADS_API_URL` near the top of the file. Until you do that, the booking form keeps using its existing tap-to-text/email fallback — nothing breaks either way.

## Important: SNS SMS sandbox mode

New AWS accounts start in SNS's **SMS sandbox**, which can only send texts to phone numbers you've manually verified. Until you request production access, test notifications will only reach numbers you've added:

- AWS Console → SNS → Text messaging (SMS) → Sandbox destination phone numbers → add and verify Aiden's number (and any test numbers you use) via the code AWS texts to it.
- To send to any parent's number (required for this to be useful in production), request to move out of the sandbox: SNS console → Text messaging (SMS) → "Exit SMS sandbox" → submit the request. AWS typically reviews this within a day or so.

## Testing without AWS

`node local-test.js` runs the actual Lambda handler code against an in-memory fake DynamoDB/SNS — no AWS account needed. Useful after any change to the handlers, especially the displacement-flow slot math in `leadStatusPage.js`. Run it from the `backend/` directory:

```bash
node local-test.js
```

## Using it day to day

1. Parent submits the form → you get a text with their details and a link.
2. You handle scheduling/teacher assignment exactly as you do today — text the teacher yourself.
3. Tap the link in the notification once you know the outcome, and log it: which teacher, and a status (Booked / Waitlisted / Didn't book / or one of the displacement outcomes if this booking bumped an existing family). That's the only new step — it's bookkeeping, not a replacement for the actual conversations.
4. For the Josh-displacement pattern specifically: when you give a new family a trial by bumping an existing Saturday family for one week, mark that lead `displacement_pending` and jot a note (e.g. "bumped the Smith family"). Once it's resolved, come back to the same link and set it to whichever actually happened — "legacy family paid & kept their slot" or "legacy family declined, this family gets it." The slot count only updates on that final outcome, not the pending step.

## Cost

At your volume, expect low single-digit dollars per month: Lambda/API Gateway/DynamoDB all fall well within AWS's free tier at this scale, and SNS SMS runs roughly $0.0065–0.02 per text in the US.
