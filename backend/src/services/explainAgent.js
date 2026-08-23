import { execFile } from 'node:child_process';

export function explainRoute(signals, provider = 'mock') {
  return new Promise((resolve, reject) => {
    const child = execFile('python3',
      ['ai_agent/explain_agent.py', '--provider', provider],
      { timeout: 8000 },
      (err, stdout, stderr) => err
        ? reject(new Error(stderr || err.message))
        : resolve(JSON.parse(stdout).explanation));
    child.stdin.end(JSON.stringify(signals));
  });
}