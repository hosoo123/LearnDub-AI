import electron from "electron";
import { spawn } from "node:child_process";

const environment = { ...process.env };
delete environment.ELECTRON_RUN_AS_NODE;
const child = spawn(electron, ["."], { cwd: process.cwd(), env: environment, stdio: "inherit", windowsHide: true });
child.once("exit", (code, signal) => process.exitCode = code ?? (signal ? 1 : 0));
