/**
 * Encerra processos node que escutam nas portas dos bridges (9234–9237).
 *
 *   npm run capture-bridges-stop
 */
import { execSync } from "node:child_process";

const PORTS = [9234, 9235, 9236, 9237];

function pidsOnPortWindows(port: number): number[] {
  try {
    const out = execSync(`netstat -ano | findstr :${port}`, { encoding: "utf8" });
    const pids = new Set<number>();
    for (const line of out.split(/\r?\n/)) {
      if (!line.includes("LISTENING")) continue;
      const parts = line.trim().split(/\s+/);
      const pid = Number(parts[parts.length - 1]);
      if (Number.isFinite(pid) && pid > 0) pids.add(pid);
    }
    return [...pids];
  } catch {
    return [];
  }
}

function killPid(pid: number): boolean {
  try {
    execSync(`taskkill /PID ${pid} /F`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

let stopped = 0;
for (const port of PORTS) {
  const pids = pidsOnPortWindows(port);
  if (!pids.length) {
    console.log(`  porta ${port}: livre`);
    continue;
  }
  for (const pid of pids) {
    const ok = killPid(pid);
    console.log(`  porta ${port}: PID ${pid} ${ok ? "encerrado" : "falha ao encerrar"}`);
    if (ok) stopped++;
  }
}

if (stopped === 0) {
  console.log("\nNenhum bridge activo nas portas 9234–9237.");
} else {
  console.log(`\n${stopped} processo(s) encerrado(s). Rode: npm run capture-bridges-all`);
}
