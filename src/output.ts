import chalk from "chalk";

type TableColumn<T> = {
  key: keyof T;
  label: string;
};

export class Logger {
  constructor(private readonly dryRun = false) {}

  info(message: string): void {
    console.log(message);
  }

  muted(message: string): void {
    console.log(chalk.gray(message));
  }

  header(title: string, subtitle?: string): void {
    console.log("");
    console.log(chalk.bold.cyan(title));
    console.log(chalk.gray("=".repeat(Math.max(title.length, 8))));
    if (subtitle) {
      console.log(chalk.gray(subtitle));
    }
  }

  section(title: string): void {
    console.log("");
    console.log(chalk.bold(title));
    console.log(chalk.gray("-".repeat(Math.max(title.length, 8))));
  }

  step(message: string): void {
    console.log(`${chalk.cyan(">")} ${chalk.bold(message)}`);
  }

  success(message: string): void {
    console.log(`${chalk.green("OK")} ${message}`);
  }

  warn(message: string): void {
    console.warn(`${chalk.yellow("WARN")} ${message}`);
  }

  error(message: string): void {
    console.error(`${chalk.red("ERR")} ${message}`);
  }

  action(action: string, message: string): void {
    const prefix = this.dryRun ? `${chalk.yellow("DRY")} ` : "";
    const color = colorForAction(action);
    console.log(`${prefix}${color(padAction(action))} ${message}`);
  }

  keyValue(label: string, value: unknown): void {
    console.log(`${chalk.gray(`${label}:`)} ${formatValue(value)}`);
  }

  json(value: unknown): void {
    console.log(colorJson(value));
  }

  table<T extends Record<string, unknown>>(rows: T[], columns: TableColumn<T>[]): void {
    if (rows.length === 0) {
      this.muted("No rows.");
      return;
    }

    const widths = columns.map((column) => {
      const cells = rows.map((row) => String(row[column.key] ?? ""));
      return Math.max(column.label.length, ...cells.map((cell) => stripAnsi(cell).length));
    });

    const header = columns
      .map((column, index) => chalk.bold.cyan(column.label.padEnd(widths[index] ?? 0)))
      .join(chalk.gray("  "));
    console.log(header);
    console.log(chalk.gray(widths.map((width) => "-".repeat(width)).join("  ")));

    for (const row of rows) {
      const line = columns
        .map((column, index) => String(row[column.key] ?? "").padEnd(widths[index] ?? 0))
        .join("  ");
      console.log(line);
    }
  }

  blank(): void {
    console.log("");
  }
}

function colorForAction(action: string): (text: string) => string {
  if (action.includes("create")) return chalk.green;
  if (action.includes("update") || action === "configured") return chalk.blue;
  if (action.includes("delete")) return chalk.red;
  if (action.includes("deploy")) return chalk.magenta;
  if (action.includes("use") || action === "using") return chalk.cyan;
  return chalk.bold;
}

function padAction(action: string): string {
  return action.toUpperCase().padEnd(12);
}

function formatValue(value: unknown): string {
  if (value === undefined || value === null || value === "") return chalk.gray("-");
  if (typeof value === "number") return chalk.yellow(String(value));
  if (typeof value === "boolean") return value ? chalk.green("true") : chalk.red("false");
  return String(value);
}

function colorJson(value: unknown): string {
  return JSON.stringify(value, null, 2).replace(
    /("(?:\\u[\da-fA-F]{4}|\\[^u]|[^\\"])*"(\s*:)?|\btrue\b|\bfalse\b|\bnull\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g,
    (token) => {
      if (token.startsWith("\"")) {
        return token.endsWith(":") ? chalk.cyan(token) : chalk.green(token);
      }
      if (token === "true" || token === "false") return chalk.magenta(token);
      if (token === "null") return chalk.gray(token);
      return chalk.yellow(token);
    },
  );
}

function stripAnsi(value: string): string {
  return value.replace(/\u001b\[[0-9;]*m/g, "");
}
