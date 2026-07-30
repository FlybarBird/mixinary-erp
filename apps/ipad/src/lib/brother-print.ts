import * as FileSystem from "expo-file-system/legacy";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { BROTHER_LABEL } from "@mixinary/domain";
import { config } from "./config";
import { supabase } from "./supabase";

export type BrotherChannel = {
  id: string;
  modelName?: string;
  ipAddress?: string;
  macAddress?: string;
  source: "sdk" | "airprint";
};

type BrotherSdkModule = {
  searchBluetoothPrinters?: () => Promise<BrotherChannel[]>;
  searchNetworkPrinters?: (opts: {
    printerList: string[];
    searchDuration?: number;
  }) => Promise<BrotherChannel[]>;
  printPDF?: (
    pdfUri: string,
    channel: BrotherChannel,
    settings: Record<string, unknown>,
  ) => Promise<void>;
};

const STORAGE_MODEL_KEY = "mixinary.brother.models";

/** Optional native Brother Print SDK (requires Expo dev/production build). */
async function loadBrotherSdk(): Promise<BrotherSdkModule | null> {
  try {
    // Optional dependency — present only after `npx expo prebuild` + SDK plugin.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("expo-brother-printer-sdk");
    return (mod?.default ?? mod) as BrotherSdkModule;
  } catch {
    return null;
  }
}

export function brotherStockSummary() {
  return `${BROTHER_LABEL.widthMm}mm × ${BROTHER_LABEL.heightMm}mm cut · ${BROTHER_LABEL.recommendedModels.join(" / ")}`;
}

async function accessToken(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

/** Download Brother-sized label PDF from the ERP API to a local file. */
export async function downloadLabelPdf(opts: {
  projectId: string;
  poId: string;
  mode: "receive" | "item";
}): Promise<{ uri: string; labelCount: number | null }> {
  const token = await accessToken();
  if (!token) throw new Error("Not signed in");

  const cacheDir = FileSystem.cacheDirectory;
  if (!cacheDir) throw new Error("File cache is unavailable on this device");

  const path = `/api/projects/${opts.projectId}/labels/pdf?po=${opts.poId}&mode=${opts.mode}`;
  const target = `${cacheDir}mixinary-${opts.mode}-${opts.poId}.pdf`;

  const result = await FileSystem.downloadAsync(
    `${config.apiUrl}${path}`,
    target,
    { headers: { Authorization: `Bearer ${token}` } },
  );

  if (result.status < 200 || result.status >= 300) {
    throw new Error(`Label PDF failed (${result.status})`);
  }

  const countHeader =
    result.headers?.["X-Mixinary-Label-Count"] ??
    result.headers?.["x-mixinary-label-count"];
  return {
    uri: result.uri,
    labelCount: countHeader ? Number(countHeader) : null,
  };
}

export async function searchBrotherPrinters(): Promise<{
  channels: BrotherChannel[];
  via: "sdk" | "none";
  message: string;
}> {
  const sdk = await loadBrotherSdk();
  if (!sdk?.searchNetworkPrinters && !sdk?.searchBluetoothPrinters) {
    return {
      channels: [],
      via: "none",
      message:
        "Brother Print SDK not in this build. Use AirPrint / share to a QL Wi‑Fi printer, or make a dev build with expo-brother-printer-sdk.",
    };
  }

  const models = [...BROTHER_LABEL.recommendedModels];
  const channels: BrotherChannel[] = [];

  try {
    if (sdk.searchBluetoothPrinters) {
      const bt = await sdk.searchBluetoothPrinters();
      channels.push(
        ...bt.map((c) => ({ ...c, source: "sdk" as const })),
      );
    }
  } catch {
    // Bluetooth often unavailable in Simulator
  }

  try {
    if (sdk.searchNetworkPrinters) {
      const wifi = await sdk.searchNetworkPrinters({
        printerList: models,
        searchDuration: 2500,
      });
      channels.push(
        ...wifi.map((c) => ({ ...c, source: "sdk" as const })),
      );
    }
  } catch (e) {
    if (!channels.length) {
      return {
        channels: [],
        via: "sdk",
        message:
          e instanceof Error
            ? e.message
            : "Brother network search failed",
      };
    }
  }

  return {
    channels,
    via: "sdk",
    message: channels.length
      ? `Found ${channels.length} Brother printer(s).`
      : "No Brother printers found on Wi‑Fi/Bluetooth. Check power and network.",
  };
}

export async function printLabelPdf(opts: {
  pdfUri: string;
  channel?: BrotherChannel | null;
}): Promise<{ method: "brother-sdk" | "airprint" | "share"; detail: string }> {
  const sdk = await loadBrotherSdk();

  if (opts.channel && sdk?.printPDF && opts.channel.source === "sdk") {
    await sdk.printPDF(opts.pdfUri, opts.channel, {
      labelSize: BROTHER_LABEL.qlLabelSize,
      autoCut: true,
      cutAtEnd: true,
      autoCutForEachPageCount: 1,
    });
    return {
      method: "brother-sdk",
      detail: `Sent to ${opts.channel.modelName || opts.channel.id}`,
    };
  }

  // AirPrint path — Brother QL Wi‑Fi models that advertise AirPrint appear here.
  try {
    await Print.printAsync({ uri: opts.pdfUri });
    return {
      method: "airprint",
      detail: "Opened iOS print sheet (pick your Brother QL).",
    };
  } catch {
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(opts.pdfUri, {
        mimeType: "application/pdf",
        dialogTitle: "Print Mixinary labels on Brother",
        UTI: "com.adobe.pdf",
      });
      return {
        method: "share",
        detail: "Shared PDF — open in Brother iPrint&Label or Print Center.",
      };
    }
    throw new Error("Unable to print or share the label PDF on this device.");
  }
}

export { STORAGE_MODEL_KEY };
