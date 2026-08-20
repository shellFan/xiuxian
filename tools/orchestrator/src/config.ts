import path from 'path'; import dotenv from 'dotenv';
dotenv.config();
export const root = path.resolve(__dirname, '../../..');
export const config = { root, developerProvider:process.env.AI_DEVELOPER_PROVIDER||'mock', reviewerProvider:process.env.AI_REVIEWER_PROVIDER||'mock', developerMode:process.env.MOCK_DEVELOPER_MODE||'pass', reviewerMode:process.env.MOCK_REVIEW_MODE||'pass', timeoutMs:Number(process.env.AI_COMMAND_TIMEOUT_MS||1800000), maxRounds:Number(process.env.AI_MAX_REVIEW_ROUNDS||3), autoCommit:process.env.AI_AUTO_COMMIT==='true', codebuddy:process.env.CODEBUDDY_COMMAND||'codebuddy', codex:process.env.CODEX_COMMAND||'codex' };
export const dirs = { tasks:path.join(root,'ai/tasks'), state:path.join(root,'ai/state'), reviews:path.join(root,'ai/reviews'), reports:path.join(root,'ai/reports'), logs:path.join(root,'ai/logs'), schemas:path.join(root,'ai/schemas') };
