import { spawn } from "node:child_process";

import { SandboxExecutionResultSchema, type RunnerJob } from "@kordo/contracts";

import type { SandboxBackend } from "./backend.js";

export class DockerLocalSandboxBackend implements SandboxBackend {
  async execute(job: RunnerJob) {
    if (job.sandbox.backend !== "docker-local") {
      throw new Error(`Unsupported sandbox backend: ${job.sandbox.backend}`);
    }

    const startedAtDate = new Date();
    const startedAtMs = Date.now();
    const containerName = createContainerName(job.id);
    const execution = await runDocker(
      buildDockerRunArgs(job, containerName),
      job.command.timeoutMs,
    );
    const completedAtDate = new Date();
    const cleanup = await removeContainer(containerName);

    return SandboxExecutionResultSchema.parse({
      containerName,
      command: job.command.argv,
      exitCode: execution.exitCode,
      stdout: execution.stdout,
      stderr: execution.stderr,
      startedAt: startedAtDate.toISOString(),
      completedAt: completedAtDate.toISOString(),
      durationMs: Date.now() - startedAtMs,
      timedOut: execution.timedOut,
      cleanup,
    });
  }
}

function buildDockerRunArgs(job: RunnerJob, containerName: string): string[] {
  const args = [
    "run",
    "--rm",
    "--name",
    containerName,
    "--network",
    job.environmentPolicy.allowNetwork ? "bridge" : "none",
  ];

  if (job.command.cwd) {
    args.push("--workdir", job.command.cwd);
  }

  args.push(job.sandbox.image, ...job.command.argv);
  return args;
}

function createContainerName(jobId: string): string {
  return `kordo-${jobId}`.replace(/[^a-zA-Z0-9_.-]/g, "-");
}

interface CommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

function runDocker(args: string[], timeoutMs: number): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn("docker", args, {
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));

    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({
        exitCode: timedOut ? 124 : (code ?? 1),
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
        timedOut,
      });
    });
  });
}

async function removeContainer(containerName: string) {
  const result = await runCleanup(["rm", "-f", containerName]);

  if (result.stderr.includes("No such container")) {
    return {
      removed: true,
    };
  }

  if (result.exitCode === 0) {
    return {
      removed: true,
      ...(result.stderr ? { message: result.stderr.trim() } : {}),
    };
  }

  return {
    removed: false,
    message: result.stderr.trim() || result.stdout.trim() || "Docker cleanup failed.",
  };
}

function runCleanup(args: string[]): Promise<CommandResult> {
  return new Promise((resolve) => {
    const child = spawn("docker", args, {
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];

    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));

    child.on("error", (error) => {
      resolve({
        exitCode: 1,
        stdout: "",
        stderr: error.message,
        timedOut: false,
      });
    });

    child.on("close", (code) => {
      resolve({
        exitCode: code ?? 1,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
        timedOut: false,
      });
    });
  });
}
