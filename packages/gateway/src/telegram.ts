import TelegramBot from 'node-telegram-bot-api';
import { Authorizer, AuthorizationDecision } from '@zlar/shared';
import { PendingStore } from './pending-store';

export interface TelegramNotifier {
  notifyAuthorizers(
    actionId: string,
    ruleId: string,
    description: string,
    params: Record<string, unknown>,
    authorizerIds: string[],
    riskLevel?: 'yellow' | 'red'
  ): Promise<void>;
  notifySilent(
    description: string,
    params: Record<string, unknown>,
    authorizerIds: string[],
    authorizers: Map<string, Authorizer>
  ): Promise<void>;
  getRiskLevel(description: string, params: Record<string, unknown>): 'green' | 'yellow' | 'red';
  onTimeout(actionId: string): Promise<void>;
  shutdown(): void;
}

export function createTelegramNotifier(
  token: string,
  authorizers: Authorizer[],
  pendingStore: PendingStore
): TelegramNotifier {
  const bot = new TelegramBot(token, { polling: true });
  const authorizerMap = new Map(authorizers.map(a => [a.id, a]));
  // Track sent messages so we can edit them on timeout
  const sentMessages = new Map<string, { chatId: number; messageId: number; text: string }[]>();
  // Track action details for the "Details" button
  const actionDetails = new Map<string, { description: string; params: Record<string, unknown> }>();
  // Track when notifications were sent — for debounce (reject taps faster than 800ms)
  const sentAt = new Map<string, number>();
  const DEBOUNCE_MS = 800;

  // === FLOOD PROTECTION: queue notifications with 1.5s delay between them ===
  const sendQueue: Array<() => Promise<void>> = [];
  let sendingInProgress = false;
  const SEND_DELAY_MS = 1500;

  async function drainQueue() {
    if (sendingInProgress) return;
    sendingInProgress = true;
    while (sendQueue.length > 0) {
      const task = sendQueue.shift()!;
      await task();
      if (sendQueue.length > 0) {
        await new Promise(r => setTimeout(r, SEND_DELAY_MS));
      }
    }
    sendingInProgress = false;
  }

  bot.on('callback_query', async (query) => {
    const data = query.data;
    if (!data) return;

    const [action, actionId] = data.split(':');
    if (!actionId || (action !== 'authorize' && action !== 'deny' && action !== 'review' && action !== 'details')) {
      await bot.answerCallbackQuery(query.id, { text: 'Invalid action' });
      return;
    }

    // === DETAILS: send expanded context about the action ===
    if (action === 'details') {
      await bot.answerCallbackQuery(query.id);
      const details = actionDetails.get(actionId);
      if (!details) {
        await bot.sendMessage(query.message!.chat.id, '_Details no longer available._', { parse_mode: 'Markdown' });
        return;
      }
      const explanation = explainAction(details.description, details.params);
      await bot.sendMessage(query.message!.chat.id, explanation, { parse_mode: 'Markdown' });
      return;
    }

    const pending = pendingStore.get(actionId);
    if (!pending) {
      await bot.answerCallbackQuery(query.id, {
        text: 'This action has already been resolved or timed out.',
      });
      return;
    }

    // === DEBOUNCE: reject authorize/deny taps faster than 800ms after notification ===
    // Prevents accidental taps when notifications arrive while you're mid-tap on something else
    if (action === 'authorize' || action === 'deny') {
      const notifiedAt = sentAt.get(actionId);
      if (notifiedAt && (Date.now() - notifiedAt) < DEBOUNCE_MS) {
        await bot.answerCallbackQuery(query.id, {
          text: 'Too fast — wait a moment and tap again.',
        });
        console.log(`[ZLAR] Debounce rejected: ${action} for ${actionId} (${Date.now() - notifiedAt}ms after send)`);
        return;
      }
    }

    // === RED TWO-STEP: "Look Closer" → replace with Allow/Block ===
    if (action === 'review') {
      await bot.answerCallbackQuery(query.id, { text: 'Final step — Allow or Block?' });
      if (query.message) {
        const originalText = query.message.text || '';
        await bot.editMessageText(
          originalText + '\n\n\u{1F449} *Final step — do you want to allow this?*',
          {
            chat_id: query.message.chat.id,
            message_id: query.message.message_id,
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [
                  { text: '\u2705 Yes, Allow', callback_data: `authorize:${actionId}` },
                  { text: '\u{1F6D1} No, Block', callback_data: `deny:${actionId}` },
                ],
              ],
            },
          }
        );
      }
      return;
    }

    const authorizerName = query.from?.first_name || 'Unknown';
    const decision: AuthorizationDecision = {
      action: action as 'authorize' | 'deny',
      authorizer: authorizerName,
      timestamp: Date.now(),
    };

    const resolved = pendingStore.resolve(actionId, decision);

    if (resolved) {
      const statusText = action === 'authorize' ? 'ALLOWED' : 'BLOCKED';
      const emoji = action === 'authorize' ? '\u2705' : '\u{1F6D1}';

      await bot.answerCallbackQuery(query.id, { text: statusText });

      if (query.message) {
        // Preserve the original request summary, just update the status
        const originalText = query.message.text || '';
        const firstLine = originalText.split('\n')[0] || '';
        const time = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

        await bot.editMessageText(
          `${emoji} ${statusText}\n\n${firstLine}\n\n_${authorizerName} at ${time}_`,
          {
            chat_id: query.message.chat.id,
            message_id: query.message.message_id,
            parse_mode: 'Markdown',
          }
        );
      }

      sentMessages.delete(actionId);
      sentAt.delete(actionId);
      // Keep actionDetails for 10 minutes after resolution so Details button
      // still works if tapped after Allow/Block decision
      setTimeout(() => actionDetails.delete(actionId), 10 * 60 * 1000);
      console.log(`[ZLAR] Authorization decision: ${action} by ${authorizerName} for ${actionId}`);
    }
  });

  // === /pending command — show all actions waiting for a decision ===
  bot.onText(/\/pending/, async (msg) => {
    const chatId = msg.chat.id;
    const count = pendingStore.size();

    if (count === 0) {
      await bot.sendMessage(chatId, '\u2705 No pending actions. All clear.', { parse_mode: 'Markdown' });
      return;
    }

    const lines: string[] = [`\u{1F4CB} *${count} action${count > 1 ? 's' : ''} waiting:*\n`];

    for (const [id, action] of pendingStore.entries()) {
      const age = Math.round((Date.now() - action.timestamp) / 60000);
      const cmd = action.params.command || action.params.path || action.path;
      const { light } = trafficLight(
        action.path.includes('/exec') ? 'POST /exec' : action.path.includes('/file') ? 'POST /file/write' : action.method + ' ' + action.path,
        action.params
      );
      lines.push(`${light} \`${cmd}\` — _${age}min ago_`);
    }

    await bot.sendMessage(chatId, lines.join('\n'), { parse_mode: 'Markdown' });
  });

  return {
    async notifyAuthorizers(actionId, ruleId, description, params, authorizerIds, riskLevel = 'yellow') {
      const message = formatMessage(actionId, ruleId, description, params);

      // Store details for the "Details" button
      actionDetails.set(actionId, { description, params });

      // Red = two-step: first tap "Look Closer", then Allow/Block appears
      // Yellow = one-step: Allow/Block immediately
      // Both get a "Details" button for more context
      const keyboard = riskLevel === 'red'
        ? {
            inline_keyboard: [
              [
                { text: '\u{1F441}\uFE0F Look Closer', callback_data: `review:${actionId}` },
                { text: '\u{1F6D1} Block', callback_data: `deny:${actionId}` },
              ],
              [
                { text: '\u{1F4D6} Details', callback_data: `details:${actionId}` },
              ],
            ],
          }
        : {
            inline_keyboard: [
              [
                { text: '\u2705 Allow', callback_data: `authorize:${actionId}` },
                { text: '\u{1F6D1} Block', callback_data: `deny:${actionId}` },
              ],
              [
                { text: '\u{1F4D6} Details', callback_data: `details:${actionId}` },
              ],
            ],
          };

      // Queue the send to prevent flood — notifications arrive one at a time
      for (const authId of authorizerIds) {
        const authorizer = authorizerMap.get(authId);
        if (!authorizer) {
          console.warn(`[ZLAR] Authorizer not found: ${authId}`);
          continue;
        }

        sendQueue.push(async () => {
          try {
            const sent = await bot.sendMessage(authorizer.telegramChatId, message, {
              parse_mode: 'Markdown',
              reply_markup: keyboard,
            });
            // Track for timeout editing
            if (!sentMessages.has(actionId)) sentMessages.set(actionId, []);
            sentMessages.get(actionId)!.push({
              chatId: sent.chat.id,
              messageId: sent.message_id,
              text: message,
            });
            // Record send time for debounce
            sentAt.set(actionId, Date.now());
            console.log(`[ZLAR] Alert sent to ${authorizer.name} (${authorizer.telegramChatId})`);
          } catch (err: any) {
            console.error(`[ZLAR] Failed to send Telegram alert to ${authId}:`, err.message);
          }
        });
      }
      drainQueue();
    },

    async notifySilent(description, params, authorizerIds, authMap) {
      const { light, line } = trafficLight(description, params);
      const message = `${light} \`${line}\` \u2014 _auto-approved_`;

      for (const authId of authorizerIds) {
        const authorizer = authMap.get(authId) || authorizerMap.get(authId);
        if (!authorizer) continue;
        try {
          await bot.sendMessage(authorizer.telegramChatId, message, {
            parse_mode: 'Markdown',
          });
        } catch (err: any) {
          console.error(`[ZLAR] Failed to send silent notification:`, err.message);
        }
      }
    },

    getRiskLevel(description, params) {
      const { light } = trafficLight(description, params);
      if (light === '\u{1F7E2}') return 'green';
      if (light === '\u{1F534}') return 'red';
      return 'yellow';
    },

    async onTimeout(actionId) {
      const messages = sentMessages.get(actionId);
      if (!messages) return;
      sentMessages.delete(actionId);
      sentAt.delete(actionId);
      // Keep actionDetails for 10 minutes after timeout so Details can still be tapped
      setTimeout(() => actionDetails.delete(actionId), 10 * 60 * 1000);

      for (const { chatId, messageId, text } of messages) {
        try {
          const firstLine = text.split('\n')[0] || '';
          await bot.editMessageText(
            `\u23F0 TIMED OUT\n\n${firstLine}\n\n_No response — action blocked_`,
            {
              chat_id: chatId,
              message_id: messageId,
              parse_mode: 'Markdown',
            }
          );
        } catch (err: any) {
          console.error(`[ZLAR] Failed to update timed-out message:`, err.message);
        }
      }
    },

    shutdown() {
      bot.stopPolling();
    },
  };
}

function formatMessage(
  _actionId: string,
  _ruleId: string,
  description: string,
  params: Record<string, unknown>
): string {
  const { light, line, context, headline, warning } = trafficLight(description, params);

  const parts: string[] = [];

  // Line 1: Traffic light + headline (plain English)
  parts.push(`${light} *${headline}*`);

  // Line 2: The specific command/path
  parts.push(`\`${line}\``);

  // Line 3: Inline warning if present (don't hide behind Details)
  if (warning) {
    parts.push('');
    parts.push(warning);
  }

  // Line 4: Content preview for writes
  if (context) {
    parts.push(context);
  }

  return parts.join('\n');
}

// === RISK ASSESSMENT ===
// 🟢 = safe-looking, lean approve
// 🟡 = review, could go either way
// 🔴 = dangerous, think before tapping

const SAFE_COMMANDS = /^(ls|cat|head|tail|pwd|whoami|hostname|uptime|date|df|du|ps|echo|which|file|wc|id|uname|sw_vers|system_profiler|defaults read|printenv|env|set|type|man|help)\b/;
const DANGER_COMMANDS = /^(rm|sudo|kill|killall|chmod|chown|mkfs|dd|curl.*\|.*sh|wget.*\|.*sh|eval|exec|>\s*\/|mv\s+.*\s+\/dev\/null)/;
const COMPOUND_OPERATORS = /[;|&`]|\$\(/;

// Protected paths — any destructive action touching these is always red
const PROTECTED_PATHS = /~\/Desktop|\/Users\/\w+\/Desktop|~\/Documents|\/Users\/\w+\/Documents/;

function trafficLight(
  description: string,
  params: Record<string, unknown>
): { light: string; line: string; context?: string; headline: string; warning?: string } {

  // === SHELL COMMAND ===
  if (description.includes('/exec')) {
    const cmd = String(params.command || '');
    const args = Array.isArray(params.args) ? params.args.join(' ') : '';
    const fullCmd = args ? `${cmd} ${args}` : cmd;

    let light = '\u{1F7E1}'; // yellow default
    let headline = 'Run command';
    let warning: string | undefined;
    const isCompound = COMPOUND_OPERATORS.test(fullCmd);

    // Compound commands are NEVER green — chaining can hide danger after a safe prefix
    if (!isCompound && SAFE_COMMANDS.test(fullCmd)) light = '\u{1F7E2}';

    // Red if any segment of the command matches danger patterns
    if (DANGER_COMMANDS.test(fullCmd)) light = '\u{1F534}';
    if (isCompound) {
      const segments = fullCmd.split(/[;&|`]|\$\(/).map(s => s.trim());
      if (segments.some(s => DANGER_COMMANDS.test(s))) light = '\u{1F534}';
    }

    // Protected paths — destructive commands touching Desktop/Documents are always red
    if (PROTECTED_PATHS.test(fullCmd) && /\b(rm|mv|cp|rsync|trash)\b/.test(fullCmd)) {
      light = '\u{1F534}';
    }

    // Set plain-English headline and inline warnings based on what the command does
    if (/^rm\b/.test(cmd)) {
      const rf = fullCmd.includes('-rf') || fullCmd.includes('-r');
      headline = rf ? 'Delete files/folders' : 'Delete a file';
      warning = '\u26A0\uFE0F Permanent deletion — no trash, no undo.';
      if (PROTECTED_PATHS.test(fullCmd)) {
        warning += '\n\u{1F6D1} This targets your Desktop or Documents.';
      }
    } else if (/^sudo\b/.test(cmd)) {
      headline = 'Admin command (sudo)';
      warning = '\u26A0\uFE0F Runs with full system privileges.';
    } else if (/^kill|^killall/.test(cmd)) {
      headline = 'Stop a process';
      warning = '\u26A0\uFE0F Will force-stop a running program.';
    } else if (/^chmod|^chown/.test(cmd)) {
      headline = 'Change file permissions';
      warning = '\u26A0\uFE0F Changes who can access a file.';
    } else if (/^mv\b/.test(cmd)) {
      headline = 'Move/rename a file';
      if (PROTECTED_PATHS.test(fullCmd)) {
        warning = '\u{1F6D1} This touches your Desktop or Documents.';
      }
    } else if (/^curl|^wget/.test(cmd)) {
      headline = 'Network request';
      warning = '\u26A0\uFE0F Downloads data or sends data to the internet.';
    } else if (isCompound) {
      headline = 'Multiple commands chained';
      warning = '\u26A0\uFE0F Runs several commands in sequence. Review carefully.';
    } else if (light === '\u{1F7E2}') {
      headline = 'Safe command (read-only)';
    }

    return { light, line: fullCmd, headline, warning };
  }

  // === FILE DELETE — always red ===
  if (description.includes('/file/delete')) {
    return {
      light: '\u{1F534}',
      line: `${params.path}`,
      headline: 'Delete a file',
      warning: '\u26A0\uFE0F Permanent deletion — no trash, no undo.',
    };
  }

  // === FILE WRITE ===
  if (description.includes('/file/write')) {
    const p = String(params.path || '');
    const sensitive = /\.(ssh|env|zshrc|bashrc|profile|gitconfig)|\/etc\/|authorized_keys|id_rsa/.test(p) || PROTECTED_PATHS.test(p);
    const content = String(params.content || '');
    const isEdit = content.startsWith('Edit:');
    const preview = content.length > 80 ? content.slice(0, 80) + '...' : content;

    let headline = isEdit ? 'Edit a file' : 'Write to a file';
    let warning: string | undefined;

    if (/\.ssh|authorized_keys|id_rsa/.test(p)) {
      headline = isEdit ? 'Edit SSH config' : 'Write to SSH config';
      warning = '\u{1F6D1} This affects SSH keys or config — controls remote access.';
    } else if (/\.env/.test(p)) {
      headline = isEdit ? 'Edit secrets file' : 'Write to secrets file';
      warning = '\u{1F6D1} .env files often contain passwords and API keys.';
    } else if (/\.zshrc|\.bashrc|\.profile/.test(p)) {
      headline = isEdit ? 'Edit shell config' : 'Write to shell config';
      warning = '\u26A0\uFE0F Changes what runs when you open a terminal.';
    } else if (PROTECTED_PATHS.test(p)) {
      warning = '\u{1F6D1} This is in your Desktop or Documents.';
    } else if (/\/etc\//.test(p)) {
      warning = '\u{1F6D1} System configuration file.';
    }

    return {
      light: sensitive ? '\u{1F534}' : '\u{1F7E1}',
      line: p,
      headline,
      warning,
      context: preview ? `_${preview}_` : undefined,
    };
  }

  // === FILE MOVE ===
  if (description.includes('/file/move')) {
    const src = String(params.source || '');
    const dst = String(params.destination || '');
    const touchesProtected = PROTECTED_PATHS.test(src) || PROTECTED_PATHS.test(dst);
    return {
      light: touchesProtected ? '\u{1F534}' : '\u{1F7E1}',
      line: `${src} \u2192 ${dst}`,
      headline: 'Move/rename a file',
      warning: touchesProtected ? '\u{1F6D1} This touches your Desktop or Documents.' : undefined,
    };
  }

  // === FINANCIAL TRANSFER — always red ===
  if (description.includes('/transfer')) {
    const amount = params.amount ? `$${Number(params.amount).toLocaleString()}` : '';
    return {
      light: '\u{1F534}',
      line: `Send ${amount} ${params.currency || 'USD'} to ${params.recipient}`,
      headline: 'Send money',
      warning: '\u26A0\uFE0F Real financial transfer.',
    };
  }

  // === TRADE ===
  if (description.includes('/trade')) {
    return {
      light: '\u{1F534}',
      line: `${String(params.side || 'TRADE').toUpperCase()} ${params.quantity} ${params.symbol}`,
      headline: 'Execute trade',
      warning: '\u26A0\uFE0F Real market trade.',
    };
  }

  // === OUTBOUND NETWORK ===
  if (description.includes('/net/request')) {
    const url = String(params.url || '');
    const method = String(params.method || 'GET');
    let host: string;
    try { host = new URL(url).hostname; } catch { host = url; }
    return {
      light: '\u{1F534}',
      line: `${method} ${host}`,
      headline: 'Internet request',
      warning: '\u26A0\uFE0F Sends or receives data from the internet.',
    };
  }

  // === DNS LOOKUP ===
  if (description.includes('/net/dns')) {
    return {
      light: '\u{1F7E1}',
      line: `DNS ${params.hostname}`,
      headline: 'DNS lookup',
    };
  }

  // Fallback
  return {
    light: '\u{1F7E1}',
    line: `${description}`,
    headline: 'Unknown action',
    warning: '\u26A0\uFE0F Not recognized — review before allowing.',
  };
}

// === PLAIN-ENGLISH EXPLANATION for the Details button ===
function explainAction(description: string, params: Record<string, unknown>): string {
  const lines: string[] = ['\u{1F4AC} *Here\'s what\'s happening:*\n'];

  if (description.includes('/exec')) {
    const cmd = String(params.command || '');
    lines.push(`Claude wants to run this on your Mac:\n\`${cmd}\`\n`);

    if (/^rm\b/.test(cmd)) {
      const rf = cmd.includes('-rf') || cmd.includes('-r');
      lines.push(rf
        ? '\u26A0\uFE0F *This deletes files and all subfolders.* They don\'t go to the Trash — they\'re gone forever.'
        : '\u26A0\uFE0F *This deletes a file.* It doesn\'t go to the Trash — it\'s gone forever.'
      );
      if (PROTECTED_PATHS.test(cmd)) {
        lines.push('\u{1F6D1} *This targets your Desktop or Documents folder.*');
      }
    } else if (/^sudo\b/.test(cmd)) {
      lines.push('\u26A0\uFE0F *This runs as admin* — like giving the command the master key to your Mac. It can change anything.');
    } else if (/^kill|^killall/.test(cmd)) {
      lines.push('\u26A0\uFE0F *This force-stops a running program.* If the program is doing something important, that work could be lost.');
    } else if (/^chmod|^chown/.test(cmd)) {
      lines.push('\u26A0\uFE0F *This changes who can open or use a file.* Could make files invisible to you or visible to others.');
    } else if (/^mv\b/.test(cmd)) {
      lines.push('This moves a file from one place to another (like drag-and-drop). The original disappears.');
      if (PROTECTED_PATHS.test(cmd)) {
        lines.push('\u{1F6D1} *This touches your Desktop or Documents folder.*');
      }
    } else if (/^curl|^wget/.test(cmd)) {
      lines.push('This talks to the internet — either downloading something or sending data out.');
    } else if (COMPOUND_OPERATORS.test(cmd)) {
      lines.push('\u26A0\uFE0F *This is actually several commands chained together.* Each part runs one after another. Read each part separately.');
    } else if (/^(ls|cat|head|tail|pwd|whoami|echo|which|file|wc|id|uname)\b/.test(cmd)) {
      lines.push('This just reads information — it doesn\'t change or delete anything. Generally safe.');
    } else {
      lines.push('This isn\'t a common command I recognize. Take a moment to consider whether you expect Claude to be running this.');
    }

    if (params.cwd) {
      lines.push(`\n_Running inside:_ \`${params.cwd}\``);
    }
  } else if (description.includes('/file/write')) {
    const p = String(params.path || '');
    const content = String(params.content || '');
    const isEdit = content.startsWith('Edit:');
    const preview = content.length > 200 ? content.slice(0, 200) + '...' : content;

    if (isEdit) {
      lines.push(`Claude wants to *edit* a file on your Mac:\n\`${p}\`\n`);
      lines.push('It\'s changing part of the file, not rewriting the whole thing.\n');
    } else {
      lines.push(`Claude wants to *write* a file on your Mac:\n\`${p}\`\n`);
      lines.push('If the file already exists, it will be *replaced*. If not, it will be created.\n');
    }

    if (PROTECTED_PATHS.test(p)) {
      lines.push('\u{1F6D1} *This is in your Desktop or Documents folder.*\n');
    }
    if (/\.ssh|authorized_keys|id_rsa/.test(p)) {
      lines.push('\u{1F6D1} *SSH config — this controls who can remotely access your Mac.*\n');
    }
    if (/\.env/.test(p)) {
      lines.push('\u{1F6D1} *.env file — these often contain passwords and secret keys.*\n');
    }
    if (preview) {
      lines.push(`_What it wants to write:_\n\`\`\`\n${preview}\n\`\`\``);
    }
  } else if (description.includes('/file/delete')) {
    lines.push(`Claude wants to *delete*:\n\`${params.path}\`\n`);
    lines.push('\u26A0\uFE0F *This is permanent.* The file doesn\'t go to your Trash — it\'s erased.');
  } else if (description.includes('/net/request')) {
    const url = String(params.url || '');
    lines.push(`Claude wants to make an internet request:\n\`${url}\`\n`);
    lines.push('This sends data to or receives data from the internet. Could be downloading info or sending your data somewhere.');
  } else if (description.includes('/file/move')) {
    lines.push(`Claude wants to move a file:\nFrom: \`${params.source}\`\nTo: \`${params.destination}\`\n`);
    lines.push('The file disappears from the old location and appears at the new one — like drag-and-drop.');
  } else {
    lines.push(`Action: \`${description}\``);
    const paramLines = Object.entries(params)
      .map(([k, v]) => `  ${k}: \`${v}\``)
      .join('\n');
    if (paramLines) lines.push(paramLines);
  }

  return lines.join('\n');
}
