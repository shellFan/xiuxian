/**
 * Notification Provider — Console + optional PowerShell toast + webhook architecture.
 */
import { execSync } from 'child_process';
import { NotificationProvider } from './types';

/**
 * Console notification provider — always available.
 * Outputs prominent console messages for key events.
 */
export class ConsoleNotificationProvider implements NotificationProvider {
  notify(event: string, detail: string): void {
    const separator = '═'.repeat(60);
    const timestamp = new Date().toISOString();
    console.log(`\n${separator}`);
    console.log(`  AI ORCHESTRATOR — ${event}`);
    console.log(`  ${timestamp}`);
    console.log(`  ${detail}`);
    console.log(`${separator}\n`);

    // Windows PowerShell toast for important events
    if (process.platform === 'win32' && isImportantEvent(event)) {
      showWindowsToast(event, detail);
    }
  }
}

function isImportantEvent(event: string): boolean {
  return ['STOP', 'ESCALATED', 'PHASE_COMPLETE', 'SECRET_DETECTED', 'BUDGET_EXCEEDED', 'ERROR'].includes(event);
}

function showWindowsToast(title: string, message: string): void {
  try {
    const escapedTitle = title.replace(/'/g, "''");
    const escapedMessage = message.replace(/'/g, "''").slice(0, 200);
    execSync(
      `powershell -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.NotifyIcon]::ShowBalloonTip(5000, '${escapedTitle}', '${escapedMessage}', 'Info')"`,
      { windowsHide: true, timeout: 5000, stdio: 'pipe' }
    );
  } catch {
    // Toast not available — ignore silently
  }
}

/**
 * Webhook notification provider — architecture placeholder for future use.
 * Not implemented in V1; will be available for Slack/Email/etc.
 */
export class WebhookNotificationProvider implements NotificationProvider {
  private url: string;
  constructor(url: string) { this.url = url; }
  notify(event: string, detail: string): void {
    // Future: POST to webhook URL
    console.log(`[WEBHOOK] ${event}: ${detail} (url=${this.url}, not yet implemented)`);
  }
}

/**
 * Get the default notification provider.
 */
export function getDefaultNotification(): NotificationProvider {
  return new ConsoleNotificationProvider();
}