/**
 * Client helpers for the DYMO Connect Label Framework (browser + local service).
 * Requires DYMO Connect (or legacy DYMO Label) installed with the LabelWriter connected.
 */

export type DymoPrinter = {
  name: string;
  modelName: string;
  isConnected: boolean;
  isLocal: boolean;
  isTwinTurbo: boolean;
};

type DymoFramework = {
  init: () => void | Promise<void>;
  checkEnvironment: () => {
    isBrowserSupported: boolean;
    isFrameworkInstalled: boolean;
    isWebServicePresent: boolean;
    errorDetails?: string;
  };
  getPrinters: () => Array<{
    name: string;
    modelName: string;
    isConnected: boolean;
    isLocal: boolean;
    isTwinTurbo?: boolean;
  }>;
  printLabel: (
    printerName: string,
    printParamsXml: string,
    labelXml: string,
    labelSetXml: string,
  ) => void;
  openLabelXml: (labelXml: string) => { isValidLabel?: () => boolean };
};

declare global {
  interface Window {
    dymo?: {
      label?: {
        framework?: DymoFramework;
      };
    };
  }
}

const SCRIPT_ID = "dymo-connect-framework";
const SCRIPT_SRC = "/vendor/dymo.connect.framework.js";
export const DYMO_PRINTER_STORAGE_KEY = "mixinary.dymo.printer";

let loadPromise: Promise<DymoFramework> | null = null;

function getFramework(): DymoFramework | null {
  return window.dymo?.label?.framework ?? null;
}

export function loadDymoScript(): Promise<DymoFramework> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("DYMO framework is browser-only"));
  }
  const existing = getFramework();
  if (existing) return Promise.resolve(existing);
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve, reject) => {
    const done = () => {
      const fw = getFramework();
      if (fw) resolve(fw);
      else reject(new Error("DYMO Connect Framework failed to load"));
    };

    const prior = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    if (prior) {
      if (getFramework()) {
        done();
        return;
      }
      prior.addEventListener("load", done);
      prior.addEventListener("error", () =>
        reject(new Error("Failed to load DYMO Connect Framework script")),
      );
      return;
    }

    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = done;
    script.onerror = () =>
      reject(new Error("Failed to load DYMO Connect Framework script"));
    document.head.appendChild(script);
  });

  return loadPromise;
}

export async function initDymo(): Promise<{
  framework: DymoFramework;
  ready: boolean;
  message: string;
}> {
  const framework = await loadDymoScript();
  try {
    const maybe = framework.init();
    if (maybe && typeof (maybe as Promise<void>).then === "function") {
      await maybe;
    }
  } catch {
    /* some builds throw if already initialized */
  }

  let ready = false;
  let message = "DYMO Connect is not available.";
  try {
    const env = framework.checkEnvironment();
    ready = Boolean(
      env.isBrowserSupported &&
        (env.isFrameworkInstalled || env.isWebServicePresent),
    );
    if (ready) {
      message = "DYMO Connect ready";
    } else if (env.errorDetails) {
      message = env.errorDetails;
    } else if (!env.isWebServicePresent) {
      message =
        "Install and open DYMO Connect, then reconnect your LabelWriter.";
    } else if (!env.isBrowserSupported) {
      message = "This browser is not supported by DYMO Connect.";
    }
  } catch (err) {
    message = err instanceof Error ? err.message : message;
  }

  return { framework, ready, message };
}

export function listLabelWriters(framework: DymoFramework): DymoPrinter[] {
  const printers = framework.getPrinters() ?? [];
  return printers
    .filter((p) => {
      const model = `${p.modelName ?? ""} ${p.name ?? ""}`.toLowerCase();
      return model.includes("labelwriter") || model.includes("label writer");
    })
    .map((p) => ({
      name: p.name,
      modelName: p.modelName,
      isConnected: Boolean(p.isConnected),
      isLocal: Boolean(p.isLocal),
      isTwinTurbo: Boolean(p.isTwinTurbo),
    }));
}

export function getStoredPrinterName(): string | null {
  try {
    return localStorage.getItem(DYMO_PRINTER_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function storePrinterName(name: string) {
  try {
    localStorage.setItem(DYMO_PRINTER_STORAGE_KEY, name);
  } catch {
    /* ignore */
  }
}

export function resolvePrinter(
  printers: DymoPrinter[],
  preferredName?: string | null,
): DymoPrinter | null {
  if (!printers.length) return null;
  const preferred =
    preferredName || getStoredPrinterName() || null;
  const byName = preferred
    ? printers.find((p) => p.name === preferred)
    : null;
  if (byName) return byName;
  const connected = printers.find((p) => p.isConnected);
  return connected ?? printers[0] ?? null;
}

export function printLabelXml(
  framework: DymoFramework,
  printerName: string,
  labelXml: string,
) {
  framework.printLabel(printerName, "", labelXml, "");
}

export async function printLabels(
  framework: DymoFramework,
  printerName: string,
  labelXmls: string[],
) {
  for (const xml of labelXmls) {
    printLabelXml(framework, printerName, xml);
    // Brief yield so the local service can queue jobs without stacking.
    await new Promise((r) => setTimeout(r, 120));
  }
}
