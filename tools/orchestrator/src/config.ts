import path from 'path'; import dotenv from 'dotenv';
dotenv.config();
export const root = path.resolve(__dirname, '../../..');
const configuredCodex=process.env.CODEX_COMMAND||'codex';
const codex=process.platform==='win32'&&configuredCodex==='codex'?'codex.cmd':configuredCodex;
export const config = { root, developerProvider:process.env.AI_DEVELOPER_PROVIDER||'mock', reviewerProvider:process.env.AI_REVIEWER_PROVIDER||'mock', developerModel:process.env.AI_DEVELOPER_MODEL||'gpt-5.6-luna', reviewerModel:process.env.AI_REVIEWER_MODEL||'gpt-5.6-sol', developerMode:process.env.MOCK_DEVELOPER_MODE||'pass', reviewerMode:process.env.MOCK_REVIEW_MODE||'pass', timeoutMs:Number(process.env.AI_COMMAND_TIMEOUT_MS||1800000), maxRounds:Number(process.env.AI_MAX_REVIEW_ROUNDS||3), autoCommit:process.env.AI_AUTO_COMMIT==='true', codebuddy:process.env.CODEBUDDY_COMMAND||'codebuddy', codex };
export const dirs = { tasks:path.join(root,'ai/tasks'), state:path.join(root,'ai/state'), reviews:path.join(root,'ai/reviews'), reports:path.join(root,'ai/reports'), logs:path.join(root,'ai/logs'), schemas:path.join(root,'ai/schemas') };
