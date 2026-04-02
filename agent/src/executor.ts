import { execFile } from 'child_process';
import path from 'path';
import fs from 'fs';
import { SCRIPTS_DIR } from './config.js';

const ALLOWED_COMMANDS = new Set(
  fs.readdirSync(SCRIPTS_DIR)
    .filter((f) => f.endsWith('.ps1'))
    .map((f) => f.replace('.ps1', ''))
);

export interface ExecResult {
  success: boolean;
  output: string;
}

export function executeCommand(
  command: string,
  params: { targetName: string; gameName?: string }
): Promise<ExecResult> {
  return new Promise((resolve) => {
    if (!ALLOWED_COMMANDS.has(command)) {
      resolve({ success: false, output: `Commande inconnue: ${command}` });
      return;
    }

    const scriptPath = path.join(SCRIPTS_DIR, `${command}.ps1`);
    const args = [
      '-ExecutionPolicy', 'Bypass',
      '-NoProfile',
      '-File', scriptPath,
      '-TargetName', params.targetName,
    ];

    if (params.gameName) {
      args.push('-GameName', params.gameName);
    }

    console.log(`[exec] ${command} -> ${params.targetName}`);

    execFile('powershell', args, { timeout: 30_000 }, (error, stdout, stderr) => {
      if (error) {
        console.error(`[exec] Error: ${error.message}`);
        resolve({ success: false, output: stderr || error.message });
      } else {
        console.log(`[exec] OK: ${stdout.trim().slice(0, 200)}`);
        resolve({ success: true, output: stdout.trim() || 'OK' });
      }
    });
  });
}
