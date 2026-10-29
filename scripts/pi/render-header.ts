/** Fixture renderer only: no Pi process, no session and no model. */
import { renderHeader } from "../../src/pi/header.ts";

const value = (flag: string, fallback: string) => {
  const index = process.argv.indexOf(flag);
  return index < 0 ? fallback : process.argv[index + 1] ?? "";
};
const columns = Number(value("--columns", "80"));
const appearance = value("--appearance", "dark");
if (!Number.isInteger(columns) || columns < 1 || columns > 1000) throw new Error("--columns must be 1..1000");
if (appearance !== "light" && appearance !== "dark") throw new Error("--appearance must be light or dark");
console.log(renderHeader({ columns, appearance, color: !process.argv.includes("--no-color") }).join("\n"));
