"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

// ─── Color palette ────────────────────────────────────────────────────────────
const COLORS = [
  "#6366f1", // indigo
  "#10b981", // green
  "#f59e0b", // amber
  "#ef4444", // red
  "#3b82f6", // blue
  "#8b5cf6", // violet
  "#f97316", // orange
  "#14b8a6", // teal
];

const formatSol = (v: number) => `S/ ${v.toFixed(0)}`;

// ─── Custom Tooltip ───────────────────────────────────────────────────────────
function CustomBarTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, padding: "10px 14px", fontSize: 13 }}>
      <p style={{ fontWeight: 700, marginBottom: 4 }}>{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} style={{ color: p.color, margin: "2px 0" }}>
          {p.name}: <strong>{p.dataKey === "comisiones" ? formatSol(p.value) : p.value}</strong>
        </p>
      ))}
    </div>
  );
}

function CustomPieTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0];
  return (
    <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 8, padding: "10px 14px", fontSize: 13 }}>
      <p style={{ fontWeight: 700 }}>{d.name}</p>
      <p style={{ color: d.payload.fill }}>
        {d.payload.isAmount ? formatSol(d.value) : `${d.value} ventas`}
        {" "}({d.payload.percent?.toFixed(1)}%)
      </p>
    </div>
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────
export type CouponBarData = {
  code: string;
  usos: number;
  comisiones: number;
};

export type DonutData = {
  name: string;
  value: number;
  isAmount?: boolean;
  percent?: number;
};

// ═══════════════════════════════════════════════════════════════════════════════
// 1. Barras — Rendimiento por Cupón
// ═══════════════════════════════════════════════════════════════════════════════
export function CouponBarChart({ data }: { data: CouponBarData[] }) {
  if (!data.length) return <EmptyChart label="Sin datos de cupones" />;
  return (
    <div style={{ width: "100%", height: 280 }}>
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis dataKey="code" tick={{ fontSize: 12 }} />
          <YAxis yAxisId="left" orientation="left" tickFormatter={(v) => v} tick={{ fontSize: 11 }} />
          <YAxis yAxisId="right" orientation="right" tickFormatter={formatSol} tick={{ fontSize: 11 }} />
          <Tooltip content={<CustomBarTooltip />} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar yAxisId="left" dataKey="usos" name="Usos" fill="#6366f1" radius={[4, 4, 0, 0]} />
          <Bar yAxisId="right" dataKey="comisiones" name="Comisiones (S/)" fill="#10b981" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// 2. Donut — Ventas por Método de Pago
// ═══════════════════════════════════════════════════════════════════════════════
export function PaymentMethodDonut({ data }: { data: DonutData[] }) {
  if (!data.length) return <EmptyChart label="Sin datos de métodos de pago" />;
  const total = data.reduce((s, d) => s + d.value, 0);
  const enriched = data.map(d => ({ ...d, percent: (d.value / total) * 100 }));
  return (
    <div style={{ width: "100%", height: 280 }}>
      <ResponsiveContainer>
        <PieChart>
          <Pie
            data={enriched}
            cx="50%"
            cy="50%"
            innerRadius={65}
            outerRadius={100}
            paddingAngle={3}
            dataKey="value"
          >
            {enriched.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip content={<CustomPieTooltip />} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// 3. Donut — Ventas por Influencer
// ═══════════════════════════════════════════════════════════════════════════════
export function InfluencerDonut({ data }: { data: DonutData[] }) {
  if (!data.length) return <EmptyChart label="Sin datos de influencers" />;
  const total = data.reduce((s, d) => s + d.value, 0);
  const enriched = data.map(d => ({ ...d, isAmount: true, percent: (d.value / total) * 100 }));
  return (
    <div style={{ width: "100%", height: 280 }}>
      <ResponsiveContainer>
        <PieChart>
          <Pie
            data={enriched}
            cx="50%"
            cy="50%"
            innerRadius={65}
            outerRadius={100}
            paddingAngle={3}
            dataKey="value"
          >
            {enriched.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip content={<CustomPieTooltip />} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// 4. Donut — Descuento vs Ingreso Neto
// ═══════════════════════════════════════════════════════════════════════════════
export function DiscountVsNetDonut({ data }: { data: DonutData[] }) {
  if (!data.length) return <EmptyChart label="Sin datos financieros" />;
  const total = data.reduce((s, d) => s + d.value, 0);
  const enriched = data.map(d => ({ ...d, isAmount: true, percent: (d.value / total) * 100 }));
  return (
    <div style={{ width: "100%", height: 280 }}>
      <ResponsiveContainer>
        <PieChart>
          <Pie
            data={enriched}
            cx="50%"
            cy="50%"
            innerRadius={65}
            outerRadius={100}
            paddingAngle={3}
            dataKey="value"
          >
            <Cell fill="#10b981" />
            <Cell fill="#f59e0b" />
            <Cell fill="#6366f1" />
          </Pie>
          <Tooltip content={<CustomPieTooltip />} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Helper ───────────────────────────────────────────────────────────────────
function EmptyChart({ label }: { label: string }) {
  return (
    <div style={{ height: 280, display: "flex", alignItems: "center", justifyContent: "center", color: "#9ca3af", fontSize: 14 }}>
      {label}
    </div>
  );
}
