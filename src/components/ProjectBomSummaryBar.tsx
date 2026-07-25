"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  formatMoney,
  formatPct,
  formatSignedMoney,
  outOfPocketStyle,
} from "@/lib/pricing";
import type { BomHeaderEconomics } from "@/lib/projects/bom-header-economics";

export type LaborHeaderTotals = {
  totalEst: number;
  totalQuote: number;
  totalSale: number;
  profit: number;
  margin: number | null;
};

type Ctx = {
  economics: BomHeaderEconomics;
  setEconomics: (next: BomHeaderEconomics) => void;
  labor: LaborHeaderTotals;
  setLabor: (next: LaborHeaderTotals) => void;
  /** Approved expense cost (amount + tax); reduces Total profit */
  approvedExpenses: number;
  setApprovedExpenses: (next: number) => void;
  /** Sent / paid invoice totals */
  billed: number;
  setBilled: (next: number) => void;
};

const ProjectBomSummaryContext = createContext<Ctx | null>(null);

const EMPTY_LABOR: LaborHeaderTotals = {
  totalEst: 0,
  totalQuote: 0,
  totalSale: 0,
  profit: 0,
  margin: null,
};

export function ProjectBomSummaryProvider({
  initial,
  initialLabor = EMPTY_LABOR,
  initialApprovedExpenses = 0,
  initialBilled = 0,
  children,
}: {
  initial: BomHeaderEconomics;
  initialLabor?: LaborHeaderTotals;
  initialApprovedExpenses?: number;
  initialBilled?: number;
  children: ReactNode;
}) {
  const [economics, setEconomicsState] = useState(initial);
  const [labor, setLaborState] = useState(initialLabor);
  const [approvedExpenses, setApprovedExpensesState] = useState(
    initialApprovedExpenses,
  );
  const [billed, setBilledState] = useState(initialBilled);

  useEffect(() => {
    setEconomicsState(initial);
  }, [initial]);

  useEffect(() => {
    setLaborState(initialLabor);
  }, [initialLabor]);

  useEffect(() => {
    setApprovedExpensesState(initialApprovedExpenses);
  }, [initialApprovedExpenses]);

  useEffect(() => {
    setBilledState(initialBilled);
  }, [initialBilled]);

  const setEconomics = useCallback((next: BomHeaderEconomics) => {
    setEconomicsState(next);
  }, []);

  const setLabor = useCallback((next: LaborHeaderTotals) => {
    setLaborState(next);
  }, []);

  const setApprovedExpenses = useCallback((next: number) => {
    setApprovedExpensesState(next);
  }, []);

  const setBilled = useCallback((next: number) => {
    setBilledState(next);
  }, []);

  const value = useMemo(
    () => ({
      economics,
      setEconomics,
      labor,
      setLabor,
      approvedExpenses,
      setApprovedExpenses,
      billed,
      setBilled,
    }),
    [
      economics,
      setEconomics,
      labor,
      setLabor,
      approvedExpenses,
      setApprovedExpenses,
      billed,
      setBilled,
    ],
  );

  return (
    <ProjectBomSummaryContext.Provider value={value}>
      {children}
    </ProjectBomSummaryContext.Provider>
  );
}

export function useProjectBomSummary() {
  return useContext(ProjectBomSummaryContext);
}

export function useProjectLaborSummary() {
  const ctx = useContext(ProjectBomSummaryContext);
  if (!ctx) return null;
  return { labor: ctx.labor, setLabor: ctx.setLabor };
}

export function useProjectExpenseSummary() {
  const ctx = useContext(ProjectBomSummaryContext);
  if (!ctx) return null;
  return {
    approvedExpenses: ctx.approvedExpenses,
    setApprovedExpenses: ctx.setApprovedExpenses,
  };
}

export function useProjectBillingSummary() {
  const ctx = useContext(ProjectBomSummaryContext);
  if (!ctx) return null;
  return { billed: ctx.billed, setBilled: ctx.setBilled };
}

const LABEL: CSSProperties = {
  fontWeight: 700,
  whiteSpace: "nowrap",
};

const CELL: CSSProperties = {
  whiteSpace: "nowrap",
};

const SUMMARY_COLUMNS = "max-content repeat(6, max-content)";

const SUMMARY_SHELL: CSSProperties = {
  display: "grid",
  gridTemplateColumns: SUMMARY_COLUMNS,
  columnGap: "1rem",
  rowGap: "0.35rem",
  alignItems: "baseline",
  fontSize: "0.95rem",
  width: "fit-content",
  maxWidth: "100%",
};

const SUMMARY_PANEL: CSSProperties = {
  gridColumn: "1 / -1",
  display: "grid",
  gridTemplateColumns: "subgrid",
  alignItems: "baseline",
  border: "1px solid var(--line)",
  borderRadius: "var(--radius-sm)",
  padding: "0.5rem 0.85rem",
};

export function ProjectBomSummaryBar() {
  const ctx = useContext(ProjectBomSummaryContext);
  if (!ctx) return null;
  const { economics, labor, approvedExpenses, billed } = ctx;

  const totalList = economics.totalMsrp + labor.totalEst;
  const totalQuote = economics.totalQuote + labor.totalQuote;
  const totalSale = economics.totalSale + labor.totalSale;
  const totalSavings = totalList - totalSale;
  // Total: live material + labor profit − approved expenses; BOM row stays quote-based.
  const totalProfit =
    economics.outOfPocket + labor.profit - approvedExpenses;
  const totalMargin = totalSale > 0 ? totalProfit / totalSale : null;
  const quotedMaterialProfit = economics.quoteOutOfPocket;
  const quotedMaterialMargin =
    economics.totalSale > 0
      ? quotedMaterialProfit / economics.totalSale
      : null;

  return (
    <div className="project-bom-summary" style={SUMMARY_SHELL}>
      <div style={{ ...SUMMARY_PANEL, background: "#fff" }}>
        <span style={LABEL}>Total:</span>
        <span style={CELL}>Billed {formatMoney(billed)}</span>
        <span style={CELL}>Quote {formatMoney(totalQuote)}</span>
        <span style={CELL}>Sale {formatMoney(totalSale)}</span>
        <span style={CELL}>Savings {formatMoney(totalSavings)}</span>
        <span
          style={{
            ...CELL,
            ...outOfPocketStyle(totalProfit, totalSale),
          }}
        >
          Profit {formatSignedMoney(totalProfit)}
        </span>
        <span
          style={{
            ...CELL,
            ...outOfPocketStyle(totalProfit, totalSale),
          }}
        >
          Margin {totalMargin == null ? "—" : formatPct(totalMargin)}
        </span>
      </div>

      <div
        style={{
          ...SUMMARY_PANEL,
          gridTemplateRows: "auto auto",
          rowGap: "0.2rem",
          background: "transparent",
        }}
      >
        <span style={LABEL}>BOM:</span>
        <span style={CELL}>MSRP {formatMoney(economics.totalMsrp)}</span>
        <span style={CELL}>Quote {formatMoney(economics.totalQuote)}</span>
        <span style={CELL}>Sale {formatMoney(economics.totalSale)}</span>
        <span style={CELL}>
          Savings {formatMoney(economics.clientSavings)}
        </span>
        <span
          style={{
            ...CELL,
            ...outOfPocketStyle(quotedMaterialProfit, economics.totalSale),
          }}
          title="Sale − Quote (BOM pricing; not live PO cost)"
        >
          Quoted Material Profit {formatSignedMoney(quotedMaterialProfit)}
        </span>
        <span
          style={{
            ...CELL,
            ...outOfPocketStyle(quotedMaterialProfit, economics.totalSale),
          }}
        >
          Margin{" "}
          {quotedMaterialMargin == null ? "—" : formatPct(quotedMaterialMargin)}
        </span>

        <span style={LABEL}>Labor:</span>
        <span style={CELL}>EST {formatMoney(labor.totalEst)}</span>
        <span style={CELL}>Quote {formatMoney(labor.totalQuote)}</span>
        <span style={CELL}>Sale {formatMoney(labor.totalSale)}</span>
        <span style={CELL} />
        <span
          style={{
            ...CELL,
            ...outOfPocketStyle(labor.profit, labor.totalSale),
          }}
        >
          Labor Profit {formatSignedMoney(labor.profit)}
        </span>
        <span
          style={{
            ...CELL,
            ...outOfPocketStyle(labor.profit, labor.totalSale),
          }}
        >
          Margin {labor.margin == null ? "—" : formatPct(labor.margin)}
        </span>
      </div>
    </div>
  );
}
